import { expect } from 'chai';
import * as cfm from '../src/index';

const prices = [10, 20, 30, 40, 50];
const opens = [8, 18, 28, 38, 48];
const highs = [12, 22, 32, 42, 52];
const lows = [7, 17, 27, 37, 47];
const closes = [10, 20, 30, 40, 50];

describe('Custom Formula Engine (ExprTk)', () => {
  describe('calculateSync', () => {
    it('should evaluate arithmetic on multiple columns', () => {
      const result: any = cfm.calculateSync({
        formula: '(Close + Open) / 2',
        params: { Close: closes, Open: opens },
        returnType: 'number',
      });
      expect(result).to.have.length(5);
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo((closes[i] + opens[i]) / 2, 0.001);
      }
    });

    it('should handle single-column formulas', () => {
      const result: any = cfm.calculateSync({
        formula: 'Close * 2',
        params: { Close: closes },
      });
      expect(result).to.have.length(5);
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo(closes[i] * 2, 0.001);
      }
    });

    it('should support boolean comparisons', () => {
      const result: any = cfm.calculateSync({
        formula: 'Close > Open',
        params: { Close: closes, Open: opens },
      });
      expect(result).to.have.length(5);
      // Close=[10,20,30,40,50], Open=[8,18,28,38,48] → all true
      expect(result.every((v: boolean) => v === true)).to.be.true;
    });

    it('should support mathematical functions', () => {
      const result: any = cfm.calculateSync({
        formula: 'sqrt(Close)',
        params: { Close: closes },
        returnType: 'number',
      });
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo(Math.sqrt(closes[i]), 0.001);
      }
    });

    it('should auto-detect return type', () => {
      const result: any = cfm.calculateSync({
        formula: '(High + Low) / 2',
        params: { High: highs, Low: lows },
      });
      expect(result).to.have.length(5);
      expect(result).to.be.an('array');
      expect(typeof result[0]).to.equal('number');
    });

    it('should handle compound formulas', () => {
      const result: any = cfm.calculateSync({
        formula: '((High - Low) / Close) * 100',
        params: { High: highs, Low: lows, Close: closes },
      });
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo(((highs[i] - lows[i]) / closes[i]) * 100, 0.001);
      }
    });

    it('should use ExprTk constants', () => {
      const result: any = cfm.calculateSync({
        formula: 'pi * Close',
        params: { Close: closes },
      });
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo(Math.PI * closes[i], 0.001);
      }
    });
  });

  describe('calculate (async)', () => {
    it('should return a Promise that resolves with results', async () => {
      const result: any = await cfm.calculate({
        formula: '(Close + Open) / 2',
        params: { Close: closes, Open: opens },
        returnType: 'number',
      });
      expect(result).to.have.length(5);
      for (let i = 0; i < 5; i++) {
        expect(result[i]).to.be.closeTo((closes[i] + opens[i]) / 2, 0.001);
      }
    });

    it('should support boolean formulas', async () => {
      const result: any = await cfm.calculate({
        formula: 'Close > 15',
        params: { Close: closes },
      });
      expect(result).to.have.length(5);
      expect(result[0]).to.equal(false);  // 10 < 15
      expect(result[1]).to.equal(true);   // 20 > 15
      expect(result[2]).to.equal(true);   // 30 > 15
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid formula', () => {
      expect(() => cfm.calculateSync({
        formula: 'this is not valid syntax !!!',
        params: { Close: closes },
      })).to.throw();
    });

    it('should throw on missing params', () => {
      expect(() => cfm.calculateSync({
        formula: 'Close + Open',
        params: { Close: closes },
      })).to.throw(/Open/);
    });
  });
});
