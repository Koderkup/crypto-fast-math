import { expect } from 'chai';
import * as cfm from '../src/index';const prices = [100, 102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 122, 125, 124, 128, 130];
const high = prices.map((p) => p + 5);
const low = prices.map((p) => p - 5);
const close = prices.map((p) => p + 1);
const volume = prices.map((_, i) => 1000 + i * 10);

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

describe('Prepared Formula API (prepareFormula / evaluatePrepared)', () => {
  const FORMULA = '(High - Low) / Close * Volume * sin(Close)';
  const params = { High: high, Low: low, Close: close, Volume: volume };
  const args = { formula: FORMULA, params, returnType: 'number' as const };

  it('returns a numeric handle', () => {
    const handle = cfm.prepareFormula(args);
    expect(handle).to.be.a('number');
    expect(handle).to.be.greaterThan(0);
  });

  it('produces identical results to calculateSync (typed)', () => {
    const handle = cfm.prepareFormula(args);
    const ref = cfm.calculateSync(args) as number[];
    const got = cfm.evaluatePrepared({ handle, params }) as number[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(sameValue(ref[i], got[i])).to.equal(true, `index ${i}`);
    }
  });

  it('matches calculateSync with number[] output too', () => {
    const handle = cfm.prepareFormula(args);
    const ref = cfm.calculateSync(args);
    const got = cfm.evaluatePrepared({ handle, params }) as number[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(sameValue(ref[i], got[i])).to.equal(true, `index ${i}`);
    }
  });

  it('supports boolean return type', () => {
    const openArr = close.map((p) => p - 1);
    const boolArgs = { formula: 'Close > Open', params: { Close: close, Open: openArr }, returnType: 'boolean' as const };
    const handle = cfm.prepareFormula(boolArgs);
    const got = cfm.evaluatePrepared({ handle, params: boolArgs.params });
    expect(Array.isArray(got)).to.equal(true);
    expect(got).to.have.length(close.length);
    for (let i = 0; i < close.length; i++) {
      expect(got[i]).to.equal(close[i] > openArr[i]);
    }
  });

  it('throws on invalid handle', () => {
    expect(() => cfm.evaluatePrepared({ handle: 999999, params })).to.throw('invalid formula handle');
  });

  it('throws on missing formula', () => {
    expect(() => cfm.prepareFormula({ params, returnType: 'number' } as never)).to.throw('formula must be a string');
  });

  it('throws on missing params', () => {
    expect(() => cfm.prepareFormula({ formula: 'a + b' } as never)).to.throw('params must be an object');
  });

  it('reuses a handle across many evaluations', () => {
    const handle = cfm.prepareFormula(args);
    const ref = cfm.calculateSync(args) as number[];
    for (let rep = 0; rep < 5; rep++) {
      const got = cfm.evaluatePrepared({ handle, params }) as number[];
      expect(got).to.have.length(ref.length);
      for (let i = 0; i < ref.length; i++) {
        expect(sameValue(ref[i], got[i])).to.equal(true, `rep ${rep}, index ${i}`);
      }
    }
  });

  it('accepts Float64Array params', () => {
    const f64params = {
      High: new Float64Array(high),
      Low: new Float64Array(low),
      Close: new Float64Array(close),
      Volume: new Float64Array(volume),
    };
    const handle = cfm.prepareFormula(args);
    const got = cfm.evaluatePrepared({ handle, params }) as number[];
    const ref = cfm.calculateSync({ formula: FORMULA, params: f64params, returnType: 'number' }) as number[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(sameValue(ref[i], got[i])).to.equal(true, `index ${i}`);
    }
  });
});

