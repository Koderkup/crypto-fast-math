/**
 * crypto-fast-math benchmark
 *
 * Three questions are answered here:
 *
 *   1. Which input/output mode should I use?   ("Marshalling cost")
 *      For a 100k-element result the output conversion dominates the runtime of
 *      simple indicators, so the mode matters more than the algorithm.
 *
 *   2. How fast is each indicator, really?      ("Every indicator")
 *      Every indicator is timed in three native modes.
 *
 *   3. Native vs JavaScript, fairly.            ("Native vs JS")
 *      The previous version of this benchmark compared JS on number[] against
 *      native on Float64Array, which flattered the native side. Both input
 *      types are measured for both implementations here.
 *
 * Run: npm run build:ts && node benchmark.js
 */
const { performance } = require('perf_hooks');
const cfm = require('./dist/index.js');

// ===========================================================================
// Sample data: 100k candles
// ===========================================================================
const N = 100000;
const raw = Array.from({ length: N }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);
const prices = new Float64Array(raw);
const highs = new Float64Array(raw.map((p) => p + 2 + Math.random()));
const lows = new Float64Array(raw.map((p) => p - 2 - Math.random()));
const closes = prices;
const volumes = new Float64Array(Array.from({ length: N }, () => 1000 + Math.random() * 100));

// ===========================================================================
// Pure-JS reference implementations
//
// Deliberately competent (rolling sums instead of per-window loops where the
// algorithm allows it) — a benchmark against sloppy JavaScript would be as
// dishonest as the one it replaces. All of them work with number[] *and*
// Float64Array input, since they only ever index.
// ===========================================================================

function jsSMA(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  let win = 0;
  for (let i = 0; i < prices.length; i++) {
    win += prices[i];
    if (i >= period) win -= prices[i - period];
    if (i >= period - 1) out[i] = win / period;
  }
  return out;
}

function jsEMA(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  if (prices.length < period) return out;
  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += prices[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < prices.length; i++) {
    prev = alpha * prices[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function jsRSI(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  if (prices.length < period + 1) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  out[period] = al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + l) / period;
    out[i] = al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

// Rolling standard deviation of returns: O(n) via running sums.
function jsVolatility(prices, period) {
  const n = prices.length;
  const win = period - 1;
  const out = new Array(n).fill(NaN);
  if (win < 1 || n <= win) return out;
  const rets = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const prev = prices[i - 1];
    rets[i] = prev === 0 ? 0 : (prices[i] - prev) / prev;
  }
  let sum = 0, sumSq = 0;
  for (let i = 1; i <= win; i++) { sum += rets[i]; sumSq += rets[i] * rets[i]; }
  for (let i = win; i < n; i++) {
    if (i > win) {
      const add = rets[i], drop = rets[i - win];
      sum += add - drop;
      sumSq += add * add - drop * drop;
    }
    const mean = sum / win;
    out[i] = Math.sqrt(Math.max(0, sumSq / win - mean * mean));
  }
  return out;
}

function jsWMA(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < prices.length; i++) {
    let acc = 0;
    for (let k = 0; k < period; k++) acc += prices[i - period + 1 + k] * (k + 1);
    out[i] = acc / denom;
  }
  return out;
}

function jsTypicalPrice(high, low, close) {
  const out = new Array(close.length);
  for (let i = 0; i < close.length; i++) out[i] = (high[i] + low[i] + close[i]) / 3;
  return out;
}

// ===========================================================================
// Timing helpers
// ===========================================================================
function time(fn, iterations = 20) {
  for (let i = 0; i < 3; i++) fn(); // warmup
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = (performance.now() - t0) / iterations;
    if (elapsed < best) best = elapsed;
  }
  return best;
}

const ms = (v) => `${v.toFixed(3)} ms`;
const pad = (v, w) => String(v).padStart(w);

// ===========================================================================
// 1. Marshalling cost — why the mode matters more than the algorithm
// ===========================================================================
console.log('='.repeat(96));
console.log(`  1. Marshalling cost  (${N.toLocaleString('en-US')} elements)`);
console.log('='.repeat(96));

const oneHundredK = new Float64Array(N);
const asPlainArray = Array.from(oneHundredK);

