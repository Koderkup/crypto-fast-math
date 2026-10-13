'use strict';
/**
 * benchmark-baseline.js — reproducible multi-size baseline for crypto-fast-math.
 *
 * Answers, with recorded methodology:
 *   1. What does a full public-API call cost end-to-end (JS refs vs native sync
 *      typed/default/array-in vs native async vs technicalindicators vs tulind)?
 *   2. Where are the JS/native crossover points per operation?
 *   3. What are the fixed boundary/marshalling costs?
 *   4. Does the async API keep the event loop responsive?
 *
 * Methodology
 *   - Deterministic input (no randomness): p[i] = 100 + i*0.5 + sin(i)*2.
 *   - Warm-up: 3 iterations (1 if a single call exceeds 50 ms).
 *   - Adaptive batch: enough iterations for >= 60 ms per round (capped), 3 rounds,
 *     report MEDIAN ms/operation.
 *   - Every comparison is preceded by a correctness check (NaN-aware, rtol=1e-6);
 *     mismatches are printed with max error but never abort the run.
 *   - Competitors receive their native input type (number[]); each library is
 *     measured on the API it actually exposes (tulind is async/promise-only).
 *   - Output lengths differ by design: cfm returns full-length arrays with a NaN
 *     warm-up; technicalindicators/tulind drop warm-up values. Competitors are
 *     compared tail-aligned.
 *
 * Run: npm run build:ts && npm run build:cpp && node benchmark-baseline.js
 * (memory section runs only when invoked with --expose-gc: node --expose-gc benchmark-baseline.js)
 */
const { performance, monitorEventLoopDelay } = require('perf_hooks');
const os = require('os');

const cfm = require('./dist/index.js');
const TYPED = { output: 'typed' };

// ---------------------------------------------------------------------------
// Environment record
// ---------------------------------------------------------------------------
const cpus = os.cpus();
const ENV = {
  node: process.version,
  v8: process.versions.v8,
  uv: process.versions.uv,
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: cpus.length ? cpus[0].model : 'unknown',
  cores: `${cpus.length} logical`,
  memGB: (os.totalmem() / 2 ** 30).toFixed(1),
  date: new Date().toISOString(),
  uvThreadpool: process.env.UV_THREADPOOL_SIZE || '4 (default)',
};

// ---------------------------------------------------------------------------
// Deterministic data
// ---------------------------------------------------------------------------
function makeData(n) {
  const prices = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const volume = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = 100 + i * 0.5 + Math.sin(i) * 2;
    prices[i] = p;
    high[i] = p + 2 + Math.abs(Math.sin(i * 1.7));
    low[i] = p - 2 - Math.abs(Math.cos(i * 1.3));
    volume[i] = 1000 + (i % 97);
  }
  return { prices, high, low, volume, pricesArr: Array.from(prices) };
}

// ---------------------------------------------------------------------------
// Pure-JS reference implementations (rolling sums where the math allows it).
// These are the "competent JS" baseline — same semantics as the C++ core.
// ---------------------------------------------------------------------------
function jsSMA(p, period) {
  const n = p.length;
  const out = new Array(n).fill(NaN);
  let win = 0;
  for (let i = 0; i < n; i++) {
    win += p[i];
    if (i >= period) win -= p[i - period];
    if (i >= period - 1) out[i] = win / period;
  }
  return out;
}

