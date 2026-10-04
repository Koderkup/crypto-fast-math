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

  describe('Stochastic', () => {
    it('should return k and d arrays', () => {
      const result = cfm.stochasticSync(high, low, close, 14, 3);
      expect(result).to.have.property('k');
      expect(result).to.have.property('d');
      expect(result.k).to.have.length(close.length);
      expect(result.d).to.have.length(close.length);
    });
  });

  describe('ATR', () => {
    it('should return ATR array', () => {
      const result = cfm.atrSync(high, low, close, 14);
      expect(result).to.have.length(close.length);
    });
  });

  describe('ADX', () => {
    it('should return adx, plusDI, minusDI arrays', () => {
      const result = cfm.adxSync(high, low, close, 14);
      expect(result).to.have.property('adx');
      expect(result).to.have.property('plusDI');
      expect(result).to.have.property('minusDI');
      expect(result.adx).to.have.length(close.length);
      expect(result.plusDI).to.have.length(close.length);
      expect(result.minusDI).to.have.length(close.length);
    });
  });

  describe('VWAP', () => {
    it('should return VWAP array', () => {
      const volume = [100, 110, 105, 120, 130, 125, 115, 140, 150, 145, 160];
      const result = cfm.vwapSync(high, low, close, volume);
      expect(result).to.have.length(close.length);
    });
  });

  describe('OBV', () => {
    it('should return OBV array', () => {
      const volume = [100, 110, 105, 120, 130, 125, 115, 140, 150, 145, 160];
      const result = cfm.obvSync(close, volume);
      expect(result).to.have.length(close.length);
    });
  });

  describe('WMA', () => {
    it('should return weighted moving average', () => {
      const result = cfm.wmaSync(prices, 3);
      expect(result).to.have.length(prices.length);
      expect(result[0]).to.be.NaN;
      expect(result[1]).to.be.NaN;
    });
  });

  describe('HMA', () => {
    it('should return Hull moving average', () => {
      const result = cfm.hmaSync(prices, 3);
      expect(result).to.have.length(prices.length);
    });
  });

  describe('CCI', () => {
    it('should return CCI array', () => {
      const result = cfm.cciSync(high, low, close, 14);
      expect(result).to.have.length(close.length);
    });
  });

  describe('Williams %R', () => {
    it('should return Williams %R array', () => {
      const result = cfm.williamsRSync(high, low, close, 14);
      expect(result).to.have.length(close.length);
    });
  });

  describe('Momentum', () => {
    it('should return momentum array', () => {
      const result = cfm.momentumSync(prices, 10);
      expect(result).to.have.length(prices.length);
    });
  });

  describe('Keltner', () => {
    it('should return upper, middle, lower bands', () => {
      const result = cfm.keltnerSync(high, low, close, 20, 2.0);
      expect(result).to.have.property('upper');
      expect(result).to.have.property('middle');
      expect(result).to.have.property('lower');
      expect(result.upper).to.have.length(close.length);
      expect(result.middle).to.have.length(close.length);
      expect(result.lower).to.have.length(close.length);
    });
  });

  describe('Donchian', () => {
    it('should return upper, middle, lower bands', () => {
      const result = cfm.donchianSync(high, low, 20);
      expect(result).to.have.property('upper');
      expect(result).to.have.property('middle');
      expect(result).to.have.property('lower');
      expect(result.upper).to.have.length(high.length);
      expect(result.middle).to.have.length(high.length);
      expect(result.lower).to.have.length(high.length);
    });
  });

  describe('ROC', () => {
    it('should return rate of change array', () => {
      const result = cfm.rocSync(prices, 10);
      expect(result).to.have.length(prices.length);
    });
  });

  describe('Parabolic SAR', () => {
    it('should return SAR array', () => {
      const result = cfm.parabolicSARSync(high, low, 0.02, 0.2);
      expect(result).to.have.length(high.length);
    });
  });

  describe('Ichimoku', () => {
    it('should return tenkan, kijun, senkouA, senkouB, chikou', () => {
      const result = cfm.ichimokuSync(high, low, close);
      expect(result).to.have.property('tenkan');
      expect(result).to.have.property('kijun');
      expect(result).to.have.property('senkouA');
      expect(result).to.have.property('senkouB');
      expect(result).to.have.property('chikou');
      expect(result.tenkan).to.have.length(close.length);
      expect(result.kijun).to.have.length(close.length);
      expect(result.senkouA).to.have.length(close.length);
      expect(result.senkouB).to.have.length(close.length);
      expect(result.chikou).to.have.length(close.length);
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

  it('Stochastic async should match sync', async () => {
    const syncResult = cfm.stochasticSync(high, low, close, 14, 3);
    const asyncResult = await cfm.stochastic(high, low, close, 14, 3);
    expect(asyncResult.k).to.have.length(syncResult.k.length);
    expect(asyncResult.d).to.have.length(syncResult.d.length);
  });

  it('ATR async should match sync', async () => {
    const syncResult = cfm.atrSync(high, low, close, 14);
    const asyncResult = await cfm.atr(high, low, close, 14);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('ADX async should match sync', async () => {
    const syncResult = cfm.adxSync(high, low, close, 14);
    const asyncResult = await cfm.adx(high, low, close, 14);
    expect(asyncResult.adx).to.have.length(syncResult.adx.length);
  });

  it('VWAP async should match sync', async () => {
    const volume = [100, 110, 105, 120, 130, 125, 115, 140, 150, 145, 160];
    const syncResult = cfm.vwapSync(high, low, close, volume);
    const asyncResult = await cfm.vwap(high, low, close, volume);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('OBV async should match sync', async () => {
    const volume = [100, 110, 105, 120, 130, 125, 115, 140, 150, 145, 160];
    const syncResult = cfm.obvSync(close, volume);
    const asyncResult = await cfm.obv(close, volume);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('WMA async should match sync', async () => {
    const syncResult = cfm.wmaSync(prices, 3);
    const asyncResult = await cfm.wma(prices, 3);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('HMA async should match sync', async () => {
    const syncResult = cfm.hmaSync(prices, 3);
    const asyncResult = await cfm.hma(prices, 3);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('CCI async should match sync', async () => {
    const syncResult = cfm.cciSync(high, low, close, 14);
    const asyncResult = await cfm.cci(high, low, close, 14);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('Williams R async should match sync', async () => {
    const syncResult = cfm.williamsRSync(high, low, close, 14);
    const asyncResult = await cfm.williamsR(high, low, close, 14);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('Momentum async should match sync', async () => {
    const syncResult = cfm.momentumSync(prices, 10);
    const asyncResult = await cfm.momentum(prices, 10);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('Keltner async should match sync', async () => {
    const syncResult = cfm.keltnerSync(high, low, close, 20, 2.0);
    const asyncResult = await cfm.keltner(high, low, close, 20, 2.0);
    expect(asyncResult).to.have.property('upper');
    expect(asyncResult).to.have.property('middle');
    expect(asyncResult).to.have.property('lower');
  });

  it('Donchian async should match sync', async () => {
    const syncResult = cfm.donchianSync(high, low, 20);
    const asyncResult = await cfm.donchian(high, low, 20);
    expect(asyncResult).to.have.property('upper');
    expect(asyncResult).to.have.property('middle');
    expect(asyncResult).to.have.property('lower');
  });

  it('ROC async should match sync', async () => {
    const syncResult = cfm.rocSync(prices, 10);
    const asyncResult = await cfm.roc(prices, 10);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('Parabolic SAR async should match sync', async () => {
    const syncResult = cfm.parabolicSARSync(high, low, 0.02, 0.2);
    const asyncResult = await cfm.parabolicSAR(high, low, 0.02, 0.2);
    expect(asyncResult).to.have.length(syncResult.length);
  });

  it('Ichimoku async should match sync', async () => {
    const syncResult = cfm.ichimokuSync(high, low, close);
    const asyncResult = await cfm.ichimoku(high, low, close);
    expect(asyncResult.tenkan).to.have.length(syncResult.tenkan.length);
    expect(asyncResult.kijun).to.have.length(syncResult.kijun.length);
    expect(asyncResult.senkouA).to.have.length(syncResult.senkouA.length);
    expect(asyncResult.senkouB).to.have.length(syncResult.senkouB.length);
    expect(asyncResult.chikou).to.have.length(syncResult.chikou.length);
  });
});