console.log('  Pure conversion cost, no indicator involved:');
console.log(`    ${pad('Array.from(Float64Array)', 40)} ${pad(ms(time(() => Array.from(oneHundredK))), 10)}   <- what the addon used to do`);
console.log(`    ${pad('tight loop Float64Array -> number[]', 40)} ${pad(ms(time(() => {
  const n = oneHundredK.length; const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = oneHundredK[i];
  return out;
})), 10)}   <- what the default API does now`);
console.log(`    ${pad('Float64Array copy (no conversion)', 40)} ${pad(ms(time(() => oneHundredK.slice())), 10)}   <- what { output: 'typed' } does`);
console.log(`    ${pad('number[] -> Float64Array (input cast)', 40)} ${pad(ms(time(() => Float64Array.from(asPlainArray))), 10)}   <- cost of NOT passing a Float64Array`);
console.log();

// ===========================================================================
// 2. Every indicator, in the three native modes
// ===========================================================================
console.log('='.repeat(96));
console.log('  2. Every indicator — native cost per call');
console.log('='.repeat(96));
console.log('  ' + pad('indicator', 20) + pad('number[] in', 13) + pad('f64 -> number[]', 15) + pad('f64 -> typed', 13) + '   note');
console.log('  ' + '-'.repeat(92));

// `fn(source, opts)` — source is either a number[] or a Float64Array.
const SPECS = [
  ['SMA (20)', (s, o) => cfm.smaSync(s, 20, o), ''],
  ['EMA (12)', (s, o) => cfm.emaSync(s, 12, o), ''],
  ['RSI (14)', (s, o) => cfm.rsiSync(s, 14, o), ''],
  ['Volatility (26)', (s, o) => cfm.volatilitySync(s, 26, o), 'O(n*period)'],
  ['WMA (20)', (s, o) => cfm.wmaSync(s, 20, o), 'O(n*period)'],
  ['HMA (9)', (s, o) => cfm.hmaSync(s, 9, o), ''],
  ['Momentum (10)', (s, o) => cfm.momentumSync(s, 10, o), ''],
  ['ROC (10)', (s, o) => cfm.rocSync(s, 10, o), ''],
  ['Median price', (s, o) => cfm.medianPriceSync(s, s, o), '2 columns'],
  ['Typical price', (s, o) => cfm.typicalPriceSync(s, s, s, o), '3 columns'],
  ['Bullish impulse', (s) => cfm.bullishImpulseSync(s), 'Uint8Array'],
  ['Bearish impulse', (s) => cfm.bearishImpulseSync(s), 'Uint8Array'],
  ['Stochastic (14,3)', (s, o) => cfm.stochasticSync(s, s, s, 14, 3, o), 'O(n*period)'],
  ['ATR (14)', (s, o) => cfm.atrSync(s, s, s, 14, o), 'O(n*period)'],
  ['ADX (14)', (s, o) => cfm.adxSync(s, s, s, 14, o), 'O(n*period)'],
  ['CCI (20)', (s, o) => cfm.cciSync(s, s, s, 20, o), 'O(n*period)'],
  ['Williams %R (14)', (s, o) => cfm.williamsRSync(s, s, s, 14, o), 'O(n*period)'],
  ['Parabolic SAR', (s, o) => cfm.parabolicSARSync(s, s, 0.02, 0.2, o), ''],
  ['Keltner (20,2)', (s, o) => cfm.keltnerSync(s, s, s, 20, 2, o), 'O(n*period)'],
  ['Donchian (20)', (s, o) => cfm.donchianSync(s, s, 20, o), ''],
  ['Ichimoku', (s, o) => cfm.ichimokuSync(s, s, s, o), '5 outputs'],
  ['Bollinger (20,2)', (s, o) => cfm.bollingerSync(s, 20, undefined, o), '3 outputs'],
  ['MACD (12,26,9)', (s, o) => cfm.macdSync(s, 12, 26, 9, o), '3 outputs'],
  ['VWAP', (s, o) => cfm.vwapSync(s, s, s, volumes, o), '4 columns'],
  ['OBV', (s, o) => cfm.obvSync(s, volumes, o), '2 columns'],
];

const TYPED = { output: 'typed' };
const results = [];
for (const [name, fn, note] of SPECS) {
  const plain = time(() => fn(raw));
  const fromF64 = time(() => fn(prices));
  const typed = time(() => fn(prices, TYPED));
  results.push({ name, plain, fromF64, typed });
  console.log('  ' + pad(name, 20) + pad(ms(plain), 13) + pad(ms(fromF64), 15) + pad(ms(typed), 13) + '   ' + note);
}