function jsEMA(p, period) {
  const n = p.length;
  const out = new Array(n).fill(NaN);
  if (n < period) return out;
  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += p[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < n; i++) {
    prev = alpha * p[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function jsRSI(p, period) {
  const n = p.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = p[i] - p[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  out[period] = al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < n; i++) {
    const d = p[i] - p[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + l) / period;
    out[i] = al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

// Mirrors cfm::volatility: output i uses returns r(idx), idx in
// [max(1, i-period+1), i-1]; emitted only when count>0 (all finite here).
function jsVolatility(p, period) {
  const n = p.length;
  const out = new Array(n).fill(NaN);
  if (period <= 0) return out;
  const ret = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const prev = p[i - 1];
    ret[i] = prev === 0 ? 0 : (p[i] - prev) / prev;
  }
  let sum = 0, sumSq = 0, count = 0;
  let lo = 1, hi = period - 2;
  for (let idx = lo; idx <= hi && idx < n; idx++) { sum += ret[idx]; sumSq += ret[idx] * ret[idx]; count++; }
  for (let i = period - 1; i < n; i++) {
    if (count > 0) {
      const mean = sum / count;
      const v = sumSq / count - mean * mean;
      out[i] = Math.sqrt(v < 0 ? 0 : v);
    }
    // shift window to [max(1, i+2-period), i]
    const nextLo = Math.max(1, i + 2 - period);
    while (lo < nextLo) { sum -= ret[lo]; sumSq -= ret[lo] * ret[lo]; count--; lo++; }
    if (i + 1 < n && i >= 1) { sum += ret[i]; sumSq += ret[i] * ret[i]; count++; }
  }
  return out;
}

function jsWMA(p, period) {
  const n = p.length;
  const out = new Array(n).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < period; k++) acc += p[i - period + 1 + k] * (k + 1);
    out[i] = acc / denom;
  }
  return out;
}


function jsMACD(p, fastP, slowP, sigP) {
  const n = p.length;
  const fast = jsEMA(p, fastP);
  const slow = jsEMA(p, slowP);
  const macd = new Array(n).fill(NaN);
  const start = slowP - 1;
  for (let i = start; i < n; i++) macd[i] = fast[i] - slow[i];
  // signal = EMA(sigP) seeded on the FIRST VALID macd values (matches fixed C++)
  const signal = new Array(n).fill(NaN);
  const seedEnd = start + sigP;
  if (n > start && seedEnd <= n) {
    let sum = 0;
    for (let i = start; i < seedEnd; i++) sum += macd[i];
    let prev = sum / sigP;
    signal[seedEnd - 1] = prev;
    const alpha = 2 / (sigP + 1);
    for (let i = seedEnd; i < n; i++) {
      prev = alpha * macd[i] + (1 - alpha) * prev;
      signal[i] = prev;
    }
  }
  const histogram = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(signal[i]) && !Number.isNaN(macd[i])) histogram[i] = macd[i] - signal[i];
  }
  return { macd, signal, histogram };
}

function jsBollinger(p, period, k) {
  const n = p.length;
  const upper = new Array(n).fill(NaN);
  const middle = new Array(n).fill(NaN);
  const lower = new Array(n).fill(NaN);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    sum += p[i]; sumSq += p[i] * p[i];
    if (i >= period) { sum -= p[i - period]; sumSq -= p[i - period] * p[i - period]; }
    if (i >= period - 1) {
      const mean = sum / period;
      let varr = sumSq / period - mean * mean; // population variance
      if (varr < 0) varr = 0;
      const sd = Math.sqrt(varr);
      middle[i] = mean; upper[i] = mean + k * sd; lower[i] = mean - k * sd;
    }
  }
  return { upper, middle, lower };
}

function jsFormula(high, low, close, volume) {
  const n = close.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = ((high[i] - low[i]) / close[i]) * volume[i] * Math.sin(close[i]);
  return out;
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------
const fmt = (ms) => (ms >= 100 ? ms.toFixed(1) : ms >= 10 ? ms.toFixed(2) : ms.toFixed(3));
const pad = (v, w) => String(v).padStart(w);

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Median ms/operation for a synchronous function. */
function timeSync(fn, opts = {}) {
  const minBatch = opts.minBatchMs ?? 60;
  const rounds = opts.rounds ?? 3;
  const maxIters = opts.maxIters ?? 50000;
  const p0 = performance.now();
  fn();
  const probe = Math.max(performance.now() - p0, 1e-6);
  const warm = probe > 50 ? 1 : (opts.warm ?? 3);
  for (let i = 1; i < warm; i++) fn();
  let iters = Math.max(1, Math.min(Math.ceil(minBatch / probe), maxIters));
  const times = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    times.push((performance.now() - t0) / iters);
  }
  return median(times);
}

/** Median ms/operation for a function returning a Promise. */
async function timeAsync(fn, opts = {}) {
  const minBatch = opts.minBatchMs ?? 60;
  const rounds = opts.rounds ?? 3;
  const maxIters = opts.maxIters ?? 2000;
  await fn(); // warm-up
  const p0 = performance.now();
  await fn();
  const probe = Math.max(performance.now() - p0, 1e-6);
  const iters = Math.max(1, Math.min(Math.ceil(minBatch / probe), maxIters));
  const times = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) await fn();
    times.push((performance.now() - t0) / iters);
  }
  return median(times);
}

