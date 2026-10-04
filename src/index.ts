// src/index.ts — TypeScript wrapper for crypto-fast-math Node-API addon.
import * as path from 'path';

// node-gyp-build has no type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeGypBuild = require('node-gyp-build') as (p?: string) => unknown;

const addonPath = path.join(__dirname, '..');
const native = nodeGypBuild(addonPath) as NativeAddon;

// ===========================================================================
// Native addon interface (mirrors C++ exports in addon.cpp)
// ===========================================================================

export type NumericArray = number[] | Float32Array | Float64Array | Int32Array | Uint32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;

export interface MacdResult { macd: number[]; signal: number[]; histogram: number[]; }
export interface BollingerResult { upper: number[]; middle: number[]; lower: number[]; }
export interface StochasticResult { k: number[]; d: number[]; }
export interface AdxResult { adx: number[]; plusDI: number[]; minusDI: number[]; }
export interface KeltnerResult { upper: number[]; middle: number[]; lower: number[]; }
export interface DonchianResult { upper: number[]; middle: number[]; lower: number[]; }
export interface IchimokuResult { tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]; chikou: number[]; }

interface NativeAddon {
    smaSync(prices: NumericArray, period: number): number[];
  emaSync(prices: NumericArray, period: number): number[];
  rsiSync(prices: NumericArray, period: number): number[];
  volatilitySync(prices: NumericArray, period: number): number[];
  medianPriceSync(high: NumericArray, low: NumericArray): number[];
  typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray): number[];
  kellyCriterionSync(winRate: number, winAvg: number, lossAvg: number): number;
  macdSync(prices: NumericArray, fast: number, slow: number, signal: number): MacdResult;
  bollingerSync(prices: NumericArray, period: number, stdDev?: number): BollingerResult;
  bullishImpulseSync(prices: NumericArray): Uint8Array;
    bearishImpulseSync(prices: NumericArray): Uint8Array;
  stochasticSync(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod?: number, dPeriod?: number): StochasticResult;
  atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
  adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): AdxResult;
    vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): number[];
  obvSync(prices: NumericArray, volume: NumericArray): number[];
  wmaSync(prices: NumericArray, period: number): number[];
  hmaSync(prices: NumericArray, period: number): number[];
  cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
  williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
  momentumSync(prices: NumericArray, period?: number): number[];
  keltnerSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number, mult?: number): KeltnerResult;
  donchianSync(high: NumericArray, low: NumericArray, period?: number): DonchianResult;
  rocSync(prices: NumericArray, period?: number): number[];
  parabolicSARSync(high: NumericArray, low: NumericArray, step?: number, maxStep?: number): number[];
  ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray): IchimokuResult;
  calculateSync(args: CalculateArgs): number[] | boolean[];
  sma(prices: NumericArray, period: number): Promise<number[]>;
  ema(prices: NumericArray, period: number): Promise<number[]>;
  rsi(prices: NumericArray, period: number): Promise<number[]>;
  volatility(prices: NumericArray, period: number): Promise<number[]>;
  medianPrice(high: NumericArray, low: NumericArray): Promise<number[]>;
  typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray): Promise<number[]>;
  kellyCriterion(winRate: number, winAvg: number, lossAvg: number): Promise<number>;
  macd(prices: NumericArray, fast: number, slow: number, signal: number): Promise<MacdResult>;
  bollinger(prices: NumericArray, period: number, stdDev?: number): Promise<BollingerResult>;
  bullishImpulse(prices: NumericArray): Promise<Uint8Array>;
    bearishImpulse(prices: NumericArray): Promise<Uint8Array>;
  stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod?: number, dPeriod?: number): Promise<StochasticResult>;
  atr(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
  adx(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<AdxResult>;
  vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): Promise<number[]>;
  obv(prices: NumericArray, volume: NumericArray): Promise<number[]>;
  wma(prices: NumericArray, period: number): Promise<number[]>;
  hma(prices: NumericArray, period: number): Promise<number[]>;
  cci(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
  williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
  momentum(prices: NumericArray, period?: number): Promise<number[]>;
  keltner(high: NumericArray, low: NumericArray, close: NumericArray, period?: number, mult?: number): Promise<KeltnerResult>;
  donchian(high: NumericArray, low: NumericArray, period?: number): Promise<DonchianResult>;
  roc(prices: NumericArray, period?: number): Promise<number[]>;
  parabolicSAR(high: NumericArray, low: NumericArray, step?: number, maxStep?: number): Promise<number[]>;
  ichimoku(high: NumericArray, low: NumericArray, close: NumericArray): Promise<IchimokuResult>;
  calculate(args: CalculateArgs): Promise<number[] | boolean[]>;
}

// ===========================================================================
// Public types
// ===========================================================================

export type IndicatorResult = number[] | Uint8Array | MacdResult | BollingerResult | StochasticResult | AdxResult | KeltnerResult | DonchianResult | IchimokuResult | number;

export interface CalculateArgs {
  formula: string;
  params: Record<string, NumericArray>;
  returnType?: 'number' | 'boolean' | 'array' | 'auto';
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function assertArray(v: unknown, name: string): void {
  if (!Array.isArray(v) && !(v instanceof Float32Array) && !(v instanceof Float64Array) &&
      !(v instanceof Int32Array) && !(v instanceof Uint32Array) &&
      !(v instanceof Int16Array) && !(v instanceof Uint16Array) &&
      !(v instanceof Int8Array) && !(v instanceof Uint8Array)) {
    throw new TypeError(`${name} must be an array or TypedArray`);
  }
}

function assertNum(v: unknown, name: string): void {
  if (typeof v !== 'number') throw new TypeError(`${name} must be a number`);
}

// ===========================================================================
// Sync API
// ===========================================================================

export function smaSync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.smaSync(prices, period);
}
export function emaSync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.emaSync(prices, period);
}
export function rsiSync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.rsiSync(prices, period);
}
export function volatilitySync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.volatilitySync(prices, period);
}
export function medianPriceSync(high: NumericArray, low: NumericArray): number[] {
  assertArray(high, 'high');
  assertArray(low, 'low');
  return native.medianPriceSync(high, low);
}
export function typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray): number[] {
  assertArray(high, 'high');
  assertArray(low, 'low');
  assertArray(close, 'close');
  return native.typicalPriceSync(high, low, close);
}
export function kellyCriterionSync(winRate: number, winAvg: number, lossAvg: number): number {
  assertNum(winRate, 'winRate');
  assertNum(winAvg, 'winAvg');
  assertNum(lossAvg, 'lossAvg');
  return native.kellyCriterionSync(winRate, winAvg, lossAvg);
}
export function macdSync(prices: NumericArray, fast: number, slow: number, signal: number): MacdResult {
  assertArray(prices, 'prices');
  assertNum(fast, 'fast');
  assertNum(slow, 'slow');
  assertNum(signal, 'signal');
  return native.macdSync(prices, fast, slow, signal);
}
export function bollingerSync(prices: NumericArray, period: number, stdDev: number = 2.0): BollingerResult {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  assertNum(stdDev, 'stdDev');
  return native.bollingerSync(prices, period, stdDev);
}
export function bullishImpulseSync(prices: NumericArray): Uint8Array {
  assertArray(prices, 'prices');
  return native.bullishImpulseSync(prices);
}
export function bearishImpulseSync(prices: NumericArray): Uint8Array {
  assertArray(prices, 'prices');
    return native.bearishImpulseSync(prices);
}

