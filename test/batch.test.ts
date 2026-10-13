import { expect } from 'chai';
import * as cfm from '../src/index';


function makePrices(n: number): Float64Array {
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) arr[i] = 100 + i * 0.1 + 5 * Math.sin(i / 10);
  return arr;
}

describe('Batch API', () => {
  const n = 200;
  const prices = makePrices(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const volume = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    high[i] = prices[i] + 3;
    low[i] = prices[i] - 3;
    close[i] = prices[i] + 0.5;
    volume[i] = 1000 + i * 10;
  }

  describe('batchSync', () => {
    it('computes multiple indicators in one call', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: { sma: 14, ema: 14, rsi: 14 }
      });
      expect(result.sma).to.have.length(n);
      expect(result.ema).to.have.length(n);
      expect(result.rsi).to.have.length(n);
      expect(result.sma![13]).to.be.finite;
      expect(result.ema![13]).to.be.finite;
    });

    it('returns Float64Array by default (no conversion overhead)', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: { sma: 14 }
      });
      expect(result.sma).to.be.instanceOf(Array);
      expect(result.sma![13]).to.be.finite;
    });

    it('returns Float64Array with { output: "typed" }', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: { sma: 14 }
      }, { output: 'typed' } as any);
      expect(result.sma).to.be.instanceOf(Float64Array);
    });

    it('matches individual indicator results', () => {
      const batch = cfm.batchSync({
        input: { prices },
        indicators: { sma: 14, ema: 14, rsi: 14, wma: 14, hma: 14 }
      });
      const smaRef = cfm.smaSync(prices, 14, { output: 'typed' } as any);
      const emaRef = cfm.emaSync(prices, 14, { output: 'typed' } as any);
      const rsiRef = cfm.rsiSync(prices, 14, { output: 'typed' } as any);
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(smaRef[i])) {
          expect(batch.sma![i]).to.be.approximately(smaRef[i], 1e-9);
        } else {
          expect(Number.isNaN(batch.sma![i])).to.equal(true);
        }
        if (Number.isFinite(emaRef[i])) {
          expect(batch.ema![i]).to.be.approximately(emaRef[i], 1e-9);
        } else {
          expect(Number.isNaN(batch.ema![i])).to.equal(true);
        }
        if (Number.isFinite(rsiRef[i])) {
          expect(batch.rsi![i]).to.be.approximately(rsiRef[i], 1e-9);
        } else {
          expect(Number.isNaN(batch.rsi![i])).to.equal(true);
        }
      }
    });

    it('supports high/low/close/volume inputs', () => {
      const result = cfm.batchSync({
        input: { prices, high, low, close, volume },
        indicators: { atr: 14, cci: 20, vwap: true, obv: true }
      });
      expect(result.atr).to.have.length(n);
      expect(result.cci).to.have.length(n);
      expect(result.vwap).to.have.length(n);
      expect(result.obv).to.have.length(n);
    });

    it('supports multi-output indicators (macd, bollinger)', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: {
          sma: 14,
          macdFast: 12, macdSlow: 26, macdSignal: 9,
          bollinger: 20, bollingerStdDev: 2
        }
      });
      expect(result.macd).to.exist;
      expect(result.macd!.macd).to.have.length(n);
      expect(result.macd!.signal).to.have.length(n);
      expect(result.macd!.histogram).to.have.length(n);
      expect(result.bollinger!.upper).to.have.length(n);
      expect(result.bollinger!.middle).to.have.length(n);
      expect(result.bollinger!.lower).to.have.length(n);
    });

    it('macd signal line is finite after warm-up (regression test)', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: { macdFast: 12, macdSlow: 26, macdSignal: 9 }
      });
      expect(Number.isNaN(result.macd!.signal[32])).to.equal(true);
      expect(Number.isFinite(result.macd!.signal[33])).to.equal(true);
    });

    it('supports stochastic, adx, keltner, donchian, ichimoku', () => {
      const result = cfm.batchSync({
        input: { prices, high, low, close },
        indicators: {
          stochasticK: 14, stochasticD: 3,
          adx: 14,
          keltner: 20,
          donchian: 20
        }
      });
      expect(result.stochastic!.k).to.have.length(n);
      expect(result.stochastic!.d).to.have.length(n);
      expect(result.adx!.adx).to.have.length(n);
      expect(result.keltner!.upper).to.have.length(n);
      expect(result.donchian!.upper).to.have.length(n);
    });

    it('supports ichimoku and parabolic SAR', () => {
      const result = cfm.batchSync({
        input: { prices, high, low, close },
        indicators: { ichimoku: true, parabolicSAR: true }
      });
      expect(result.ichimoku!.tenkan).to.have.length(n);
      expect(result.ichimoku!.kijun).to.have.length(n);
      expect(result.ichimoku!.senkouA).to.have.length(n);
      expect(result.ichimoku!.senkouB).to.have.length(n);
      expect(result.ichimoku!.chikou).to.have.length(n);
      expect(result.parabolicSAR).to.have.length(n);
    });

    it('omits unrequested indicators', () => {
      const result = cfm.batchSync({
        input: { prices },
        indicators: { sma: 14 }
      });
      expect(result.sma).to.exist;
      expect(result.ema).to.be.undefined;
      expect(result.rsi).to.be.undefined;
    });

    it('throws on invalid input', () => {
      expect(() => cfm.batchSync({ input: null as any, indicators: { sma: 14 } }))
        .to.throw('input must be an object');
      expect(() => cfm.batchSync({ input: { prices }, indicators: null as any }))
        .to.throw('indicators must be an object');
    });
  });

  describe('batch (async)', () => {
    it('computes multiple indicators asynchronously', async () => {
      const result = await cfm.batch({
        input: { prices },
        indicators: { sma: 14, ema: 14, rsi: 14 }
      });
      expect(result.sma).to.have.length(n);
      expect(result.ema).to.have.length(n);
      expect(result.rsi).to.have.length(n);
    });

    it('returns Float64Array with { output: "typed" }', async () => {
      const result = await cfm.batch({
        input: { prices },
        indicators: { sma: 14 }
      }, { output: 'typed' } as any);
      expect(result.sma).to.be.instanceOf(Float64Array);
    });

    it('matches sync results', async () => {
      const syncResult = cfm.batchSync({
        input: { prices, high, low, close },
        indicators: {
          sma: 14, ema: 14, rsi: 14,
          macdFast: 12, macdSlow: 26, macdSignal: 9,
          bollinger: 20
        }
      });
      const asyncResult = await cfm.batch({
        input: { prices, high, low, close },
        indicators: {
          sma: 14, ema: 14, rsi: 14,
          macdFast: 12, macdSlow: 26, macdSignal: 9,
          bollinger: 20
        }
      });
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(syncResult.sma![i])) {
          expect(asyncResult.sma![i]).to.be.approximately(syncResult.sma![i], 1e-9);
        }
      }
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(syncResult.macd!.signal[i])) {
          expect(asyncResult.macd!.signal[i]).to.be.approximately(syncResult.macd!.signal[i], 1e-9);
        }
      }
    });
  });
});
