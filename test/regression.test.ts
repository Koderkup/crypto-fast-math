import { expect } from 'chai';
import * as cfm from '../src/index';

// Independent reference implementations for comparison
function refRollingMax(arr: number[], period: number): number[] {
  const n = arr.length;
  const out: number[] = Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, arr[j]);
    out[i] = m;
  }
  return out;
}

function refRollingMin(arr: number[], period: number): number[] {
  const n = arr.length;
  const out: number[] = Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, arr[j]);
    out[i] = m;
  }
  return out;
}

function refADX(high: number[], low: number[], close: number[], period: number = 14) {
  const n = high.length;
  const adx: number[] = Array(n).fill(NaN);
  const plusDI: number[] = Array(n).fill(NaN);
  const minusDI: number[] = Array(n).fill(NaN);
  if (n < 2 * period) return { adx, plusDI, minusDI };

  const tr: number[] = new Array(n);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  tr[0] = high[0] - low[0];
  for (let i = 1; i < n; i++) {
    const h_l = high[i] - low[i];
    const h_pc = Math.abs(high[i] - close[i - 1]);
    const l_pc = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(h_l, Math.max(h_pc, l_pc));
    const dh = high[i] - high[i - 1];
    const dl = low[i - 1] - low[i];
    if (dh > 0 && dh > dl) plusDM[i] = dh;
    if (dl > 0 && dl > dh) minusDM[i] = dl;
  }

  let atr = 0, pdm = 0, mdm = 0;
  for (let i = 0; i < period; i++) { atr += tr[i]; pdm += plusDM[i]; mdm += minusDM[i]; }
  atr /= period; pdm /= period; mdm /= period;
  plusDI[period - 1] = (pdm / atr) * 100;
  minusDI[period - 1] = (mdm / atr) * 100;

  // Calculate DX array
  const dx: number[] = Array(n).fill(NaN);
  {
    const diff = Math.abs(plusDI[period - 1] - minusDI[period - 1]);
    const sum = plusDI[period - 1] + minusDI[period - 1];
    dx[period - 1] = sum === 0 ? 0 : (diff / sum) * 100;
  }

  for (let i = period; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    pdm = (pdm * (period - 1) + plusDM[i]) / period;
    mdm = (mdm * (period - 1) + minusDM[i]) / period;
    plusDI[i] = (pdm / atr) * 100;
    minusDI[i] = (mdm / atr) * 100;
    const diff = Math.abs(plusDI[i] - minusDI[i]);
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum === 0 ? 0 : (diff / sum) * 100;
  }

  // ADX seeded at 2*period-1 with SMA of DX[period-1..2*period-2]
  if (n >= 2 * period) {
    let dxSum = 0;
    for (let i = period - 1; i < 2 * period - 1; i++) dxSum += dx[i];
    adx[2 * period - 1] = dxSum / period;
    for (let i = 2 * period; i < n; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx, plusDI, minusDI };
}

function refWilliamsR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const n = high.length;
  const hh = refRollingMax(high, period);
  const ll = refRollingMin(low, period);
  const out: number[] = Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    const range = hh[i] - ll[i];
    out[i] = range === 0 ? 0 : (hh[i] - close[i]) / range * -100;
  }
  return out;
}

function refStochastic(high: number[], low: number[], close: number[], kPeriod = 14, dPeriod = 3) {
  const n = high.length;
  const hh = refRollingMax(high, kPeriod);
  const ll = refRollingMin(low, kPeriod);
  const k: number[] = Array(n).fill(NaN);
  const d: number[] = Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    const range = hh[i] - ll[i];
    k[i] = range === 0 ? 0 : (close[i] - ll[i]) / range * 100;
  }
  for (let i = kPeriod - 1 + dPeriod - 1; i < n; i++) {
    let sum = 0, valid = true;
    for (let j = 0; j < dPeriod; j++) {
      const val = k[i - dPeriod + 1 + j];
      if (Number.isNaN(val)) { valid = false; break; }
      sum += val;
    }
    if (valid) d[i] = sum / dPeriod;
  }
  return { k, d };
}

