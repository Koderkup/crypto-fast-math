import { expect } from 'chai';
import * as cfm from '../src/index';

// Sample price data
const prices = [100, 102, 101, 105, 107, 110, 108, 112, 115, 117, 120];
const high = [105, 107, 106, 110, 112, 115, 113, 117, 120, 122, 125];
const low = [95, 97, 96, 100, 102, 105, 103, 107, 110, 112, 115];
const close = [102, 101, 105, 107, 110, 108, 112, 115, 117, 120, 121];

describe('Indicators (sync)', () => {
  describe('SMA', () => {
    it('should compute simple moving average', () => {
      const result = cfm.smaSync(prices, 3);
      expect(result).to.have.length(prices.length);
      // First 2 should be NaN
      expect(result[0]).to.be.NaN;
      expect(result[1]).to.be.NaN;
      // SMA at index 2 = (100+102+101)/3 = 101
      expect(result[2]).to.be.closeTo(101, 0.001);
      // SMA at index 10 = (115+117+120)/3
      expect(result[10]).to.be.closeTo((115 + 117 + 120) / 3, 0.001);
    });
  });

  describe('EMA', () => {
    it('should compute EMA with correct smoothing', () => {
      const result = cfm.emaSync(prices, 3);
      expect(result).to.have.length(prices.length);
      expect(result[0]).to.be.NaN;
      expect(result[1]).to.be.NaN;
      // EMA seed = SMA, then exponential smoothing
      expect(result[2]).to.be.closeTo((100 + 102 + 101) / 3, 0.001);
    });
  });

  describe('RSI', () => {
    it('should compute RSI values in [0, 100]', () => {
      const result = cfm.rsiSync(prices, 14);
      // With only 11 prices and period 14, results should all be NaN
      result.forEach(v => expect(v).to.be.NaN);
    });

    it('should compute RSI with smaller period', () => {
      const result = cfm.rsiSync(prices, 2);
      expect(result).to.have.length(prices.length);
      // RSI values should be between 0 and 100 (or NaN)
      result.forEach(v => {
        if (!isNaN(v)) {
          expect(v).to.be.within(0, 100);
        }
      });
    });
  });

  describe('Volatility', () => {
    it('should compute rolling standard deviation of returns', () => {
      const result = cfm.volatilitySync(prices, 3);
      expect(result).to.have.length(prices.length);
      expect(result[0]).to.be.NaN;
      expect(result[1]).to.be.NaN;
      expect(result[2]).to.be.closeTo(0, 0.001); // first std dev is 0 (single return)
    });
  });

  describe('Median Price', () => {
    it('should compute (high + low) / 2', () => {
      const result = cfm.medianPriceSync(high, low);
      expect(result).to.have.length(high.length);
      for (let i = 0; i < high.length; i++) {
        expect(result[i]).to.be.closeTo((high[i] + low[i]) / 2, 0.001);
      }
    });
  });

  describe('Typical Price', () => {
    it('should compute (high + low + close) / 3', () => {
      const result = cfm.typicalPriceSync(high, low, close);
      expect(result).to.have.length(high.length);
      for (let i = 0; i < high.length; i++) {
        expect(result[i]).to.be.closeTo((high[i] + low[i] + close[i]) / 3, 0.001);
      }
    });
  });

  describe('Kelly Criterion', () => {
    it('should compute Kelly fraction', () => {
      // Kelly = winRate - (1 - winRate) / (winAvg / lossAvg)
      const result = cfm.kellyCriterionSync(0.6, 200, 100);
      expect(result).to.be.closeTo(0.6 - 0.4 / 2, 0.001); // 0.4
    });

        it('should clamp negative Kelly to zero', () => {
      const result = cfm.kellyCriterionSync(0.3, 100, 200);
      expect(result).to.equal(0);
    });
  });

  describe('MACD', () => {
    it('should return macd, signal, and histogram arrays', () => {
      const result = cfm.macdSync(prices, 12, 26, 9);
      // With only 11 data points, MACD will have many NaN values
      expect(result).to.have.property('macd');
      expect(result).to.have.property('signal');
      expect(result).to.have.property('histogram');
      expect(result.macd).to.have.length(prices.length);
      expect(result.signal).to.have.length(prices.length);
      expect(result.histogram).to.have.length(prices.length);
    });
  });

  describe('Bollinger Bands', () => {
    it('should return upper, middle, lower bands', () => {
      const result = cfm.bollingerSync(prices, 3);
      expect(result).to.have.property('upper');
      expect(result).to.have.property('middle');
      expect(result).to.have.property('lower');
      expect(result.upper).to.have.length(prices.length);
      expect(result.middle).to.have.length(prices.length);
      expect(result.lower).to.have.length(prices.length);
      // Upper should be >= middle >= lower
      for (let i = 2; i < prices.length; i++) {
        expect(result.upper[i]).to.be.at.least(result.middle[i]);
        expect(result.middle[i]).to.be.at.least(result.lower[i]);
      }
    });

    it('should support custom stdDev', () => {
      const result = cfm.bollingerSync(prices, 3, 1.5);
      expect(result.upper).to.have.length(prices.length);
    });
  });

  describe('Bullish Impulse', () => {
    it('should return Uint8Array', () => {
      const result = cfm.bullishImpulseSync(close);
      expect(result).to.be.instanceOf(Uint8Array);
      expect(result).to.have.length(close.length);
      for (let i = 0; i < close.length; i++) {
        expect(result[i]).to.be.oneOf([0, 1]);
      }
    });
  });

  describe('Bearish Impulse', () => {
    it('should return Uint8Array', () => {
      const result = cfm.bearishImpulseSync(close);
      expect(result).to.be.instanceOf(Uint8Array);
      expect(result).to.have.length(close.length);
      for (let i = 0; i < close.length; i++) {
        expect(result[i]).to.be.oneOf([0, 1]);
      }
    });
  });
});

describe('Indicators (async)', () => {
  it('SMA async should match sync', async () => {
    const syncResult = cfm.smaSync(prices, 3);
    const asyncResult = await cfm.sma(prices, 3);
    expect(asyncResult).to.have.length(syncResult.length);
    for (let i = 0; i < syncResult.length; i++) {
      if (isNaN(syncResult[i])) {
        expect(asyncResult[i]).to.be.NaN;
      } else {
        expect(asyncResult[i]).to.be.closeTo(syncResult[i], 0.001);
      }
    }
  });

  it('RSI async should return values in [0, 100]', async () => {
    const result = await cfm.rsi(prices, 2);
    result.forEach(v => {
      if (!isNaN(v)) {
        expect(v).to.be.within(0, 100);
      }
    });
  });

  it('Kelly async should match sync', async () => {
    const sync = cfm.kellyCriterionSync(0.6, 200, 100);
    const asyncRes = await cfm.kellyCriterion(0.6, 200, 100);
    expect(asyncRes).to.be.closeTo(sync, 0.001);
  });
});
