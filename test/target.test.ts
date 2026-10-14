import { expect } from 'chai';
import * as cfm from '../src/index';

const n = 5000;
const prices = Float64Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 100) * 10);
const high = Float64Array.from({ length: n }, (_, i) => 105 + i * 0.01);
const low = Float64Array.from({ length: n }, (_, i) => 95 + i * 0.01);
const close = Float64Array.from({ length: n }, (_, i) => 100 + i * 0.01);
const volume = Float64Array.from({ length: n }, (_, i) => 1000 + i);

describe('target buffer option (zero-allocation)', () => {
  describe('single-output indicators', () => {
    it('smaSync writes into provided Float64Array target', () => {
      const target = new Float64Array(n);
      const result = cfm.smaSync(prices, 20, { target });
      expect(result).to.equal(target);
      const expected = cfm.smaSync(prices, 20, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('rsiSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.rsiSync(prices, 14, { target });
      expect(result).to.equal(target);
      const expected = cfm.rsiSync(prices, 14, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('emaSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.emaSync(prices, 9, { target });
      expect(result).to.equal(target);
      const expected = cfm.emaSync(prices, 9, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('wmaSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.wmaSync(prices, 5, { target });
      expect(result).to.equal(target);
      const expected = cfm.wmaSync(prices, 5, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('hmaSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.hmaSync(prices, 9, { target });
      expect(result).to.equal(target);
      const expected = cfm.hmaSync(prices, 9, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('volatilitySync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.volatilitySync(prices, 10, { target });
      expect(result).to.equal(target);
      const expected = cfm.volatilitySync(prices, 10, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('atrSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.atrSync(high, low, close, 14, { target });
      expect(result).to.equal(target);
      const expected = cfm.atrSync(high, low, close, 14, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('cciSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.cciSync(high, low, close, 20, { target });
      expect(result).to.equal(target);
      const expected = cfm.cciSync(high, low, close, 20, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('williamsRSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.williamsRSync(high, low, close, 14, { target });
      expect(result).to.equal(target);
      const expected = cfm.williamsRSync(high, low, close, 14, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('rocSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.rocSync(prices, 10, { target });
      expect(result).to.equal(target);
      const expected = cfm.rocSync(prices, 10, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('obvSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.obvSync(close, volume, { target });
      expect(result).to.equal(target);
      const expected = cfm.obvSync(close, volume, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('parabolicSARSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.parabolicSARSync(high, low, 0.02, 0.2, { target });
      expect(result).to.equal(target);
      const expected = cfm.parabolicSARSync(high, low, 0.02, 0.2, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('medianPriceSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.medianPriceSync(high, low, { target });
      expect(result).to.equal(target);
      const expected = cfm.medianPriceSync(high, low, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        expect(target[i]).to.be.approximately(expected[i], 1e-9);
      }
    });

    it('typicalPriceSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.typicalPriceSync(high, low, close, { target });
      expect(result).to.equal(target);
      const expected = cfm.typicalPriceSync(high, low, close, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        expect(target[i]).to.be.approximately(expected[i], 1e-9);
      }
    });

    it('vwapSync writes into provided target', () => {
      const target = new Float64Array(n);
      const result = cfm.vwapSync(high, low, close, volume, { target });
      expect(result).to.equal(target);
      const expected = cfm.vwapSync(high, low, close, volume, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });
  });

  describe('target validation', () => {
    it('throws when target length does not match input length', () => {
      const target = new Float64Array(n - 1);
      expect(() => cfm.smaSync(prices, 20, { target })).to.throw(/target buffer length/);
    });

    it('target is mutated in-place (same reference)', () => {
      const target = new Float64Array(n);
      const preFill = 12345;
      target.fill(preFill);
      const result = cfm.smaSync(prices, 20, { target });
      expect(result).to.equal(target);
      let changed = false;
      for (let i = 0; i < n; i++) {
        if (target[i] !== preFill) changed = true;
      }
      expect(changed).to.equal(true);
    });
  });

  describe('JS fallback path with target', () => {
    it('smaSync JS path writes to target', () => {
      // policy: 'js' forces JS implementation
      const small = Float64Array.from({ length: 10 }, (_, i) => i + 1);
      const target = new Float64Array(10);
      const result = cfm.smaSync(small, 3, { target, policy: 'js' });
      expect(result).to.equal(target);
      const expected = cfm.smaSync(small, 3, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < 10; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });

    it('emaSync JS path writes to target', () => {
      const small = Float64Array.from({ length: 10 }, (_, i) => i + 1);
      const target = new Float64Array(10);
      const result = cfm.emaSync(small, 3, { target, policy: 'js' });
      expect(result).to.equal(target);
      const expected = cfm.emaSync(small, 3, { output: 'typed' }) as Float64Array;
      for (let i = 0; i < 10; i++) {
        if (Number.isNaN(expected[i])) {
          expect(Number.isNaN(target[i])).to.equal(true);
        } else {
          expect(target[i]).to.be.approximately(expected[i], 1e-9);
        }
      }
    });
  });

  describe('TypeScript type narrowing', () => {
    it('target overload returns Float64Array type', () => {
      const target = new Float64Array(n);
      const result: Float64Array = cfm.smaSync(prices, 20, { target });
      expect(result).to.be.instanceOf(Float64Array);
    });
  });
});