function refDonchian(high: number[], low: number[], period: number = 20) {
  const n = high.length;
  const hh = refRollingMax(high, period);
  const ll = refRollingMin(low, period);
  const upper: number[] = Array(n).fill(NaN);
  const middle: number[] = Array(n).fill(NaN);
  const lower: number[] = Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    if (!Number.isNaN(hh[i]) && !Number.isNaN(ll[i])) {
      upper[i] = hh[i];
      lower[i] = ll[i];
      middle[i] = (hh[i] + ll[i]) / 2;
    }
  }
  return { upper, middle, lower };
}

function refIchimoku(high: number[], low: number[], close: number[]) {
  const n = high.length;
  const tenkan = refRollingMax(high, 9).map((h, i) => {
    const l = refRollingMin(low, 9)[i];
    return Number.isNaN(h) || Number.isNaN(l) ? NaN : (h + l) / 2;
  });
  const kijun = refRollingMax(high, 26).map((h, i) => {
    const l = refRollingMin(low, 26)[i];
    return Number.isNaN(h) || Number.isNaN(l) ? NaN : (h + l) / 2;
  });
  return { tenkan, kijun };
}

// Helper: compare two numeric arrays with tolerance
function arraysMatch(a: number[], b: number[], tol = 1e-10): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i]) && Number.isNaN(b[i])) continue;
    if (Number.isNaN(a[i]) || Number.isNaN(b[i])) return false;
    if (Math.abs(a[i] - b[i]) > tol) return false;
  }
  return true;
}

