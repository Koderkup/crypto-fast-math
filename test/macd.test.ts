import { expect } from 'chai';
import * as cfm from '../src/index';

// ---------------------------------------------------------------------------
// Regression tests for MACD signal/histogram and Elder impulse flags.
//
// In v0.1.11 the signal EMA was seeded with the leading NaN warm-up of the
// macd line, which NaN-poisoned the whole recursion: `signal` and `histogram`
// were all-NaN for the default (12,26,9) parameters, and both impulse
// indicators consequently returned all zeros. The tests below pin the fixed
// behaviour against independent, straight-from-the-definition JS references.
// ---------------------------------------------------------------------------

const TYPED = { output: 'typed' } as const;

/** Deterministic trending data with sinusoidal wiggle. */
function makePrices(n: number): Float64Array {
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = 100 + i * 0.5 + Math.sin(i) * 2;
  return p;
}

/** Full-length EMA with SMA seed at index period-1 (mirrors ema_core semantics). */
function jsEma(p: ArrayLike<number>, period: number): Float64Array {
  const n = p.length;
  const out = new Float64Array(n).fill(NaN);
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

interface RefMacd { macd: Float64Array; signal: Float64Array; histogram: Float64Array; }

/** Reference MACD: signal seeded on the first `signal` *valid* macd values. */
function jsMacd(p: ArrayLike<number>, fast: number, slow: number, signal: number): RefMacd {
  const n = p.length;
  const macd = new Float64Array(n).fill(NaN);
  const sig = new Float64Array(n).fill(NaN);
  const hist = new Float64Array(n).fill(NaN);
  const ef = jsEma(p, fast);
  const es = jsEma(p, slow);
  const start = slow - 1;
  for (let i = start; i < n; i++) macd[i] = ef[i] - es[i];
  const seedEnd = start + signal;
  if (n > start && seedEnd <= n) {
    let sum = 0;
    for (let i = start; i < seedEnd; i++) sum += macd[i];
    let prev = sum / signal;
    sig[seedEnd - 1] = prev;
    const alpha = 2 / (signal + 1);
    for (let i = seedEnd; i < n; i++) {
      prev = alpha * macd[i] + (1 - alpha) * prev;
      sig[i] = prev;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(sig[i]) && !Number.isNaN(macd[i])) hist[i] = macd[i] - sig[i];
  }
  return { macd, signal: sig, histogram: hist };
}

function sameValue(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  return a === b;
}


describe('MACD (regression: signal/histogram were all-NaN)', () => {
  const prices = makePrices(200);

  it('produces a finite signal line after the warm-up', () => {
    const r = cfm.macdSync(prices, 12, 26, 9, TYPED);
    const sig = Array.from(r.signal);
    const finite = sig.filter((v) => Number.isFinite(v));
    expect(finite.length).to.be.greaterThan(100, 'signal line has too few finite values');
    // standard warm-up: first signal value at slow + signal - 2 = 33
    expect(Number.isNaN(sig[32])).to.equal(true);
    expect(Number.isFinite(sig[33])).to.equal(true);
    expect(Number.isNaN(sig[25])).to.equal(true);
  });

  it('histogram equals macd - signal wherever both are defined', () => {
    const r = cfm.macdSync(prices, 12, 26, 9, TYPED);
    for (let i = 0; i < prices.length; i++) {
      const m = r.macd[i], s = r.signal[i], h = r.histogram[i];
      if (!Number.isNaN(m) && !Number.isNaN(s)) {
        expect(sameValue(h, m - s)).to.equal(true, `histogram mismatch at ${i}`);
      } else {
        expect(Number.isNaN(h)).to.equal(true, `histogram should be NaN at ${i}`);
      }
    }
  });

  it('matches an independent JS reference implementation', () => {
    const got = cfm.macdSync(prices, 12, 26, 9, TYPED);
    const ref = jsMacd(prices, 12, 26, 9);
    for (const key of ['macd', 'signal', 'histogram'] as const) {
      for (let i = 0; i < prices.length; i++) {
        expect(sameValue(got[key][i], ref[key][i])).to.equal(true, `${key} mismatch at ${i}: ${got[key][i]} vs ${ref[key][i]}`);
      }
    }
  });

  it('default output mode (number[]) equals typed mode', () => {
    const plain = cfm.macdSync(prices, 12, 26, 9);
    const typed = cfm.macdSync(prices, 12, 26, 9, TYPED);
    expect(Array.isArray(plain.signal)).to.equal(true);
    for (let i = 0; i < prices.length; i++) {
      expect(sameValue(plain.signal[i], typed.signal[i])).to.equal(true, `signal mismatch at ${i}`);
    }
  });

  it('async result matches sync result', async () => {
    const syncR = cfm.macdSync(prices, 12, 26, 9, TYPED);
    const asyncR = await cfm.macd(prices, 12, 26, 9, TYPED);
    for (let i = 0; i < prices.length; i++) {
      expect(sameValue(asyncR.signal[i], syncR.signal[i])).to.equal(true, `signal mismatch at ${i}`);
    }
  });

  it('signal stays all-NaN when the series is too short for seeding', () => {
    const short = makePrices(30); // start=25, seed needs indices 25..33
    const r = cfm.macdSync(short, 12, 26, 9, TYPED);
    expect(r.signal.every((v) => Number.isNaN(v))).to.equal(true);
    expect(r.histogram.every((v) => Number.isNaN(v))).to.equal(true);
    expect(Number.isFinite(r.macd[25])).to.equal(true);
  });

describe('Elder impulse flags (regression: always all-zero)', () => {
  // Swing data: strong oscillation relative to drift so both EMA/histogram
  // directions actually occur (a monotonically rising series never goes bearish).
  const prices = new Float64Array(300);
  for (let i = 0; i < 300; i++) prices[i] = 100 + i * 0.2 + 8 * Math.sin(i / 3);

  it('emits bullish and bearish flags on trending data', () => {
    const bull = cfm.bullishImpulseSync(prices);
    const bear = cfm.bearishImpulseSync(prices);
    expect(Array.from(bull).some((v) => v === 1)).to.equal(true, 'no bullish flags');
    expect(Array.from(bear).some((v) => v === 1)).to.equal(true, 'no bearish flags');
  });

  it('flags require BOTH EMA direction and histogram direction (AND semantics)', () => {
    // Reference: flag = (ema13 direction) AND (hist direction) — as documented in README.
    const ema13 = jsEma(prices, 13);
    const m = jsMacd(prices, 12, 26, 9);
    const bull = cfm.bullishImpulseSync(prices);
    const bear = cfm.bearishImpulseSync(prices);
    for (let i = 1; i < prices.length; i++) {
      const defined = !Number.isNaN(ema13[i]) && !Number.isNaN(ema13[i - 1]) &&
        !Number.isNaN(m.histogram[i]) && !Number.isNaN(m.histogram[i - 1]);
      const expBull = defined && ema13[i] > ema13[i - 1] && m.histogram[i] > m.histogram[i - 1] ? 1 : 0;
      const expBear = defined && ema13[i] < ema13[i - 1] && m.histogram[i] < m.histogram[i - 1] ? 1 : 0;
      expect(bull[i]).to.equal(expBull, `bullish mismatch at ${i}`);
      expect(bear[i]).to.equal(expBear, `bearish mismatch at ${i}`);
    }
  });

  it('async results match sync results', async () => {
    const b1 = cfm.bullishImpulseSync(prices);
    const b2 = await cfm.bullishImpulse(prices);
    expect(Array.from(b2)).to.deep.equal(Array.from(b1));
  });
});

});