export function stochasticSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  kPeriod: number = 14, dPeriod: number = 3
): StochasticResult {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(kPeriod, 'kPeriod'); assertNum(dPeriod, 'dPeriod');
  return native.stochasticSync(high, low, close, kPeriod, dPeriod);
}

export function atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): number[] {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.atrSync(high, low, close, period);
}

export function adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): AdxResult {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.adxSync(high, low, close, period);
}

export function vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): number[] {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close'); assertArray(volume, 'volume');
  return native.vwapSync(high, low, close, volume);
}

export function obvSync(prices: NumericArray, volume: NumericArray): number[] {
  assertArray(prices, 'prices'); assertArray(volume, 'volume');
  return native.obvSync(prices, volume);
}

export function wmaSync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.wmaSync(prices, period);
}

export function hmaSync(prices: NumericArray, period: number): number[] {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.hmaSync(prices, period);
}

export function cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20): number[] {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.cciSync(high, low, close, period);
}

export function williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): number[] {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.williamsRSync(high, low, close, period);
}

export function momentumSync(prices: NumericArray, period: number = 10): number[] {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.momentumSync(prices, period);
}

export function keltnerSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  period: number = 20, mult: number = 2.0
): KeltnerResult {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period'); assertNum(mult, 'mult');
  return native.keltnerSync(high, low, close, period, mult);
}

export function donchianSync(high: NumericArray, low: NumericArray, period: number = 20): DonchianResult {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(period, 'period');
  return native.donchianSync(high, low, period);
}

export function rocSync(prices: NumericArray, period: number = 10): number[] {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.rocSync(prices, period);
}

export function parabolicSARSync(high: NumericArray, low: NumericArray, step: number = 0.02, maxStep: number = 0.2): number[] {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(step, 'step'); assertNum(maxStep, 'maxStep');
  return native.parabolicSARSync(high, low, step, maxStep);
}

