
// Verifies that prebuilds/ contains the expected platform binaries.
// Usage:
//   node scripts/check-prebuilds.js            — check all 5 supported targets
//   node scripts/check-prebuilds.js linux-x64  — check only the listed targets
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'win32-x64',
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
];
const FILE = 'crypto-fast-math.node';

const targets = process.argv.slice(2);
const toCheck = targets.length > 0 ? targets : REQUIRED;

const missing = toCheck.filter(
  (t) => !fs.existsSync(path.join('prebuilds', t, FILE))
);

if (missing.length > 0) {
  console.error(`Missing prebuilds: ${missing.join(', ')}`);
  console.error('Run the CI matrix (prebuilds.yml) or `npm run prebuild` on each target platform.');
  process.exit(1);
}

console.log(`All prebuilds present: ${toCheck.join(', ')}`);