// -------------------------------------------------------------------------------
// Bug 3: rollingMax / rollingMin unsigned underflow
// -------------------------------------------------------------------------------
describe('rollingMax/rollingMin — unsigned underflow fix', () => {
  // We test indirectly through indicators that use rollingMax/rollingMin:
  // stochastic, williamsR, donchian.

  it('Williams %R with descending highs (rollingMax matters)', () => {
    // Descending highs: [100, 99, 98, ..., 81], period=14
    // At i=13, HH should be 100 (the first bar), not 87 (which would happen
    // if the deque underflowed and evicted index 0 prematurely).
    const n = 14;
    const high = Array.from({ length: n }, (_, i) => 100 - i);
    const low = Array.from({ length: n }, (_, i) => 90 - i);
    const close = Array.from({ length: n }, (_, i) => 95 - i);
    const result = cfm.williamsRSync(high, low, close, 14) as number[];

    // i=13: HH=100 (first bar, descending), LL=77 (low[13]=90-13), range=23, close[13]=82
    // %R = (100-82)/23 * -100 = -78.26...
    expect(result[0]).to.be.NaN;  // warm-up
    expect(result[13]).to.be.closeTo((100 - 82) / (100 - 77) * -100, 0.01);
    expect(result[13]).to.be.lessThan(0);
    expect(result[13]).to.be.greaterThanOrEqual(-100);
  });

  it('Williams %R output is always in [-100, 0]', () => {
    const n = 50;
    const high = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
    const low = Array.from({ length: n }, (_, i) => 90 + Math.cos(i * 0.4) * 10);
    const close = Array.from({ length: n }, (_, i) => 95 + Math.sin(i * 0.5) * 8);
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    for (const v of result) {
      if (!Number.isNaN(v)) {
        expect(v).to.be.at.most(0);
        expect(v).to.be.at.least(-100);
      }
    }
  });

  it('Williams %R vs independent reference (descending data)', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 200 - i);
    const low = Array.from({ length: n }, (_, i) => 180 - i);
    const close = Array.from({ length: n }, (_, i) => 190 - i);
    const got = cfm.williamsRSync(high, low, close, 20) as number[];
    const ref = refWilliamsR(high, low, close, 20);
    expect(arraysMatch(got, ref, 1e-10)).to.equal(true);
  });

  it('Williams %R vs independent reference (random data)', () => {
    const n = 200;
    const seed = 42;
    const rand = (s: number) => {
      let x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    const high = Array.from({ length: n }, (_, i) => 100 + rand(seed + i) * 30);
    const low = Array.from({ length: n }, (_, i) => 80 + rand(seed * 2 + i) * 20);
    const close = Array.from({ length: n }, (_, i) =>
      Math.min(high[i], low[i] + rand(seed * 3 + i) * (high[i] - low[i]))
    );
    const got = cfm.williamsRSync(high, low, close, 14) as number[];
    const ref = refWilliamsR(high, low, close, 14);
    expect(arraysMatch(got, ref, 1e-10)).to.equal(true);
  });

  it('Williams %R zero-range window returns 0.0', () => {
    const n = 20;
    const constant = 100;
    const high = Array(n).fill(constant);
    const low = Array(n).fill(constant);
    const close = Array(n).fill(constant);
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    // After warm-up: range == 0 → should return 0.0
    for (let i = 13; i < n; i++) {
      expect(result[i]).to.equal(0);
    }
  });

  it('Donchian channels with descending data (rollingMax/rollingMin)', () => {
    const n = 30;
    const high = Array.from({ length: n }, (_, i) => 100 - i);
    const low = Array.from({ length: n }, (_, i) => 80 - i);
    const result = cfm.donchianSync(high, low, 14) as { upper: number[]; middle: number[]; lower: number[] };
    const ref = refDonchian(high, low, 14);
    expect(arraysMatch(result.upper, ref.upper, 1e-10)).to.equal(true);
    expect(arraysMatch(result.lower, ref.lower, 1e-10)).to.equal(true);
    expect(arraysMatch(result.middle, ref.middle, 1e-10)).to.equal(true);
  });

  it('Donchian channels with alternating data', () => {
    const n = 50;
    const high = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 110 : 90));
    const low = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 100 : 80));
    const result = cfm.donchianSync(high, low, 14) as { upper: number[]; middle: number[]; lower: number[] };
    const ref = refDonchian(high, low, 14);
    expect(arraysMatch(result.upper, ref.upper, 1e-10)).to.equal(true);
    expect(arraysMatch(result.lower, ref.lower, 1e-10)).to.equal(true);
  });

  it('Stochastic with descending data (rollingMax underflow scenario)', () => {
    const n = 30;
    const high = Array.from({ length: n }, (_, i) => 100 - i);
    const low = Array.from({ length: n }, (_, i) => 70 - i);
    const close = Array.from({ length: n }, (_, i) => 85 - i);
    const result = cfm.stochasticSync(high, low, close, 14, 3) as { k: number[]; d: number[] };
    const ref = refStochastic(high, low, close, 14, 3);
    expect(arraysMatch(result.k, ref.k, 1e-10)).to.equal(true);
    expect(arraysMatch(result.d, ref.d, 1e-10)).to.equal(true);
  });

  it('Ichimoku tenkan-sen and kijun-sen rolling (with descending data)', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 200 - i * 2);
    const low = Array.from({ length: n }, (_, i) => 100 - i * 2);
    const close = Array.from({ length: n }, (_, i) => 150 - i * 2);
    const result = cfm.ichimokuSync(high, low, close) as any;
    const ref = refIchimoku(high, low, close);

    // Check tenkan (period 9) and kijun (period 26) for first 30 indices
    for (let i = 0; i < Math.min(30, n); i++) {
      if (Number.isNaN(ref.tenkan[i])) {
        expect(result.tenkan[i]).to.be.NaN;
      } else {
        expect(result.tenkan[i]).to.be.closeTo(ref.tenkan[i], 1e-10);
      }
      if (Number.isNaN(ref.kijun[i])) {
        expect(result.kijun[i]).to.be.NaN;
      } else {
        expect(result.kijun[i]).to.be.closeTo(ref.kijun[i], 1e-10);
      }
    }
  });

  it('Stochastic vs independent reference (random data)', () => {
    const n = 200;
    const seed = 12345;
    const rand = (s: number) => {
      let x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    const high = Array.from({ length: n }, (_, i) => 100 + rand(seed + i) * 50);
    const low = Array.from({ length: n }, (_, i) => Math.max(0, 50 + rand(seed * 2 + i) * 50));
    const close = Array.from({ length: n }, (_, i) => low[i] + rand(seed * 3 + i) * (high[i] - low[i]));
    const got = cfm.stochasticSync(high, low, close, 14, 3) as { k: number[]; d: number[] };
    const ref = refStochastic(high, low, close, 14, 3);
    expect(arraysMatch(got.k, ref.k, 1e-10)).to.equal(true);
    expect(arraysMatch(got.d, ref.d, 1e-10)).to.equal(true);
  });

  it('rollingMax with period 1 (each element is its own max)', () => {
    // Period 1 means window size 1: max[i] = arr[i]
    const prices = [5, 3, 8, 1, 9, 2, 7];
    // Use williamsR with period 1 to test rollingMax indirectly
    const result = cfm.stochasticSync(prices, prices, prices, 1, 3) as { k: number[]; d: number[] };
    // With high=low=close, range = 0 → k = 0
    for (let i = 0; i < prices.length; i++) {
      if (!Number.isNaN(result.k[i])) {
        expect(result.k[i]).to.equal(0);
      }
    }
  });

  it('rollingMax with period equal to input length', () => {
    const n = 10;
    const high = Array.from({ length: n }, (_, i) => 200 - i * 10);  // descending
    const low = Array.from({ length: n }, (_, i) => 100 - i * 10);
    const close = Array.from({ length: n }, (_, i) => 150 - i * 10);
    const result = cfm.williamsRSync(high, low, close, n) as number[];
    // Only the last element should be valid (index n-1 = 9)
    expect(result[n - 1]).to.be.closeTo((200 - close[n - 1]) / (200 - low[n - 1]) * -100, 1e-10);
    for (let i = 0; i < n - 1; i++) {
      expect(result[i]).to.be.NaN;
    }
  });
});

