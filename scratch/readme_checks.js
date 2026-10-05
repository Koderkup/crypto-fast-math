// Spot-check README examples against the built package.
const cfm = require('../dist/index.js');

const c = [100, 101, 102, 103, 104, 105];
const e = [99, 100, 101, 102, 103, 104];
const p = { Close: c, EMA50: e };

const tests = [
  '!(Close < EMA50)',
  '!(Close)',
  'Close > EMA50 | EMA50 < Close',
  'Close > EMA50 or EMA50 < Close',
  'Close > EMA50 ^ EMA50 < Close',
];
for (const f of tests) {
  try {
    const res = cfm.calculateSync({ formula: f, params: p });
    console.log('OK  ', JSON.stringify(f), '->', typeof res[0], JSON.stringify(res.slice(0, 3)));
  } catch (err) {
    console.log('FAIL', JSON.stringify(f), '->', String(err.message).slice(0, 70));
  }
}