// ---------------------------------------------------------------------------
// Correctness comparison (tail-aligned, NaN-aware, never aborts the run)
// ---------------------------------------------------------------------------
function tailCompare(a, b, rtol = 1e-6) {
  const norm = (x) => {
    if (x == null) return [];
    if (Array.isArray(x) || ArrayBuffer.isView(x)) return [x];
    return Object.values(x).filter((v) => Array.isArray(v) || ArrayBuffer.isView(v));
  };
  const A = norm(a), B = norm(b);
  if (A.length !== B.length) return { ok: false, maxRel: NaN, checked: 0, note: `component count ${A.length} vs ${B.length}` };
  let maxRel = 0, checked = 0;
  for (let c = 0; c < A.length; c++) {
    const x = A[c], y = B[c];
    const m = Math.min(x.length, y.length);
    for (let i = 0; i < m; i++) {
      const xv = x[x.length - m + i], yv = y[y.length - m + i];
      const xn = Number.isNaN(xv), yn = Number.isNaN(yv);
      if (xn && yn) continue;
      if (xn !== yn) return { ok: false, maxRel: Infinity, checked, note: `NaN pattern differs (component ${c}, tail offset ${i})` };
      checked++;
      const rel = Math.abs(xv - yv) / Math.max(1e-12, Math.abs(xv), Math.abs(yv));
      if (rel > maxRel) maxRel = rel;
    }
  }
  return { ok: maxRel <= rtol, maxRel, checked };
}

const checkLine = (label, res) =>
  `${res.ok ? 'OK  ' : 'DIFF'} ${label}${res.ok ? '' : ` (maxRel=${Number.isFinite(res.maxRel) ? res.maxRel.toExponential(2) : 'inf'}${res.note ? '; ' + res.note : ''})`}`;

// ---------------------------------------------------------------------------
// Competitors (installed as devDependencies for benchmarking only)
// ---------------------------------------------------------------------------
let TI = null, tulind = null;
try { TI = require('technicalindicators'); } catch (e) { console.log('! technicalindicators unavailable:', e.message); }
try { tulind = require('tulind'); } catch (e) { console.log('! tulind unavailable:', e.message); }

const t = (name) => (tulind ? tulind.indicators[name] : null);
// tulind uses a callback API: indicator(inputArrays, optInArray, callback).
// Wrap in a Promise so the benchmark's async path can `await` it.
const tulCall = (ind, inputs, options, fallback) => new Promise((resolve, reject) => {
  if (!ind) return resolve(fallback);
  ind.indicator(inputs, options, (err, result) => err ? reject(err) : resolve(result));
});