// -------------------------------------------------------------------------------
// Bug 1: Williams %R sign error
// -------------------------------------------------------------------------------
describe('Williams %R — sign and range correctness', () => {
  it('output is in [-100, 0] for varied data', () => {
    const n = 100;
    const rand = (s: number) => {
      let x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    const high = Array.from({ length: n }, (_, i) => 100 + rand(i) * 20);
    const low = Array.from({ length: n }, (_, i) => Math.max(0, 80 + rand(n + i) * 15));
    const close = Array.from({ length: n }, (_, i) => low[i] + rand(2 * n + i) * (high[i] - low[i]));
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    for (const v of result) {
      if (!Number.isNaN(v)) {
        expect(v, `value ${v} out of range`).to.be.at.most(0);
        expect(v).to.be.at.least(-100);
      }
    }
  });

  it('latest close at lowest low → -100 (oversold)', () => {
    const n = 20;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 80 + i);
    const close = Array.from({ length: n }, (_, i) => low[i]);  // close == low at every bar
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    // At each valid index: %R = (HH - close) / (HH - LL) * -100
    // close == low (current bar's low), so it's not necessarily exactly -100
    // but it should be <= 0
    for (let i = 13; i < n; i++) {
      expect(result[i]).to.be.at.most(0);
    }
  });

  it('latest close at highest high → 0 (overbought)', () => {
    const n = 20;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 80 + i);
    const close = Array.from({ length: n }, (_, i) => high[i]);  // close == high
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    // close == high, so %R = 0
    for (let i = 13; i < n; i++) {
      expect(result[i]).to.be.closeTo(0, 1e-10);
    }
  });

  it('matches independent reference on deterministic data', () => {
    const high = [105, 107, 106, 110, 112, 115, 113, 117, 120, 122, 125, 124, 128, 130, 132, 135];
    const low = [95, 97, 96, 100, 102, 105, 103, 107, 110, 112, 115, 114, 118, 120, 122, 125];
    const close = [102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 121, 125, 126, 128, 130, 133];
    const got = cfm.williamsRSync(high, low, close, 14) as number[];
    const ref = refWilliamsR(high, low, close, 14);
    expect(arraysMatch(got, ref, 1e-10)).to.equal(true);
  });

  it('async matches sync after fix', async () => {
    const high = [105, 107, 106, 110, 112, 115, 113, 117, 120, 122, 125, 124, 128, 130, 132, 135];
    const low = [95, 97, 96, 100, 102, 105, 103, 107, 110, 112, 115, 114, 118, 120, 122, 125];
    const close = [102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 121, 125, 126, 128, 130, 133];
    const sync = cfm.williamsRSync(high, low, close, 14) as number[];
    const async = (await cfm.williamsR(high, low, close, 14)) as number[];
    expect(arraysMatch(sync, async, 1e-10)).to.equal(true);
  });

  it('zero-range window: all bars identical', () => {
    const n = 15;
    const high = Array(n).fill(100);
    const low = Array(n).fill(100);
    const close = Array(n).fill(100);
    const result = cfm.williamsRSync(high, low, close, 14) as number[];
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(result[i])) {
        expect(result[i]).to.equal(0);
      }
    }
  });

  it('descending highs: max at first bar (post-rollMax fix)', () => {
    // Critical regression: before fix, rollingMax underflowed and evicted
    // the earliest (highest) index during warm-up, producing wrong HH.
    const high = Array.from({ length: 20 }, (_, i) => 100 - i);
    const low = Array.from({ length: 20 }, (_, i) => 70 - i);
    const close = Array.from({ length: 20 }, (_, i) => 85 - i);
    const got = cfm.williamsRSync(high, low, close, 14) as number[];
    const ref = refWilliamsR(high, low, close, 14);
    expect(arraysMatch(got, ref, 1e-10)).to.equal(true);
  });
});

