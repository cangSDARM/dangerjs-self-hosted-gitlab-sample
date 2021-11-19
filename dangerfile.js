const { danger, fail, warn, schedule, markdown } = require("danger");
const includes = require("lodash.includes");
const find = require("lodash.find");

const commitFiles = [
  ...danger.git.created_files,
  ...danger.git.deleted_files,
  ...danger.git.modified_files,
];

/** Compare whether the corresponding *same-level* dirs under the repo have been modified at the same time
 * @param {String} rootDir Corresponds to the root path of the directory at the same level,
 * @param {String[]} ranges Corresponding to the same level directories
 * @returns {String[]} The modified directory path
 */
const dirChangedInSameMR = (rootDir, ranges) => {
  const hasRangeChanged = ranges.map((part) => {
    const path = `${rootDir}/${part}/`;
    return !!find(commitFiles, (commitFile) => commitFile.startsWith(path));
  });

  for (let i = 0; i < hasRangeChanged.length; i++) {
    if (hasRangeChanged[i]) {
      const modified = hasRangeChanged
        .map((range, idx) => (range ? `${rootDir}/${ranges[idx]}` : ""))
        .filter(Boolean);
      if (modified) {
        return modified;
      }
    }
  }
  return [];
};

function lockfileCheck() {
  const hasPackageChanges = includes(danger.git.modified_files, "package.json");
  const hasYarnLockfileChanges = includes(commitFiles, "yarn.lock");
  const hasNpmLockfileChanges = includes(commitFiles, "package-lock.json");
  if (hasYarnLockfileChanges || hasNpmLockfileChanges) {
    if (!hasPackageChanges) {
      fail(
        "There are lockfile changes with no corresponding package.json changes"
      );
    }
  }
}

function changelogCheck() {
  const hasChangeLogChanges =
    danger.git.modified_files.includes("CHANGELOG.md");
  if (!hasChangeLogChanges) {
    warn("Please add a changelog for your changes");
  }
}

function versionCheck() {
  schedule(async () => {
    const packageDiff = await danger.git.JSONDiffForFile("package.json");
    if (!packageDiff.dependencies) return;

    /**
     * Ensure that the version of a specific package will not be changed
     * @see https://danger.systems/js/tutorials/dependencies.html
     * @param {String} package package name
     * @param {String} ver version
     * @param {String} compared optional. like: `^10.5.1`, the compared will be `^`
     * @param {String} reason Why is it locked?
     */
    const verCheck = async (package, ver, compared, reason) => {
      try {
        if (packageDiff.dependencies && !!packageDiff.dependencies.after) {
          const lockedVer = String(compared).trim() + String(ver).trim();
          const newPackageVer = packageDiff.dependencies.after[package];

          if (!!newPackageVer) {
            if (String(newPackageVer).trim() !== lockedVer) {
              fail(`Do not update package(${package}), due to: ${reason}`);
            }
          }
        }
      } catch (e) {
        fail(`version check failed! ${e}`);
      }
    };

    await verCheck(
      "danger",
      "10.5.4",
      "",
      "this issue: https://github.com/danger/danger-js/issues/1106"
    );
  });
}

function mrInfoCheck() {
  if (danger.gitlab.mr.description.length < 10) {
    warn("This MR needs a sufficiently accurate description.");
  }

  if (danger.gitlab.mr.title.toLocaleUpperCase().includes("WIP")) {
    warn(
      "If you want merge this MR, it's required to rename WIP part to something else."
    );
  }
}

function rangeCheck() {
  // match specific repo
  if (danger.gitlab.metadata.repoSlug.match(/.*(your-project).*/gi)) {
    const modified = dirChangedInSameMR("src/pages", [
      "Group1",
      "Group2",
      "Group3",
      "Group4",
    ]);
    if (modified.length > 0) {
      markdown(
        `## WARN!
### This MR modified files belonging to other groups!

<details><summary>Modified ranges</summary>

${modified.map((item) => "- `" + item + "`").join("\n")}
</details>`
      );
    }
  }
}

mrInfoCheck();
rangeCheck();
changelogCheck();
lockfileCheck();
versionCheck();
