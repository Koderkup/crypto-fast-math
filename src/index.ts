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
  calculate(args: CalculateArgs): Promise<number[] | boolean[]>;
}

// ===========================================================================
// Public types
// ===========================================================================

export type IndicatorResult = number[] | Uint8Array | MacdResult | BollingerResult | number;

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
export function calculate({ formula, params, returnType = 'auto' }: CalculateArgs): Promise<number[] | boolean[]> {
  if (typeof formula !== 'string') throw new TypeError('formula must be a string');
  if (typeof params !== 'object' || params === null) throw new TypeError('params must be an object');
  for (const [name, col] of Object.entries(params)) assertArray(col, `params.${name}`);
  const rt = returnType as 'number' | 'boolean' | 'array' | 'auto';
  return native.calculate({ formula, params, returnType: rt });
}