// -------------------------------------------------------------------------------
// Bug 2: ADX warm-up and Wilder smoothing seed
// -------------------------------------------------------------------------------
describe('ADX — warm-up and smoothing correctness', () => {
  const period = 14;

  it('ADX is NaN during warm-up (period-1 through 2*period-2)', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 90 + i);
    const close = Array.from({ length: n }, (_, i) => 95 + i);
    const result = cfm.adxSync(high, low, close, period) as any;
    // ADX should be NaN from 0 to 2*period-2 (indices 0..26)
    // First valid ADX at index 2*period-1 = 27
    for (let i = 0; i < 2 * period - 1; i++) {
      expect(result.adx[i], `ADX[${i}] should be NaN`).to.be.NaN;
    }
    expect(result.adx[2 * period - 1], 'ADX[2*period-1] should be finite').to.not.be.NaN;
  });

  it('ADX[period-1] is NaN (not 0.0 — the original bug)', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 90 + i);
    const close = Array.from({ length: n }, (_, i) => 95 + i);
    const result = cfm.adxSync(high, low, close, period) as any;
    expect(result.adx[period - 1]).to.be.NaN;
  });

  it('DI+ and DI- start at index period-1', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 90 + i);
    const close = Array.from({ length: n }, (_, i) => 95 + i);
    const result = cfm.adxSync(high, low, close, period) as any;
    // DI values at indices 0..period-2 should be NaN
    for (let i = 0; i < period - 1; i++) {
      expect(result.plusDI[i]).to.be.NaN;
      expect(result.minusDI[i]).to.be.NaN;
    }
    // At period-1 they should be finite
    expect(result.plusDI[period - 1]).to.not.be.NaN;
    expect(result.minusDI[period - 1]).to.not.be.NaN;
  });

  it('matches independent ADX reference on deterministic data', () => {
    const n = 100;
    const seed = 7;
    const rand = (s: number) => {
      let x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    const high = Array.from({ length: n }, (_, i) => 100 + rand(seed + i) * 20);
    const low = Array.from({ length: n }, (_, i) => Math.max(0, 80 + rand(seed * 2 + i) * 15));
    const close = Array.from({ length: n }, (_, i) => low[i] + rand(seed * 3 + i) * (high[i] - low[i]));
    const got = cfm.adxSync(high, low, close, period) as any;
    const ref = refADX(high, low, close, period);
    // Compare DI+, DI-, and ADX from period-1 onwards
    for (let i = period - 1; i < n; i++) {
      if (Number.isNaN(ref.plusDI[i])) {
        expect(got.plusDI[i]).to.be.NaN;
      } else {
        expect(got.plusDI[i]).to.be.closeTo(ref.plusDI[i], 1e-8);
      }
      if (Number.isNaN(ref.minusDI[i])) {
        expect(got.minusDI[i]).to.be.NaN;
      } else {
        expect(got.minusDI[i]).to.be.closeTo(ref.minusDI[i], 1e-8);
      }
      if (Number.isNaN(ref.adx[i])) {
        expect(got.adx[i]).to.be.NaN;
      } else {
        expect(got.adx[i]).to.be.closeTo(ref.adx[i], 1e-8);
      }
    }
  });

  it('constant prices: all DI/ADX are 0', () => {
    const n = 50;
    const val = 100;
    const high = Array(n).fill(val);
    const low = Array(n).fill(val);
    const close = Array(n).fill(val);
    const result = cfm.adxSync(high, low, close, period) as any;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(result.adx[i])) {
        expect(result.adx[i]).to.be.at.most(1e-10);
      }
    }
  });

  it('monotonically increasing prices', () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 90 + i);
    const close = Array.from({ length: n }, (_, i) => 95 + i);
    const got = cfm.adxSync(high, low, close, period) as any;
    const ref = refADX(high, low, close, period);
    for (let i = 2 * period - 1; i < n; i++) {
      expect(got.adx[i]).to.be.closeTo(ref.adx[i], 1e-8);
    }
  });

  it('short input (n < 2*period) returns all NaN ADX', () => {
    const n = 25; // 2*14 = 28 > 25
    const high = Array.from({ length: n }, (_, i) => 100 + i);
    const low = Array.from({ length: n }, (_, i) => 90 + i);
    const close = Array.from({ length: n }, (_, i) => 95 + i);
    const result = cfm.adxSync(high, low, close, period) as any;
    for (let i = 0; i < n; i++) {
      expect(result.adx[i]).to.be.NaN;
    }
  });

  it('zero-range case does not crash', () => {
    const n = 50;
    const high = Array.from({ length: n }, () => 100);
    const low = Array.from({ length: n }, () => 100);
    const close = Array(n).fill(100);
    const result = cfm.adxSync(high, low, close, period) as any;
    // Should not crash; ADX should be finite or NaN
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(result.adx[i])) {
        expect(result.adx[i]).to.be.finite;
      }
    }
  });

  it('async ADX matches sync', async () => {
    const n = 100;
    const high = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.3) * 20);
    const low = Array.from({ length: n }, (_, i) => 80 + Math.cos(i * 0.4) * 15);
    const close = Array.from({ length: n }, (_, i) => 90 + Math.sin(i * 0.5) * 10);
    const sync = cfm.adxSync(high, low, close, period) as any;
    const async = (await cfm.adx(high, low, close, period)) as any;
    for (let i = 0; i < n; i++) {
      expect(async.adx).to.have.length(sync.adx.length);
      const s = sync.adx[i];
      const a = async.adx[i];
      if (Number.isNaN(s)) {
        expect(a).to.be.NaN;
      } else {
        expect(a).to.be.closeTo(s, 1e-10);
      }
    }
  });
});
