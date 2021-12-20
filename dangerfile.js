const { danger, fail, warn } = require("danger");

const commitFiles = [
  ...danger.git.created_files,
  ...danger.git.deleted_files,
  ...danger.git.modified_files,
];

const RegExps = {
  lockfile: /(.*)package-lock\.json/i,
  packageJson: /(.*)package\.json/i,
  alphaBeta: /alpha|beta/i,
};

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

const formatMessages = (summary = "", mdContent = []) => {
  return `
<details><summary>${summary}</summary>

${mdContent.join("\r\n")}
</details>`;
};

function lockfileCheck() {
  for (let commitFile of commitFiles) {
    const matched = commitFile.match(RegExps.lockfile);
    if (matched) {
      const hasPackageChanges = !!commitFiles.some(
        (modified) => modified === `${matched[1]}package.json`
      );
      if (!hasPackageChanges) {
        fail(
          `There are \`${commitFile}\` changes with no corresponding package.json changes`
        );
      }
    }
  }
}

function requireModifyCheck(config = ["CHANGELOG.md", "README.md"]) {
  const modified = danger.git.modified_files;
  const failedReasons = [];
  for (let cfg of config) {
    if (!modified.includes(cfg)) {
      failedReasons.push(`- ${cfg}`);
    }
  }
  if (failedReasons.length > 0) {
    warn(
      formatMessages(
        "There are files that must be modified but this MR does not include",
        failedReasons
      )
    );
  }
  return true;
}

function versionCheck() {
  const noBeta = true;
  const locked = [
    {
      name: "danger",
      reason: "https://github.com/danger/danger-js/issues/1106",
      version: "10.6.0",
    },
  ];
  for (let commitFile of commitFiles) {
    if (commitFile.match(RegExps.packageJson)) {
      danger.git.JSONDiffForFile(commitFile).then((packageDiff) => {
        const dpd = Object.assign(
          packageDiff.dependencies,
          packageDiff.devDependencies
        );
        Object.entries(dpd.after).forEach(([pck, newVer]) => {
          const lockedPck = locked.find((value) => value.name === pck);
          const trimmedVer = String(newVer).trim();
          if (lockedPck && !!newVer) {
            const lockedVer = lockedPck.version;
            if (trimmedVer !== lockedVer) {
              fail(
                `Do not upgrade \`${lockedPck.name}\`, due to: ${lockedPck.reason}`
              );
            }
          }
          if (noBeta)
            if (trimmedVer.match(RegExps.alphaBeta)) {
              fail(`Do not contain beta version of \`${pck}\``);
            }
        });
      });
    }
  }
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
      warn(`
### This MR modified files belonging to other groups!

${formatMessages("Modified ranges", modified)}`);
    }
  }
}

function branchCheck() {
  if (
    ["master", "main", "develop", "dev", "qa"].indexOf(
      danger.gitlab.mr.target_branch
    ) < 0
  ) {
    process.exit(0);
  }
}

branchCheck();
mrInfoCheck();
rangeCheck();
requireModifyCheck();
lockfileCheck();
versionCheck();
