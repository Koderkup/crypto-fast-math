/**
 * Benchmark: native C++ addon vs pure JavaScript implementations
 * Compares hot-path trading math operations.
 */
const { performance } = require('perf_hooks');
const cfm = require('node-gyp-build')(require('path').join(__dirname));

// ===========================================================================
// Sample data: 100k candles
// ===========================================================================
const N = 100000;
const raw = Array.from({ length: N }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2);
const prices = new Float64Array(raw);
const highs  = new Float64Array(raw.map(p => p + 2 + Math.random()));
const lows   = new Float64Array(raw.map(p => p - 2 - Math.random()));
const closes = prices;
const volumes = new Float64Array(Array.from({ length: N }, () => 1000 + Math.random() * 100));

// JS Array copies for JS reference implementations
const jsPrices = raw;
const jsHighs = Array.from(highs);
const jsLows = Array.from(lows);
const jsCloses = Array.from(closes);
const jsVolumes = Array.from(volumes);

// ===========================================================================
// Pure-JS reference implementations
// ===========================================================================

// Returns: rolling std-dev of returns (same algorithm as our C++)
function jsVolatility(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  for (let i = period - 1; i < prices.length; i++) {
    const rets = [];
    for (let k = 1; k < period; k++) {
      const idx = i - period + k;
      if (idx === 0) continue;
      const prev = prices[idx - 1];
      const r = prev === 0 ? 0 : (prices[idx] - prev) / prev;
      rets.push(r);
    }
    if (rets.length === 0) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const var_ = rets.reduce((a, b) => a + (b - mean) ** 2, 0);
    out[i] = Math.sqrt(var_ / rets.length);
  }
  return out;
}

// SMA
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

// EMA
function jsEMA(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  if (prices.length < period) return out;
  const alpha = 2 / (period + 1);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  sma /= period;
  out[period - 1] = sma;
  let prev = sma;
  for (let i = period; i < prices.length; i++) {
    prev = alpha * prices[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

// RSI (Wilder)
function jsRSI(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  if (prices.length < period + 1) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  const rsi = l => l === 0 ? 100 : g => g === 0 ? 0 : 100 - 100 / (1 + g / l);
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

// Typical price
function jsTypicalPrice(high, low, close) {
  return high.map((h, i) => (h + low[i] + close[i]) / 3);
}

// WMA — linearly weighted moving average (weight period..1)
function jsWMA(prices, period) {
  const out = new Array(prices.length).fill(NaN);
  const denom = period * (period + 1) / 2;
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += prices[i - j] * (period - j);
    out[i] = sum / denom;
  }
  return out;
}

// Williams %R
function jsWilliamsR(high, low, close, period) {
  const n = close.length;
  const out = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = 0; j < period; j++) {
      const idx = i - period + 1 + j;
      if (high[idx] > hh) hh = high[idx];
      if (low[idx] < ll) ll = low[idx];
    }
    const range = hh - ll;
    out[i] = range === 0 ? 0 : ((hh - close[i]) / range) * 100;
  }
  return out;
}

// Stochastic %K / %D
function jsStochastic(high, low, close, kPeriod, dPeriod) {
  const n = close.length;
  const k = new Array(n).fill(NaN);
  const d = new Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      const idx = i - kPeriod + 1 + j;
      if (high[idx] > hh) hh = high[idx];
      if (low[idx] < ll) ll = low[idx];
    }
    const range = hh - ll;
    k[i] = range === 0 ? 0 : ((close[i] - ll) / range) * 100;
  }
  for (let i = kPeriod - 1 + dPeriod - 1; i < n; i++) {
    let sum = 0, valid = true;
    for (let j = 0; j < dPeriod; j++) {
      const v = k[i - dPeriod + 1 + j];
      if (Number.isNaN(v)) { valid = false; break; }
      sum += v;
    }
    if (valid) d[i] = sum / dPeriod;
  }
  return { k, d };
}

// ===========================================================================
// Generic benchmark runner
// ===========================================================================
function bench(label, nativeFn, jsFn, iterations = 50) {
  // Warmup
  nativeFn(); jsFn();

  // Native
  let t0 = performance.now();
  for (let i = 0; i < iterations; i++) nativeFn();
  const nativeMs = (performance.now() - t0) / iterations;

  // JS
  t0 = performance.now();
  for (let i = 0; i < iterations; i++) jsFn();
  const jsMs = (performance.now() - t0) / iterations;

  const speedup = jsMs / nativeMs;
  console.log(`  ${label.padEnd(28)} JS ${jsMs.toFixed(3).padStart(6)} ms  |  native ${nativeMs.toFixed(3).padStart(6)} ms  |  ${speedup.toFixed(1)}x faster`);
}

console.log('='.repeat(90));
console.log('  crypto-fast-math benchmark (N=100k candles, avg of 50 runs)');
console.log('='.repeat(90));

console.log('--- Simple single-pass indicators (JS<->C++ marshalling overhead dominates) ---');
bench('SMA(period=20)',      () => cfm.smaSync(prices, 20),   () => jsSMA(jsPrices, 20));
bench('EMA(period=12)',       () => cfm.emaSync(prices, 12),   () => jsEMA(jsPrices, 12));
bench('RSI(period=14)',       () => cfm.rsiSync(prices, 14),   () => jsRSI(jsPrices, 14));
bench('Volatility(period=26)',() => cfm.volatilitySync(prices, 26), () => jsVolatility(jsPrices, 26));

console.log('--- Multi-column / O(n*period) indicators (native compute dominates) ---');
bench('Typical Price',        () => cfm.typicalPriceSync(highs, lows, closes), () => jsTypicalPrice(jsHighs, jsLows, jsCloses));
bench('WMA(period=20)',       () => cfm.wmaSync(prices, 20),   () => jsWMA(jsPrices, 20));
bench('Williams %R(period=14)', () => cfm.williamsRSync(highs, lows, closes, 14), () => jsWilliamsR(jsHighs, jsLows, jsCloses, 14));
bench('Stochastic(14,3)',     () => cfm.stochasticSync(highs, lows, closes, 14, 3), () => jsStochastic(jsHighs, jsLows, jsCloses, 14, 3));

// Custom ExprTk formula benchmark
const formula = '(High - Low) / Close * Volume * sin(Close)';
const params = { High: highs, Low: lows, Close: closes, Volume: volumes };

console.log('='.repeat(90));
console.log('  Custom ExprTk formula: (High - Low) / Close * Volume * sin(Close)');
console.log('='.repeat(90));

let t0 = performance.now();
for (let i = 0; i < 50; i++) cfm.calculateSync({ formula, params, returnType: 'number' });
const nativeFormula = (performance.now() - t0) / 50;

// JS equivalent
function jsFormula(h, l, c, v) {
  const out = new Array(c.length);
  for (let i = 0; i < c.length; i++) {
    out[i] = (h[i] - l[i]) / c[i] * v[i] * Math.sin(c[i]);
  }
  return out;
}

t0 = performance.now();
for (let i = 0; i < 50; i++) jsFormula(Array.from(highs), Array.from(lows), jsPrices, Array.from(volumes));
const jsFormulaMs = (performance.now() - t0) / 50;

const speedup = jsFormulaMs / nativeFormula;
console.log(`  ${'ExprTk formula'.padEnd(28)} JS ${jsFormulaMs.toFixed(3).padStart(6)} ms  |  native ${nativeFormula.toFixed(3).padStart(6)} ms  |  ${speedup.toFixed(1)}x faster`);
console.log('='.repeat(90));
