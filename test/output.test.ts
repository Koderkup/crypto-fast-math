import { expect } from 'chai';
import * as cfm from '../src/index';


const prices = [100, 102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 122, 125, 124, 128, 130];
const high = prices.map((p) => p + 5);
const low = prices.map((p) => p - 5);
const close = prices.map((p) => p + 1);
const volume = prices.map((_, i) => 1000 + i * 10);
const f64 = new Float64Array(prices);

/** NaN-aware comparison: NaN === NaN is false, but both arrays must still match. */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

describe('Output format (output: array | typed)', () => {
  describe('sync', () => {
    it('returns a plain Array by default', () => {
      const result = cfm.smaSync(prices, 3);
      expect(Array.isArray(result)).to.equal(true);
      expect(result).to.have.length(prices.length);
    });

    it("returns Float64Array with { output: 'typed' }", () => {
      const result = cfm.smaSync(prices, 3, { output: 'typed' });
      expect(result).to.be.instanceOf(Float64Array);
      expect(result).to.have.length(prices.length);
    });

    it('produces identical values in both modes', () => {
      const plain = cfm.smaSync(prices, 3);
      const typed = cfm.smaSync(prices, 3, { output: 'typed' });
      expect(typed).to.be.instanceOf(Float64Array);
      expect(typed).to.have.length(plain.length);
      for (let i = 0; i < plain.length; i++) {
        // NaN !== NaN, so compare through a NaN-aware equality check
        expect(sameValue(typed[i], plain[i])).to.equal(true, `index ${i}`);
      }
    });

    it("treats { output: 'array' } like the default", () => {
      const result = cfm.smaSync(prices, 3, { output: 'array' });
      expect(Array.isArray(result)).to.equal(true);
    });

    it('works with Float64Array input', () => {
      const plain = cfm.emaSync(f64, 4);
      const typed = cfm.emaSync(f64, 4, { output: 'typed' });
      expect(typed).to.be.instanceOf(Float64Array);
      expect(Array.isArray(plain)).to.equal(true);
      expect(typed[typed.length - 1]).to.equal(plain[plain.length - 1]);
    });

    it('converts the fields of multi-output indicators', () => {
      const plain = cfm.bollingerSync(prices, 5);
      const typed = cfm.bollingerSync(prices, 5, undefined, { output: 'typed' });
      expect(Array.isArray(plain.upper)).to.equal(true);
      expect(typed.upper).to.be.instanceOf(Float64Array);
      expect(typed.middle).to.be.instanceOf(Float64Array);
      expect(typed.lower).to.be.instanceOf(Float64Array);
      expect(typed.middle[typed.middle.length - 1]).to.equal(plain.middle[plain.middle.length - 1]);
    });

    it('converts the fields of macd and ichimoku', () => {
      const macd = cfm.macdSync(prices, 3, 6, 3, { output: 'typed' });
      expect(macd.macd).to.be.instanceOf(Float64Array);
      expect(macd.signal).to.be.instanceOf(Float64Array);
      expect(macd.histogram).to.be.instanceOf(Float64Array);

      const ichimoku = cfm.ichimokuSync(high, low, close, { output: 'typed' });
      expect(ichimoku.tenkan).to.be.instanceOf(Float64Array);
      expect(ichimoku.chikou).to.be.instanceOf(Float64Array);
    });

    it('converts multi-column indicators', () => {

  describe('async', () => {
    it('returns a plain Array by default', async () => {
      const result = await cfm.sma(prices, 3);
      expect(Array.isArray(result)).to.equal(true);
      expect(result).to.have.length(prices.length);
    });

    it("resolves to Float64Array with { output: 'typed' }", async () => {
      const result = await cfm.sma(prices, 3, { output: 'typed' });
      expect(result).to.be.instanceOf(Float64Array);
      expect(result).to.have.length(prices.length);
    });

    it('produces identical values in both modes', async () => {
      const plain = await cfm.rsi(prices, 5);
      const typed = await cfm.rsi(prices, 5, { output: 'typed' });
      expect(typed).to.be.instanceOf(Float64Array);
      for (let i = 0; i < plain.length; i++) {
        expect(sameValue(typed[i], plain[i])).to.equal(true, `index ${i}`);
      }
    });

    it('converts the fields of multi-output indicators', async () => {
      const typed = await cfm.macd(prices, 3, 6, 3, { output: 'typed' });
      expect(typed.macd).to.be.instanceOf(Float64Array);
      expect(typed.signal).to.be.instanceOf(Float64Array);
    });
  });

  describe('custom formulas', () => {
    const params = { Close: new Float64Array(prices), Open: new Float64Array(low) };

    it('returns Float64Array when typed is requested', () => {
      const result = cfm.calculateSync(
        { formula: 'Close - Open', params },
        { output: 'typed' },
      );
      expect(result).to.be.instanceOf(Float64Array);
      expect(result).to.have.length(prices.length);
    });

    it('keeps boolean results as a plain Array', () => {
      const result = cfm.calculateSync(
        { formula: 'Close > 110', params, returnType: 'boolean' },
        { output: 'typed' },
      );
      expect(result).to.be.instanceOf(Array);
      expect(result).to.have.length(prices.length);
      expect(result[result.length - 1]).to.be.a('boolean');
    });

    it('accepts Float64Array columns and matches the plain result', () => {
      const plain = cfm.calculateSync({ formula: 'Close * 2', params });
      const typed = cfm.calculateSync({ formula: 'Close * 2', params }, { output: 'typed' });
      expect(typed).to.be.instanceOf(Float64Array);
      expect(typed[typed.length - 1]).to.equal(plain[plain.length - 1]);
    });

    it('respects the option in async mode', async () => {
      const typed = await cfm.calculate({ formula: 'Close * 2', params }, { output: 'typed' });
      expect(typed).to.be.instanceOf(Float64Array);
    });
  });

  describe('input conversion', () => {
    it('gives identical results for number[] and Float64Array input', () => {
      const a = cfm.rsiSync(prices, 5);
      const b = cfm.rsiSync(f64, 5);
      expect(b).to.have.length(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(sameValue(a[i], b[i])).to.equal(true, `index ${i}`);
      }
    });

    it('keeps non-numeric values (null → NaN) when given a mixed number[]', () => {
      // Float64Array.from would coerce null to 0 — the mixed array must pass
      // through untouched so the addon's null → NaN mapping still applies.
      const mixed = [1, null, 3, 4] as unknown as number[];
      const withNull = cfm.smaSync(mixed, 2);
      expect(withNull).to.have.length(4);
      expect(withNull.every((v) => Number.isNaN(v))).to.equal(true);
    });

    it('converts number[] params of calculate() before the native call', () => {
      const result = cfm.calculateSync({
        formula: 'Close - Open',
        params: { Close: [3, 4, 5], Open: [1, 2, 3] },
        returnType: 'number',
      });
      expect(result).to.deep.equal([2, 2, 2]);
    });
  });

  it('multi-column indicators accept the option too', () => {
    const obv = cfm.obvSync(prices, volume, { output: 'typed' });
    expect(obv).to.be.instanceOf(Float64Array);
    expect(obv).to.have.length(prices.length);
  });
});

      const atr = cfm.atrSync(high, low, close, 5, { output: 'typed' });
      expect(atr).to.be.instanceOf(Float64Array);
      const adx = cfm.adxSync(high, low, close, 5, { output: 'typed' });
      expect(adx.adx).to.be.instanceOf(Float64Array);
    });

    it('leaves scalar results untouched', () => {
      const kelly = cfm.kellyCriterionSync(0.6, 100, 50);
      expect(kelly).to.be.a('number');
    });

    it('leaves Uint8Array results untouched', () => {
      const flags = cfm.bullishImpulseSync(prices);
      expect(flags).to.be.instanceOf(Uint8Array);
    });
  });
