import { expect } from 'chai';
import * as cfm from '../src/index';

const prices = [100, 102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 122, 125, 124, 128, 130];
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