export function ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray): IchimokuResult {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  return native.ichimokuSync(high, low, close);
}
export function calculateSync({ formula, params, returnType = 'auto' }: CalculateArgs): number[] | boolean[] {
  if (typeof formula !== 'string') throw new TypeError('formula must be a string');
  if (typeof params !== 'object' || params === null) throw new TypeError('params must be an object');
  for (const [name, col] of Object.entries(params)) assertArray(col, `params.${name}`);
  const rt = returnType as 'number' | 'boolean' | 'array' | 'auto';
  return native.calculateSync({ formula, params, returnType: rt });
}

// ===========================================================================
// Async API (Promises)
// ===========================================================================

export function sma(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.sma(prices, period);
}
export function ema(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.ema(prices, period);
}
export function rsi(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.rsi(prices, period);
}
export function volatility(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.volatility(prices, period);
}
export function medianPrice(high: NumericArray, low: NumericArray): Promise<number[]> {
  assertArray(high, 'high');
  assertArray(low, 'low');
  return native.medianPrice(high, low);
}
export function typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray): Promise<number[]> {
  assertArray(high, 'high');
  assertArray(low, 'low');
  assertArray(close, 'close');
  return native.typicalPrice(high, low, close);
}
export function kellyCriterion(winRate: number, winAvg: number, lossAvg: number): Promise<number> {
  assertNum(winRate, 'winRate');
  assertNum(winAvg, 'winAvg');
  assertNum(lossAvg, 'lossAvg');
  return native.kellyCriterion(winRate, winAvg, lossAvg);
}
export function macd(prices: NumericArray, fast: number, slow: number, signal: number): Promise<MacdResult> {
  assertArray(prices, 'prices');
  assertNum(fast, 'fast');
  assertNum(slow, 'slow');
  assertNum(signal, 'signal');
  return native.macd(prices, fast, slow, signal);
}
export function bollinger(prices: NumericArray, period: number, stdDev: number = 2.0): Promise<BollingerResult> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  assertNum(stdDev, 'stdDev');
  return native.bollinger(prices, period, stdDev);
}
export function bullishImpulse(prices: NumericArray): Promise<Uint8Array> {
  assertArray(prices, 'prices');
  return native.bullishImpulse(prices);
}
export function bearishImpulse(prices: NumericArray): Promise<Uint8Array> {
  assertArray(prices, 'prices');
    return native.bearishImpulse(prices);
}

export function stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod: number = 14, dPeriod: number = 3): Promise<StochasticResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(kPeriod, 'kPeriod'); assertNum(dPeriod, 'dPeriod');
  return native.stochastic(high, low, close, kPeriod, dPeriod);
}

export function atr(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): Promise<number[]> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.atr(high, low, close, period);
}

export function adx(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): Promise<AdxResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.adx(high, low, close, period);
}

export function vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): Promise<number[]> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close'); assertArray(volume, 'volume');
  return native.vwap(high, low, close, volume);
}

export function obv(prices: NumericArray, volume: NumericArray): Promise<number[]> {
  assertArray(prices, 'prices'); assertArray(volume, 'volume');
  return native.obv(prices, volume);
}

export function wma(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.wma(prices, period);
}

export function hma(prices: NumericArray, period: number): Promise<number[]> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.hma(prices, period);
}

export function cci(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20): Promise<number[]> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.cci(high, low, close, period);
}

export function williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14): Promise<number[]> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.williamsR(high, low, close, period);
}

export function momentum(prices: NumericArray, period: number = 10): Promise<number[]> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.momentum(prices, period);
}

export function keltner(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20, mult: number = 2.0): Promise<KeltnerResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period'); assertNum(mult, 'mult');
  return native.keltner(high, low, close, period, mult);
}

export function donchian(high: NumericArray, low: NumericArray, period: number = 20): Promise<DonchianResult> {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(period, 'period');
  return native.donchian(high, low, period);
}

export function roc(prices: NumericArray, period: number = 10): Promise<number[]> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.roc(prices, period);
}

export function parabolicSAR(high: NumericArray, low: NumericArray, step: number = 0.02, maxStep: number = 0.2): Promise<number[]> {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(step, 'step'); assertNum(maxStep, 'maxStep');
  return native.parabolicSAR(high, low, step, maxStep);
}

export function ichimoku(high: NumericArray, low: NumericArray, close: NumericArray): Promise<IchimokuResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  return native.ichimoku(high, low, close);
}

export function calculate({ formula, params, returnType = 'auto' }: CalculateArgs): Promise<number[] | boolean[]> {
  if (typeof formula !== 'string') throw new TypeError('formula must be a string');
  if (typeof params !== 'object' || params === null) throw new TypeError('params must be an object');
  for (const [name, col] of Object.entries(params)) assertArray(col, `params.${name}`);
  const rt = returnType as 'number' | 'boolean' | 'array' | 'auto';
  return native.calculate({ formula, params, returnType: rt });
}