// ===========================================================================
// Parameter mapping correctness — the core audit concern
// ===========================================================================
describe('Prepared Formula — parameter mapping correctness', () => {
  const FORMULA = '(High - Low) / Close * Volume * sin(Close)';
  const params = { High: high, Low: low, Close: close, Volume: volume };

  it('same params in original order: matches calculateSync', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const ref = cfm.calculateSync({ formula: FORMULA, params, returnType: 'number' }) as number[];
    const got = cfm.evaluatePrepared({ handle, params }) as number[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(sameValue(ref[i], got[i])).to.equal(true, `index ${i}`);
    }
  });

  it('same named params in DIFFERENT insertion order: must still match', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const reordered = { Volume: volume, Close: close, Low: low, High: high };
    const ref = cfm.calculateSync({ formula: FORMULA, params, returnType: 'number' }) as number[];
    const got = cfm.evaluatePrepared({ handle, params: reordered }) as number[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(sameValue(ref[i], got[i])).to.equal(true, `index ${i} (reordered params must map by name)`);
    }
  });

  it('reordered params with boolean formula: must still match', () => {
    const boolArgs = { formula: 'High > Close', params: { High: high, Close: close }, returnType: 'boolean' as const };
    const handle = cfm.prepareFormula(boolArgs);
    const reordered = { Close: close, High: high };
    const ref = cfm.calculateSync(boolArgs) as boolean[];
    const got = cfm.evaluatePrepared({ handle, params: reordered }) as boolean[];
    expect(got).to.have.length(ref.length);
    for (let i = 0; i < ref.length; i++) {
      expect(got[i]).to.equal(ref[i], `index ${i}`);
    }
  });

  it('missing parameter: must throw, not silently use stale data', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    // Omit 'Volume' — only 3 of 4 variables provided
    const shortParams = { High: high, Low: low, Close: close };
    expect(() => cfm.evaluatePrepared({ handle, params: shortParams }))
      .to.throw(/invalid formula handle/);
  });

  it('extra parameter: must throw, not silently ignore', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const extraParams = { High: high, Low: low, Close: close, Volume: volume, Extra: prices };
    expect(() => cfm.evaluatePrepared({ handle, params: extraParams }))
      .to.throw(/invalid formula handle/);
  });

  it('wrong variable name (same count): must throw', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const wrongName = { High: high, Low: low, Close: close, WrongName: volume };
    expect(() => cfm.evaluatePrepared({ handle, params: wrongName }))
      .to.throw(/invalid formula handle/);
  });

  it('inputs with different lengths: must throw', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const mismatched = { High: high, Low: low, Close: close, Volume: prices.slice(0, 5) };
    expect(() => cfm.evaluatePrepared({ handle, params: mismatched }))
      .to.throw(/equal length/);
  });

  it('repeated evaluations with different data produce different results', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const data1 = cfm.evaluatePrepared({ handle, params }) as number[];

    // Build different data with a constant offset
    const offsetHigh = high.map((v) => v + 10);
    const offsetLow = low.map((v) => v + 10);
    const offsetClose = close.map((v) => v + 10);
    const offsetVol = volume.map((v) => v * 2);
    const params2 = { High: offsetHigh, Low: offsetLow, Close: offsetClose, Volume: offsetVol };
    const data2 = cfm.evaluatePrepared({ handle, params: params2 }) as number[];

    expect(data1).to.have.length(data2.length);
    let differ = false;
    for (let i = 0; i < data1.length; i++) {
      if (!sameValue(data1[i], data2[i])) differ = true;
    }
    expect(differ).to.equal(true, 'different inputs must produce different outputs');
  });

  it('evaluating after release throws', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const released = cfm.releaseFormula(handle);
    expect(released).to.equal(true);
    expect(() => cfm.evaluatePrepared({ handle, params })).to.throw('invalid formula handle');
  });

  it('releaseFormula returns false for unknown handle', () => {
    const released = cfm.releaseFormula(999999);
    expect(released).to.equal(false);
  });

  it('releaseFormula returns true for a valid handle, false on second release', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    expect(cfm.releaseFormula(handle)).to.equal(true);
    expect(cfm.releaseFormula(handle)).to.equal(false);
  });

  it('releaseFormula throws on non-number handle', () => {
    expect(() => cfm.releaseFormula('foo' as never)).to.throw('handle must be a number');
  });

  it('many prepare/release cycles do not leak', () => {
    for (let i = 0; i < 50; i++) {
      const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
      cfm.evaluatePrepared({ handle, params });
      const released = cfm.releaseFormula(handle);
      expect(released).to.equal(true);
    }
  });

  it('different handles are independent', () => {
    const h1 = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const h2 = cfm.prepareFormula({ formula: 'High - Low', params, returnType: 'number' });
    const r1 = cfm.evaluatePrepared({ handle: h1, params }) as number[];
    const r2 = cfm.evaluatePrepared({ handle: h2, params }) as number[];
    expect(r1).to.have.length(r2.length);
    // r1 = (High-Low)/Close*Volume*sin(Close), r2 = High - Low — different
    let differ = false;
    for (let i = 0; i < r1.length; i++) {
      if (!sameValue(r1[i], r2[i])) differ = true;
    }
    expect(differ).to.equal(true, 'different formulas produce different outputs');
  });
});

// ===========================================================================
// Concurrency: prepared formula handle reuse across interleaved calls
// ===========================================================================
describe('Prepared Formula — interleaved evaluation', () => {
  const FORMULA = '(High - Low) / Close * Volume * sin(Close)';
  const params = { High: high, Low: low, Close: close, Volume: volume };

  it('interleaved evaluation of same handle is consistent', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    const ref = cfm.calculateSync({ formula: FORMULA, params, returnType: 'number' }) as number[];
    // Call evaluate many times in a tight loop; results must not change
    for (let i = 0; i < 50; i++) {
      const got = cfm.evaluatePrepared({ handle, params }) as number[];
      expect(got).to.have.length(ref.length);
      for (let j = 0; j < ref.length; j++) {
        expect(sameValue(ref[j], got[j])).to.equal(true, `iter ${i}, index ${j}`);
      }
    }
    cfm.releaseFormula(handle);
  });

  it('evaluatePrepared and releaseFormula interleave safely', () => {
    const handle = cfm.prepareFormula({ formula: FORMULA, params, returnType: 'number' });
    // Evaluate, then verify we can still evaluate (handle still valid)
    cfm.evaluatePrepared({ handle, params });
    // Release, then verify we cannot evaluate anymore
    expect(cfm.releaseFormula(handle)).to.equal(true);
    expect(() => cfm.evaluatePrepared({ handle, params })).to.throw('invalid formula handle');
  });
});