/** Per-indicator registry: how each implementation is invoked at a given size. */
const INDICATORS = [
  {
    key: 'sma', label: 'SMA (20)',
    js: (p) => jsSMA(p, 20),
    cfm: (d, out) => cfm.smaSync(d.prices, 20, out),
    cfmAsync: (d) => cfm.sma(d.prices, 20, TYPED),
    cfmArrIn: (d) => cfm.smaSync(d.pricesArr, 20),
    ti: (d) => TI && TI.SMA.calculate({ period: 20, values: d.pricesArr }),
    tul: (d) => (t('sma') ? tulCall(t('sma'), [d.pricesArr], [20]) : Promise.resolve(null)),
  },
  {
    key: 'ema', label: 'EMA (12)',
    js: (p) => jsEMA(p, 12),
    cfm: (d, out) => cfm.emaSync(d.prices, 12, out),
    cfmAsync: (d) => cfm.ema(d.prices, 12, TYPED),
    cfmArrIn: (d) => cfm.emaSync(d.pricesArr, 12),
    ti: (d) => TI && TI.EMA.calculate({ period: 12, values: d.pricesArr }),
    tul: (d) => (t('ema') ? tulCall(t('ema'), [d.pricesArr], [12]) : Promise.resolve(null)),
  },
  {
    key: 'rsi', label: 'RSI (14)',
    js: (p) => jsRSI(p, 14),
    cfm: (d, out) => cfm.rsiSync(d.prices, 14, out),
    cfmAsync: (d) => cfm.rsi(d.prices, 14, TYPED),
    cfmArrIn: (d) => cfm.rsiSync(d.pricesArr, 14),
    ti: (d) => TI && TI.RSI.calculate({ period: 14, values: d.pricesArr }),
    tul: (d) => (t('rsi') ? tulCall(t('rsi'), [d.pricesArr], [14]) : Promise.resolve(null)),
  },
  {
    key: 'wma', label: 'WMA (20)',
    js: (p) => jsWMA(p, 20),
    cfm: (d, out) => cfm.wmaSync(d.prices, 20, out),
    cfmAsync: (d) => cfm.wma(d.prices, 20, TYPED),
    cfmArrIn: (d) => cfm.wmaSync(d.pricesArr, 20),
    ti: (d) => TI && TI.WMA.calculate({ period: 20, values: d.pricesArr }),
    tul: (d) => (t('wma') ? tulCall(t('wma'), [d.pricesArr], [20]) : Promise.resolve(null)),
  },
  {
    key: 'volatility', label: 'Volatility (26)',
    js: (p) => jsVolatility(p, 26),
    cfm: (d, out) => cfm.volatilitySync(d.prices, 26, out),
    cfmAsync: (d) => cfm.volatility(d.prices, 26, TYPED),
    cfmArrIn: (d) => cfm.volatilitySync(d.pricesArr, 26),
    ti: null, tul: null, // no direct equivalent in these libraries (stddev of returns)
  },
  {
    key: 'macd', label: 'MACD (12,26,9)',
    js: (p) => jsMACD(p, 12, 26, 9),
    cfm: (d, out) => cfm.macdSync(d.prices, 12, 26, 9, out),
    cfmAsync: (d) => cfm.macd(d.prices, 12, 26, 9, TYPED),
    cfmArrIn: (d) => cfm.macdSync(d.pricesArr, 12, 26, 9),
    ti: (d) => TI && TI.MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: d.pricesArr }),
    tiNorm: (out) => {
      const n = out.length;
      const macd = new Array(n); const signal = new Array(n); const histogram = new Array(n);
      for (let i = 0; i < n; i++) {
        macd[i] = out[i].MACD !== undefined ? out[i].MACD : NaN;
        signal[i] = out[i].signal !== undefined ? out[i].signal : NaN;
        histogram[i] = out[i].histogram !== undefined ? out[i].histogram : NaN;
      }
      return { macd, signal, histogram };
    },
    tul: (d) => (t('macd') ? tulCall(t('macd'), [d.pricesArr], [12, 26, 9]) : Promise.resolve(null)),
    tulNorm: (out) => ({ macd: out[0], signal: out[1], histogram: out[2] }),
  },
  {
    key: 'bollinger', label: 'Bollinger (20,2)',
    js: (p) => jsBollinger(p, 20, 2),
    cfm: (d, out) => cfm.bollingerSync(d.prices, 20, 2, out),
    cfmAsync: (d) => cfm.bollinger(d.prices, 20, 2, TYPED),
    cfmArrIn: (d) => cfm.bollingerSync(d.pricesArr, 20, 2),
    ti: (d) => TI && TI.BollingerBands.calculate({ period: 20, stdDev: 2, stdDevNb: 2, values: d.pricesArr }),
    tiNorm: (out) => ({
      upper: out.map((o) => o.upper), middle: out.map((o) => o.middle), lower: out.map((o) => o.lower),
    }),
    tulNorm: (out) => ({ upper: out[0], middle: out[1], lower: out[2] }),
    tul: (d) => (t('bbands') ? tulCall(t('bbands'), [d.pricesArr], [20, 2]) : Promise.resolve(null)),
  },
];


// ===========================================================================
// Run
// ===========================================================================
const QUICK = process.env.CFM_BENCH_QUICK === '1';
const SIZES = QUICK ? [100, 1000, 10000, 100000] : [100, 1000, 10000, 100000, 1000000];
const BIG = 5000000; // subset only, to bound total runtime
const BIG_SUBSET = new Set(['sma', 'rsi']);

const rows = []; // {ind, size, ...times}
const notes = [];

