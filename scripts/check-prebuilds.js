
// Verifies that prebuilds/ contains the expected platform binaries.
// Usage:
//   node scripts/check-prebuilds.js            — check every target below
//   node scripts/check-prebuilds.js linux-x64  — check only the listed targets
//
// NOTE (musl): node-gyp-build resolves prebuilds/<platform>-<arch>/ using
// process.platform ('linux') — there is NO linuxmusl-* directory. The libc is
// selected by filename tag inside the linux-<arch> folder: the Alpine CI jobs
// run `prebuildify --tag-libc`, which emits crypto-fast-math.musl.node next
// to the glibc crypto-fast-math.node, and node-gyp-build picks the right one
// via its isAlpine()/libc tag matching.
const fs = require('fs');
const path = require('path');

const FILE = 'crypto-fast-math.node';
const MUSL_FILE = 'crypto-fast-math.musl.node';

// target id -> files (relative to prebuilds/) that must exist for that target
const REQUIRED = {
  'win32-x64': [`win32-x64/${FILE}`],
  'linux-x64': [`linux-x64/${FILE}`],
  'linux-arm64': [`linux-arm64/${FILE}`],
  'linuxmusl-x64': [`linux-x64/${MUSL_FILE}`],
  'linuxmusl-arm64': [`linux-arm64/${MUSL_FILE}`],
  'darwin-x64': [`darwin-x64/${FILE}`],
  'darwin-arm64': [`darwin-arm64/${FILE}`],
};

const targets = process.argv.slice(2);
const toCheck = targets.length > 0 ? targets : Object.keys(REQUIRED);

const unknown = toCheck.filter((t) => !(t in REQUIRED));
if (unknown.length > 0) {
  console.error(`Unknown target(s): ${unknown.join(', ')}`);
  console.error(`Known targets: ${Object.keys(REQUIRED).join(', ')}`);
  process.exit(1);
}

const missing = toCheck
  .flatMap((t) => REQUIRED[t])
  .filter((rel) => !fs.existsSync(path.join('prebuilds', rel)));

if (missing.length > 0) {
  console.error(`Missing prebuilds: ${missing.join(', ')}`);
  console.error('Run the CI matrix (prebuilds.yml) or `npm run prebuild` on each target platform.');
  process.exit(1);
}

console.log(`All prebuilds present: ${toCheck.join(', ')}`);