const formula = '(High - Low) / Close * Volume * sin(Close)';
const params = { High: highs, Low: lows, Close: closes, Volume: volumes };
const formulaPlain = time(() => cfm.calculateSync({ formula, params, returnType: 'number' }));
const formulaTyped = time(() => cfm.calculateSync({ formula, params, returnType: 'number' }, TYPED));
results.push({ name: 'ExprTk formula', plain: formulaPlain, fromF64: formulaPlain, typed: formulaTyped });
console.log('  ' + pad('ExprTk formula', 20) + pad(ms(formulaPlain), 13) + pad('(same)', 15) + pad(ms(formulaTyped), 13) + '   4 columns');
console.log();


// ===========================================================================
// 3. Native vs JavaScript — both input types measured on both sides
// ===========================================================================
console.log('='.repeat(96));
console.log('  3. Native vs JS — same algorithm, both input types');
console.log('='.repeat(96));
console.log('  ' + pad('indicator', 18) + pad('JS number[]', 12) + pad('JS Float64Array', 16) + pad('native f64->arr', 17) + pad('native typed', 13) + '  verdict');
console.log('  ' + '-'.repeat(92));

const COMPARISONS = [
  ['SMA (20)', (s) => jsSMA(s, 20), (s, o) => cfm.smaSync(s, 20, o)],
  ['EMA (12)', (s) => jsEMA(s, 12), (s, o) => cfm.emaSync(s, 12, o)],
  ['RSI (14)', (s) => jsRSI(s, 14), (s, o) => cfm.rsiSync(s, 14, o)],
  ['Volatility (26)', (s) => jsVolatility(s, 26), (s, o) => cfm.volatilitySync(s, 26, o)],
  ['WMA (20)', (s) => jsWMA(s, 20), (s, o) => cfm.wmaSync(s, 20, o)],
  ['Typical price', (s) => jsTypicalPrice(s, s, s), (s, o) => cfm.typicalPriceSync(s, s, s, o)],
];

for (const [name, jsFn, nativeFn] of COMPARISONS) {
  const jsArr = time(() => jsFn(raw));
  const jsF64 = time(() => jsFn(prices));
  const natArr = time(() => nativeFn(prices));
  const natTyped = time(() => nativeFn(prices, TYPED));
  const verdict = natTyped < jsF64
    ? `${(jsF64 / natTyped).toFixed(1)}x faster than JS`
    : `${(natTyped / jsF64).toFixed(2)}x slower than JS`;
  console.log('  ' + pad(name, 18) + pad(ms(jsArr), 12) + pad(ms(jsF64), 16) + pad(ms(natArr), 17) + pad(ms(natTyped), 13) + '  ' + verdict);
}

// The custom-formula path is where the ExprTk engine really pays off.
const jsFormula = () => {
  const n = closes.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = ((highs[i] - lows[i]) / closes[i]) * volumes[i] * Math.sin(closes[i]);
  return out;
};
const jsFormulaMs = time(jsFormula);
const natFormulaArr = time(() => cfm.calculateSync({ formula, params, returnType: 'number' }));
const natFormulaTyped = time(() => cfm.calculateSync({ formula, params, returnType: 'number' }, TYPED));
const fRatio = jsFormulaMs / natFormulaTyped;
const fVerdict = fRatio >= 1
  ? `${fRatio.toFixed(1)}x faster than JS`
  : `${(natFormulaTyped / jsFormulaMs).toFixed(1)}x slower than JS`;
console.log('  ' + pad('ExprTk formula', 18) + pad(ms(jsFormulaMs), 12) + pad(ms(jsFormulaMs), 16) + pad(ms(natFormulaArr), 17) + pad(ms(natFormulaTyped), 13) + '  ' + fVerdict);
console.log();

// ===========================================================================
// Summary
// ===========================================================================
console.log('='.repeat(96));
console.log('  Summary');
console.log('='.repeat(96));
const fastest = [...results].sort((a, b) => a.typed - b.typed);
const slowest = [...results].sort((a, b) => b.typed - a.typed);
const arrayPenalty = results.map((r) => r.fromF64 / r.typed);
const worst = Math.max(...arrayPenalty);
const best = Math.min(...arrayPenalty);
console.log(`  fastest indicators (typed): ${fastest.slice(0, 3).map((r) => `${r.name} ${ms(r.typed)}`).join(', ')}`);
console.log(`  slowest indicators (typed): ${slowest.slice(0, 3).map((r) => `${r.name} ${ms(r.typed)}`).join(', ')}`);
console.log(`  cost of asking for number[] instead of Float64Array: ${best.toFixed(2)}x - ${worst.toFixed(2)}x`);
console.log('='.repeat(96));