async function main() {
  console.log('='.repeat(100));
  console.log('  crypto-fast-math baseline benchmark');
  console.log('='.repeat(100));
  for (const [k, v] of Object.entries(ENV)) console.log(`  ${pad(k + ':', 14)}${v}`);
  console.log(`  ${pad('versions:', 14)}crypto-fast-math ${require('./package.json').version}` +
    (TI ? `, technicalindicators ${require('technicalindicators/package.json').version}` : '') +
    (tulind ? `, tulind ${require('tulind/package.json').version}` : ''));
  console.log(`  ${pad('sizes:', 14)}${SIZES.join(', ')}${QUICK ? ' (quick)' : ` + ${BIG} subset`}`);
  console.log();

  // -------------------------------------------------------------------------
  // 1. Marshalling micro-costs
  // -------------------------------------------------------------------------
  console.log('-'.repeat(100));
  console.log('  1. Marshalling micro-costs (median ms per op)');
  console.log('-'.repeat(100));
  for (const n of [...SIZES, ...(QUICK ? [] : [BIG])]) {
    const d = makeData(n);
    const arr = d.pricesArr;
    const f64 = d.prices;
    const tArrToF64 = timeSync(() => Float64Array.from(arr), { maxIters: n >= 1000000 ? 20 : 5000 });
    const tF64ToArr = timeSync(() => { const o = new Array(n); for (let i = 0; i < n; i++) o[i] = f64[i]; return o; }, { maxIters: n >= 1000000 ? 20 : 5000 });
    const tCopy = timeSync(() => f64.slice(), { maxIters: n >= 1000000 ? 20 : 5000 });
    console.log(`  n=${pad(n.toLocaleString('en-US'), 10)}  number[]->F64 ${pad(fmt(tArrToF64), 9)}  F64->number[] ${pad(fmt(tF64ToArr), 9)}  F64 copy ${pad(fmt(tCopy), 9)}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 2. Fixed call overhead
  // -------------------------------------------------------------------------
  console.log('-'.repeat(100));
  console.log('  2. Fixed per-call overhead (boundary + validation, no real work)');
  console.log('-'.repeat(100));
  const empty = new Float64Array(0);
  const oEmpty = timeSync(() => cfm.smaSync(empty, 20, TYPED), { minBatchMs: 100, maxIters: 50000 });
  const kelly = timeSync(() => cfm.kellyCriterionSync(0.6, 200, 100), { minBatchMs: 100, maxIters: 50000 });
  const one = timeSync(() => cfm.smaSync(new Float64Array([1, 2, 3]), 2, TYPED), { minBatchMs: 100, maxIters: 50000 });
  console.log(`  smaSync(empty F64Array, typed)     ${pad(fmt(oEmpty * 1000), 10)} us/call`);
  console.log(`  smaSync(3 elements, typed)         ${pad(fmt(one * 1000), 10)} us/call`);
  console.log(`  kellyCriterionSync(scalars)        ${pad(fmt(kelly * 1000), 10)} us/call`);
  const f1 = timeSync(() => cfm.calculateSync({ formula: 'Close * 2', params: { Close: new Float64Array([1, 2, 3]) } }, TYPED), { minBatchMs: 200, maxIters: 5000 });
  console.log(`  calculateSync(3 pts, parse+thread) ${pad(fmt(f1 * 1000), 10)} us/call  <- ExprTk parse + 16MB-stack thread spawn`);
  const a100 = await timeAsync(() => cfm.sma(new Float64Array(100), 20, TYPED), { minBatchMs: 200, maxIters: 1000 });
  console.log(`  await sma(100, typed)              ${pad(fmt(a100 * 1000), 10)} us/call  <- includes async scheduling`);
  console.log();


  // -------------------------------------------------------------------------
  // 3. Main matrix: every indicator x every size
  // -------------------------------------------------------------------------
  const matrixSizes = [...SIZES, ...(QUICK ? [] : [BIG])];
  for (const size of matrixSizes) {
    const d = makeData(size);
    const isBig = size === BIG;
    const list = INDICATORS.filter((ind) => !isBig || BIG_SUBSET.has(ind.key));
    console.log('='.repeat(100));
    console.log(`  3. Indicators @ n=${size.toLocaleString('en-US')}  (median ms/call, full public API)`);
    console.log('='.repeat(100));
    console.log('  ' + pad('indicator', 18) + pad('js number[]', 13) + pad('js F64', 11) + pad('nat F64->typed', 16) +
      pad('nat F64->arr', 14) + pad('nat arr->arr', 14) + pad('nat async', 12) + pad('TI', 10) + pad('tulind', 10));
    console.log('  ' + '-'.repeat(96));
    for (const ind of list) {
      const r = { ind: ind.key, size };
      // correctness first — never benchmark numbers we cannot reproduce
      const ref = ind.js(d.prices);
      const natT = ind.cfm(d, TYPED);
      notes.push(checkLine(`${ind.label} @ ${size}: native(typed) vs JS ref`, tailCompare(natT, ref)));
      if (size <= 100000) {
        const natD = ind.cfm(d); // default number[] output
        notes.push(checkLine(`${ind.label} @ ${size}: native default vs native typed`, tailCompare(natD, natT)));
      }
      r.jsArr = timeSync(() => ind.js(d.pricesArr));
      r.jsF64 = timeSync(() => ind.js(d.prices));
      r.natTyped = timeSync(() => ind.cfm(d, TYPED));
      r.natF64Arr = timeSync(() => ind.cfm(d));       // F64 in -> number[] out
      r.natArrArr = timeSync(() => ind.cfmArrIn(d));  // number[] in -> number[] out
      r.natAsync = await timeAsync(() => ind.cfmAsync(d));
      r.ti = null; r.tul = null;
      if (ind.ti && TI) {
        try {
           const out = await ind.ti(d);
           notes.push(checkLine(`${ind.label} @ ${size}: technicalindicators vs JS ref`, tailCompare(ind.tiNorm ? ind.tiNorm(out) : out, ref)));
           r.ti = timeSync(() => ind.ti(d));
        } catch (e) { notes.push(`SKIP TI ${ind.label} @ ${size}: ${e.message}`); }
      }
       if (ind.tul && tulind) {
         try {
           const out = await ind.tul(d);
           notes.push(checkLine(`${ind.label} @ ${size}: tulind vs JS ref`, tailCompare(ind.tulNorm ? ind.tulNorm(out) : out, ref)));
           r.tul = await timeAsync(() => ind.tul(d));
        } catch (e) { notes.push(`SKIP tulind ${ind.label} @ ${size}: ${e.message}`); }
      }
      rows.push(r);
      const f = (v) => (v == null ? pad('-', 10) : pad(fmt(v), 10));
      console.log('  ' + pad(ind.label, 18) + pad(fmt(r.jsArr), 13) + pad(fmt(r.jsF64), 11) + pad(fmt(r.natTyped), 16) +
        pad(fmt(r.natF64Arr), 14) + pad(fmt(r.natArrArr), 14) + pad(fmt(r.natAsync), 12) + f(r.ti) + f(r.tul));
    }
    console.log();
  }


  // -------------------------------------------------------------------------
  // 4. Custom formula (ExprTk) — sync/async vs JS tight loop
  // -------------------------------------------------------------------------
  const FORMULA = '(High - Low) / Close * Volume * sin(Close)';
  const fSizes = [...SIZES, ...(QUICK ? [] : [BIG])];
  console.log('='.repeat(100));
  console.log('  4. Custom formula (ExprTk) — median ms/call');
  console.log('='.repeat(100));
  console.log('  ' + pad('n', 12) + pad('js F64 loop', 14) + pad('nat typed', 12) + pad('nat number[]', 14) + pad('nat async', 12));
  console.log('  ' + '-'.repeat(60));
  for (const size of fSizes) {
    const d = makeData(size);
    const params = { High: d.high, Low: d.low, Close: d.prices, Volume: d.volume };
    const args = { formula: FORMULA, params, returnType: 'number' };
    const ref = jsFormula(d.high, d.low, d.prices, d.volume);
    notes.push(checkLine(`formula @ ${size}: native typed vs JS ref`,
      tailCompare(cfm.calculateSync(args, TYPED), ref)));
    const j = timeSync(() => jsFormula(d.high, d.low, d.prices, d.volume));
    const natT = timeSync(() => cfm.calculateSync(args, TYPED));
    const natA = timeSync(() => cfm.calculateSync(args));
    const natAsync = await timeAsync(() => cfm.calculate(args, TYPED));
    rows.push({ ind: 'formula', size, jsF64: j, jsArr: j, natTyped: natT, natF64Arr: natA, natArrArr: natA, natAsync, ti: null, tul: null });
    console.log('  ' + pad(size.toLocaleString('en-US'), 12) + pad(fmt(j), 14) + pad(fmt(natT), 12) + pad(fmt(natA), 14) + pad(fmt(natAsync), 12));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 4b. Prepared formula — parse-once / eval-many for repeated-formula workloads
  console.log('='.repeat(100));
  console.log('  4b. Prepared formula (ExprTk) — parse-once / eval-many');
  console.log('='.repeat(100));
  console.log('  ' + pad('n', 10) + pad('cold calcSync', 16) + pad('warm evalPrepared', 18) + pad('speedup', 12));
  console.log('  ' + '-'.repeat(58));
  for (const size of fSizes) {
    const d = makeData(size);
    const params = { High: d.high, Low: d.low, Close: d.prices, Volume: d.volume };
    const args = { formula: FORMULA, params, returnType: 'number' };
    const ref = jsFormula(d.high, d.low, d.prices, d.volume);
    const handle = cfm.prepareFormula(args);
    const natCold = timeSync(() => cfm.calculateSync(args, TYPED));
    const natWarm = timeSync(() => cfm.evaluatePrepared({ handle, params }));
    const warmRes = cfm.evaluatePrepared({ handle, params });
    notes.push(checkLine(`prepared formula @ ${size}: warm eval vs JS ref`, tailCompare(warmRes, ref)));
    rows.push({ ind: 'formulaPrepared', size, jsF64: NaN, jsArr: NaN, natTyped: natCold, natF64Arr: natWarm, natArrArr: natWarm, natAsync: NaN, ti: null, tul: null });
    console.log('  ' + pad(size.toLocaleString('en-US'), 10) + pad(fmt(natCold), 16) + pad(fmt(natWarm), 18) + pad((natCold / natWarm).toFixed(1) + 'x', 12));
  }
  console.log('  * warmup (parse + 16MB-stack thread) ~1 ms; warm eval is pure O(n), no spawn, no parse.');
  console.log();
  // 5. Multi-indicator batch (user pattern: several calls on the same input)
  // -------------------------------------------------------------------------
  console.log('='.repeat(100));
  console.log('  5. Batch: SMA(20)+EMA(12)+RSI(14) typed, sequential calls on one input');
  console.log('='.repeat(100));
  console.log('  ' + pad('n', 12) + pad('3 native calls', 16) + pad('sum of parts', 14) + pad('js equivalent', 14) + pad('overhead', 10));
  console.log('  ' + '-'.repeat(66));
  for (const size of [...SIZES, ...(QUICK ? [] : [BIG])]) {
    const d = makeData(size);
    const batch = () => {
      cfm.smaSync(d.prices, 20, TYPED);
      cfm.emaSync(d.prices, 12, TYPED);
      cfm.rsiSync(d.prices, 14, TYPED);
    };
    const tBatch = timeSync(batch);
    const parts = rows.filter((r) => r.size === size && ['sma', 'ema', 'rsi'].includes(r.ind))
      .reduce((s, r) => s + r.natTyped, 0);
    const tJs = timeSync(() => { jsSMA(d.prices, 20); jsEMA(d.prices, 12); jsRSI(d.prices, 14); });
    console.log('  ' + pad(size.toLocaleString('en-US'), 12) + pad(fmt(tBatch), 16) + pad(fmt(parts), 14) +
      pad(fmt(tJs), 14) + pad(fmt(tBatch - parts), 10));
  }
  console.log();


  // -------------------------------------------------------------------------
  // 6. Event-loop responsiveness probe
  // -------------------------------------------------------------------------
  if (!QUICK) {
    console.log('='.repeat(100));
    console.log('  6. Event-loop delay during heavy work (max delay, ms)');
    console.log('='.repeat(100));
    const res = { resolution: 5 };
    const measure = async (fn) => {
      const h = monitorEventLoopDelay(res);
      h.enable();
      await fn();
      h.disable();
      return h.max / 1e6;
    };
    const d5 = makeData(5000000);
    const d1 = makeData(1000000);
    const idleMax = await measure(() => new Promise((r) => setTimeout(r, 300)));
    const syncMax = await measure(async () => { cfm.smaSync(d5.prices, 20, TYPED); });
    const asyncMax = await measure(async () => {
      await Promise.all([1, 2, 3, 4].map(() => cfm.sma(d1.prices, 20, TYPED)));
    });
    const jsMax = await measure(async () => { jsSMA(d5.prices, 20); });
    console.log(`  idle baseline (300 ms)                       ${pad(fmt(idleMax), 8)}`);
    console.log(`  cfm.smaSync(5,000,000)                       ${pad(fmt(syncMax), 8)}  <- blocks the loop`);
    console.log(`  jsSMA(5,000,000)                             ${pad(fmt(jsMax), 8)}  <- blocks the loop`);
    console.log(`  4 x await cfm.sma(1,000,000) concurrently    ${pad(fmt(asyncMax), 8)}  <- loop stays responsive*`);
    console.log('  * input copy + result conversion still run on the main thread; only the compute is off-loop.');
    console.log();
  }

  // -------------------------------------------------------------------------
  // 7. Retained-heap probe (requires --expose-gc)
  // -------------------------------------------------------------------------
  if (typeof global.gc === 'function') {
    console.log('='.repeat(100));
    console.log('  7. Retained heap per result (forced GC, MB)');
    console.log('='.repeat(100));
    console.log('  ' + pad('n', 12) + pad('Float64Array out', 20) + pad('number[] out', 16) + pad('ratio', 8));
    console.log('  ' + '-'.repeat(56));
    const held = [];
    for (const size of [100000, 1000000]) {
      const d = makeData(size);
      global.gc();
      const h0 = process.memoryUsage().heapUsed;
      const rTyped = cfm.smaSync(d.prices, 20, TYPED);
      held.push(rTyped);
      global.gc();
      const hTyped = process.memoryUsage().heapUsed - h0;
      global.gc();
      const h1 = process.memoryUsage().heapUsed;
      const rArr = cfm.smaSync(d.prices, 20);
      held.push(rArr);
      global.gc();
      const hArr = process.memoryUsage().heapUsed - h1;
      console.log('  ' + pad(size.toLocaleString('en-US'), 12) + pad(fmt(hTyped / 2 ** 20, 1), 20) +
        pad(fmt(hArr / 2 ** 20, 1), 16) + pad((hArr / Math.max(1, hTyped)).toFixed(2) + 'x', 8));
    }
    void held;
    console.log('  (number[] results are retained until GC runs — typed mode is also ~3x smaller)');
    console.log();
  } else {
    console.log('(run with --expose-gc for the retained-heap section)\n');
  }


  // -------------------------------------------------------------------------
  // 8. Correctness notes (all comparisons performed during the run)
  // -------------------------------------------------------------------------
  console.log('='.repeat(100));
  console.log('  8. Correctness checks performed during the run');
  console.log('='.repeat(100));
  const diffs = notes.filter((s) => s.startsWith('DIFF') || s.startsWith('SKIP'));
  for (const s of notes) console.log('  ' + s);
  console.log(`  -> ${notes.length - diffs.length}/${notes.length} comparisons match (rtol=1e-6, tail-aligned)`);
  console.log();

  // -------------------------------------------------------------------------
  // 9. Crossover summary: native(sync, typed) vs JS on Float64Array
  // -------------------------------------------------------------------------
  console.log('='.repeat(100));
  console.log('  9. Crossover summary — native(typed) / JS(F64) ratio per size (< 1 => native faster)');
  console.log('='.repeat(100));
  const keys = [...new Set(rows.map((r) => r.ind))];
  const sizes = [...new Set(rows.map((r) => r.size))].sort((a, b) => a - b);
  console.log('  ' + pad('indicator', 18) + sizes.map((s) => pad(s.toLocaleString('en-US'), 13)).join(''));
  console.log('  ' + '-'.repeat(18 + 13 * sizes.length));
  for (const k of keys) {
    let line = '  ' + pad(k, 18);
    for (const s of sizes) {
      const r = rows.find((x) => x.ind === k && x.size === s);
      if (!r) { line += pad('-', 13); continue; }
      const ratio = r.natTyped / r.jsF64;
      line += pad(fmt(ratio) + (ratio < 1 ? '*' : ''), 13);
    }
    console.log(line);
  }
  console.log('  (* = native sync typed faster than the JS reference at this size)');
  console.log();

  // -------------------------------------------------------------------------
  // 10. Latency distribution spot-check (100k SMA, 100 samples)
  // -------------------------------------------------------------------------
  if (!QUICK) {
    const d = makeData(100000);
    const samples = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      cfm.smaSync(d.prices, 20, TYPED);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const q = (p) => samples[Math.floor(p * (samples.length - 1))].toFixed(3);
    console.log('  Latency distribution — cfm.smaSync(100k, 20, typed), 100 samples (ms):');
    console.log(`    min ${samples[0].toFixed(3)}  p50 ${q(0.5)}  p95 ${q(0.95)}  p99 ${q(0.99)}  max ${samples[samples.length - 1].toFixed(3)}`);
    console.log();
  }

  console.log('='.repeat(100));
  console.log('  Done. Total wall time: ' + ((performance.now() - START) / 1000).toFixed(1) + ' s');
  console.log('='.repeat(100));
}

const START = performance.now();
main().catch((e) => { console.error(e); process.exit(1); });

