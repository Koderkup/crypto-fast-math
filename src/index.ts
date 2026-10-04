// src/index.ts — TypeScript wrapper for crypto-fast-math Node-API addon.
import * as path from 'path';

// node-gyp-build has no type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeGypBuild = require('node-gyp-build') as (p?: string) => unknown;

const addonPath = path.join(__dirname, '..');

export interface OutputOptions {
  /** `'array'` (default) → plain `number[]`; `'typed'` → `Float64Array`. */
  output?: 'array' | 'typed';
}

/** Options object that switches a call to zero-copy typed output. */
export interface TypedOutput extends OutputOptions { output: 'typed'; }

/** Maps a result type to its `{ output: 'typed' }` counterpart (recursively). */
export type TypedResult<T> =
  T extends number[] ? Float64Array :
  T extends ArrayBufferView ? T :
  T extends Promise<infer U> ? Promise<TypedResult<U>> :
  T extends object ? { [K in keyof T]: TypedResult<T[K]> } :
  T;

type NativeFn = (...args: unknown[]) => unknown;

/** Float64Array → number[]. ~3x faster than Array.from() on large arrays. */
function toNumberArray(src: Float64Array): number[] {
  const n = src.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = src[i];
  return out;
}

/** Converts a native result — and the fields of a native result object — to number[]. */
function plainify(value: unknown): unknown {
  if (value instanceof Float64Array) return toNumberArray(value);
  if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
      !ArrayBuffer.isView(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) obj[key] = plainify(obj[key]);
  }
  return value;
}

/** True when the last argument is an `{ output: 'typed' }` request. */
function isTypedRequest(args: unknown[]): boolean {
  const last = args[args.length - 1];
  return last !== null && typeof last === 'object' && (last as OutputOptions).output === 'typed';
}

/**
 * Prepares input columns for the addon.
 *
 * The addon reads a plain `number[]` element by element through N-API, which
 * costs ~12 ms per 100k values (measured), while a single `Float64Array.from()`
 * costs ~0.5 ms — converting here is roughly 20x cheaper than letting the addon
 * walk the array, so plain arrays are cast once in JS before the call.
 *
 * Arrays containing anything other than numbers are passed through untouched:
 * they must keep their existing semantics instead of being coerced by
 * `Float64Array.from()` (e.g. `null` would silently become `0`).
 *
 * Typed arrays, numbers and the trailing options object are returned as-is.
 */
function prepareInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'number') return value;
    }
    return Float64Array.from(value as number[]);
  }
  // calculate({ formula, params: { Close: [...], ... } })
  if (value !== null && typeof value === 'object') {
    const candidate = value as Partial<CalculateArgs>;
    if (typeof candidate.formula === 'string' && candidate.params !== null &&
        typeof candidate.params === 'object' && !ArrayBuffer.isView(candidate.params)) {
      const params: Record<string, NumericArray> = {};
      for (const [key, column] of Object.entries(candidate.params)) {
        params[key] = prepareInput(column) as NumericArray;
      }
      return { ...value, params } as CalculateArgs;
    }
  }
  return value;
}

/**
 * Wraps the addon so every export understands the trailing `{ output }` option
 * and returns plain arrays by default. The option is stripped here — the C++ side
 * always returns Float64Array and never sees it.
 */
function buildNative(raw: Record<string, unknown>): Record<string, NativeFn> {
  const wrapped: Record<string, NativeFn> = {};
  for (const [name, fn] of Object.entries(raw)) {
    if (typeof fn !== 'function') continue;
    wrapped[name] = (...args: unknown[]): unknown => {
      const typed = isTypedRequest(args);
      const callArgs = typed ? args.slice(0, -1) : args;
      const prepared = callArgs.map(prepareInput);
      const result = (fn as NativeFn).apply(raw, prepared);
      if (typed) return result;
      return result instanceof Promise ? result.then(plainify) : plainify(result);
    };
  }
  return wrapped;
}

/** Native addon with marshalling applied; accepts an extra trailing `opts`. */
type NativeWithOptions = {
  [K in keyof NativeAddon]: NativeAddon[K] extends (...args: infer A) => infer R
    ? (...args: [...A, opts?: OutputOptions]) => R
    : NativeAddon[K];
};

const native = buildNative(nodeGypBuild(addonPath) as Record<string, unknown>) as NativeWithOptions;

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

export function smaSync(prices: NumericArray, period: number): number[];
export function smaSync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function smaSync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function smaSync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.smaSync(prices, period, opts);
}
export function emaSync(prices: NumericArray, period: number): number[];
export function emaSync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function emaSync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function emaSync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.emaSync(prices, period, opts);
}
export function rsiSync(prices: NumericArray, period: number): number[];
export function rsiSync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function rsiSync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function rsiSync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.rsiSync(prices, period, opts);
}
export function volatilitySync(prices: NumericArray, period: number): number[];
export function volatilitySync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function volatilitySync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function volatilitySync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.volatilitySync(prices, period, opts);
}
export function medianPriceSync(high: NumericArray, low: NumericArray): number[];
export function medianPriceSync(high: NumericArray, low: NumericArray, opts: TypedOutput): Float64Array;
export function medianPriceSync(high: NumericArray, low: NumericArray, opts: OutputOptions): number[];
export function medianPriceSync(high: NumericArray, low: NumericArray, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high');
  assertArray(low, 'low');
  return native.medianPriceSync(high, low, opts);
}
export function typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray): number[];
export function typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray, opts: TypedOutput): Float64Array;
export function typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray, opts: OutputOptions): number[];
export function typicalPriceSync(high: NumericArray, low: NumericArray, close: NumericArray, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high');
  assertArray(low, 'low');
  assertArray(close, 'close');
  return native.typicalPriceSync(high, low, close, opts);
}
export function kellyCriterionSync(winRate: number, winAvg: number, lossAvg: number): number {
  assertNum(winRate, 'winRate');
  assertNum(winAvg, 'winAvg');
  assertNum(lossAvg, 'lossAvg');
  return native.kellyCriterionSync(winRate, winAvg, lossAvg);
}
export function macdSync(prices: NumericArray, fast: number, slow: number, signal: number): MacdResult;
export function macdSync(prices: NumericArray, fast: number, slow: number, signal: number, opts: TypedOutput): TypedResult<MacdResult>;
export function macdSync(prices: NumericArray, fast: number, slow: number, signal: number, opts: OutputOptions): MacdResult;
export function macdSync(prices: NumericArray, fast: number, slow: number, signal: number, opts?: OutputOptions): MacdResult | TypedResult<MacdResult> {
  assertArray(prices, 'prices');
  assertNum(fast, 'fast');
  assertNum(slow, 'slow');
  assertNum(signal, 'signal');
  return native.macdSync(prices, fast, slow, signal, opts);
}
export function bollingerSync(prices: NumericArray, period: number, stdDev?: number): BollingerResult;
export function bollingerSync(prices: NumericArray, period: number, stdDev: number | undefined, opts: TypedOutput): TypedResult<BollingerResult>;
export function bollingerSync(prices: NumericArray, period: number, stdDev: number | undefined, opts: OutputOptions): BollingerResult;
export function bollingerSync(prices: NumericArray, period: number, stdDev: number = 2.0, opts?: OutputOptions): BollingerResult | TypedResult<BollingerResult> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  assertNum(stdDev, 'stdDev');
  return native.bollingerSync(prices, period, stdDev, opts);
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
  kPeriod?: number, dPeriod?: number
): StochasticResult;
export function stochasticSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  kPeriod: number | undefined, dPeriod: number | undefined, opts: TypedOutput
): TypedResult<StochasticResult>;
export function stochasticSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  kPeriod: number | undefined, dPeriod: number
 | undefined, opts: OutputOptions): StochasticResult;
export function stochasticSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  kPeriod: number = 14, dPeriod: number = 3, opts?: OutputOptions
): StochasticResult | TypedResult<StochasticResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(kPeriod, 'kPeriod'); assertNum(dPeriod, 'dPeriod');
  return native.stochasticSync(high, low, close, kPeriod, dPeriod, opts);
}

export function atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
export function atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Float64Array;
export function atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): number[];
export function atrSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.atrSync(high, low, close, period, opts);
}

export function adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): AdxResult;
export function adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): TypedResult<AdxResult>;
export function adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): AdxResult;
export function adxSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): AdxResult | TypedResult<AdxResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.adxSync(high, low, close, period, opts);
}

export function vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): number[];
export function vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts: TypedOutput): Float64Array;
export function vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts: OutputOptions): number[];
export function vwapSync(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close'); assertArray(volume, 'volume');
  return native.vwapSync(high, low, close, volume, opts);
}

export function obvSync(prices: NumericArray, volume: NumericArray): number[];
export function obvSync(prices: NumericArray, volume: NumericArray, opts: TypedOutput): Float64Array;
export function obvSync(prices: NumericArray, volume: NumericArray, opts: OutputOptions): number[];
export function obvSync(prices: NumericArray, volume: NumericArray, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices'); assertArray(volume, 'volume');
  return native.obvSync(prices, volume, opts);
}

export function wmaSync(prices: NumericArray, period: number): number[];
export function wmaSync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function wmaSync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function wmaSync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.wmaSync(prices, period, opts);
}

export function hmaSync(prices: NumericArray, period: number): number[];
export function hmaSync(prices: NumericArray, period: number, opts: TypedOutput): Float64Array;
export function hmaSync(prices: NumericArray, period: number, opts: OutputOptions): number[];
export function hmaSync(prices: NumericArray, period: number, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.hmaSync(prices, period, opts);
}

export function cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
export function cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Float64Array;
export function cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): number[];
export function cciSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.cciSync(high, low, close, period, opts);
}

export function williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): number[];
export function williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Float64Array;
export function williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): number[];
export function williamsRSync(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.williamsRSync(high, low, close, period, opts);
}

export function momentumSync(prices: NumericArray, period?: number): number[];
export function momentumSync(prices: NumericArray, period: number | undefined, opts: TypedOutput): Float64Array;
export function momentumSync(prices: NumericArray, period: number | undefined, opts: OutputOptions): number[];
export function momentumSync(prices: NumericArray, period: number = 10, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.momentumSync(prices, period, opts);
}

export function keltnerSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  period?: number, mult?: number
): KeltnerResult;
export function keltnerSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  period: number | undefined, mult: number | undefined, opts: TypedOutput
): TypedResult<KeltnerResult>;
export function keltnerSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  period: number | undefined, mult: number
 | undefined, opts: OutputOptions): KeltnerResult;
export function keltnerSync(
  high: NumericArray, low: NumericArray, close: NumericArray,
  period: number = 20, mult: number = 2.0, opts?: OutputOptions
): KeltnerResult | TypedResult<KeltnerResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period'); assertNum(mult, 'mult');
  return native.keltnerSync(high, low, close, period, mult, opts);
}

export function donchianSync(high: NumericArray, low: NumericArray, period?: number): DonchianResult;
export function donchianSync(high: NumericArray, low: NumericArray, period: number | undefined, opts: TypedOutput): TypedResult<DonchianResult>;
export function donchianSync(high: NumericArray, low: NumericArray, period: number | undefined, opts: OutputOptions): DonchianResult;
export function donchianSync(high: NumericArray, low: NumericArray, period: number = 20, opts?: OutputOptions): DonchianResult | TypedResult<DonchianResult> {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(period, 'period');
  return native.donchianSync(high, low, period, opts);
}

export function rocSync(prices: NumericArray, period?: number): number[];
export function rocSync(prices: NumericArray, period: number | undefined, opts: TypedOutput): Float64Array;
export function rocSync(prices: NumericArray, period: number | undefined, opts: OutputOptions): number[];
export function rocSync(prices: NumericArray, period: number = 10, opts?: OutputOptions): number[] | Float64Array {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.rocSync(prices, period, opts);
}

export function parabolicSARSync(high: NumericArray, low: NumericArray, step?: number, maxStep?: number): number[];
export function parabolicSARSync(high: NumericArray, low: NumericArray, step: number | undefined, maxStep: number | undefined, opts: TypedOutput): Float64Array;
export function parabolicSARSync(high: NumericArray, low: NumericArray, step: number | undefined, maxStep: number | undefined, opts: OutputOptions): number[];
export function parabolicSARSync(high: NumericArray, low: NumericArray, step: number = 0.02, maxStep: number = 0.2, opts?: OutputOptions): number[] | Float64Array {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(step, 'step'); assertNum(maxStep, 'maxStep');
  return native.parabolicSARSync(high, low, step, maxStep, opts);
}

export function ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray): IchimokuResult;
export function ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray, opts: TypedOutput): TypedResult<IchimokuResult>;
export function ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray, opts: OutputOptions): IchimokuResult;
export function ichimokuSync(high: NumericArray, low: NumericArray, close: NumericArray, opts?: OutputOptions): IchimokuResult | TypedResult<IchimokuResult> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  return native.ichimokuSync(high, low, close, opts);
}
export function calculateSync(args: CalculateArgs): number[] | boolean[];
export function calculateSync(args: CalculateArgs, opts: TypedOutput): TypedResult<number[] | boolean[]>;
export function calculateSync(args: CalculateArgs, opts: OutputOptions): number[] | boolean[];
export function calculateSync({ formula, params, returnType = 'auto' }: CalculateArgs, opts?: OutputOptions): number[] | boolean[] | TypedResult<number[] | boolean[]> {
  if (typeof formula !== 'string') throw new TypeError('formula must be a string');
  if (typeof params !== 'object' || params === null) throw new TypeError('params must be an object');
  for (const [name, col] of Object.entries(params)) assertArray(col, `params.${name}`);
  const rt = returnType as 'number' | 'boolean' | 'array' | 'auto';
  return native.calculateSync({ formula, params, returnType: rt }, opts);
}

// ===========================================================================
// Async API (Promises)
// ===========================================================================

export function sma(prices: NumericArray, period: number): Promise<number[]>;
export function sma(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function sma(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function sma(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.sma(prices, period, opts);
}
export function ema(prices: NumericArray, period: number): Promise<number[]>;
export function ema(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function ema(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function ema(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.ema(prices, period, opts);
}
export function rsi(prices: NumericArray, period: number): Promise<number[]>;
export function rsi(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function rsi(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function rsi(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.rsi(prices, period, opts);
}
export function volatility(prices: NumericArray, period: number): Promise<number[]>;
export function volatility(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function volatility(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function volatility(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  return native.volatility(prices, period, opts);
}
export function medianPrice(high: NumericArray, low: NumericArray): Promise<number[]>;
export function medianPrice(high: NumericArray, low: NumericArray, opts: TypedOutput): Promise<Float64Array>;
export function medianPrice(high: NumericArray, low: NumericArray, opts: OutputOptions): Promise<number[]>;
export function medianPrice(high: NumericArray, low: NumericArray, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high');
  assertArray(low, 'low');
  return native.medianPrice(high, low, opts);
}
export function typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray): Promise<number[]>;
export function typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray, opts: TypedOutput): Promise<Float64Array>;
export function typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray, opts: OutputOptions): Promise<number[]>;
export function typicalPrice(high: NumericArray, low: NumericArray, close: NumericArray, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high');
  assertArray(low, 'low');
  assertArray(close, 'close');
  return native.typicalPrice(high, low, close, opts);
}
export function kellyCriterion(winRate: number, winAvg: number, lossAvg: number): Promise<number> {
  assertNum(winRate, 'winRate');
  assertNum(winAvg, 'winAvg');
  assertNum(lossAvg, 'lossAvg');
  return native.kellyCriterion(winRate, winAvg, lossAvg);
}
export function macd(prices: NumericArray, fast: number, slow: number, signal: number): Promise<MacdResult>;
export function macd(prices: NumericArray, fast: number, slow: number, signal: number, opts: TypedOutput): Promise<TypedResult<MacdResult>>;
export function macd(prices: NumericArray, fast: number, slow: number, signal: number, opts: OutputOptions): Promise<MacdResult>;
export function macd(prices: NumericArray, fast: number, slow: number, signal: number, opts?: OutputOptions): Promise<MacdResult> | Promise<TypedResult<MacdResult>> {
  assertArray(prices, 'prices');
  assertNum(fast, 'fast');
  assertNum(slow, 'slow');
  assertNum(signal, 'signal');
  return native.macd(prices, fast, slow, signal, opts);
}
export function bollinger(prices: NumericArray, period: number, stdDev?: number): Promise<BollingerResult>;
export function bollinger(prices: NumericArray, period: number, stdDev: number | undefined, opts: TypedOutput): Promise<TypedResult<BollingerResult>>;
export function bollinger(prices: NumericArray, period: number, stdDev: number | undefined, opts: OutputOptions): Promise<BollingerResult>;
export function bollinger(prices: NumericArray, period: number, stdDev: number = 2.0, opts?: OutputOptions): Promise<BollingerResult> | Promise<TypedResult<BollingerResult>> {
  assertArray(prices, 'prices');
  assertNum(period, 'period');
  assertNum(stdDev, 'stdDev');
  return native.bollinger(prices, period, stdDev, opts);
}
export function bullishImpulse(prices: NumericArray): Promise<Uint8Array> {
  assertArray(prices, 'prices');
  return native.bullishImpulse(prices);
}
export function bearishImpulse(prices: NumericArray): Promise<Uint8Array> {
  assertArray(prices, 'prices');
    return native.bearishImpulse(prices);
}

export function stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod?: number, dPeriod?: number): Promise<StochasticResult>;
export function stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod: number | undefined, dPeriod: number | undefined, opts: TypedOutput): Promise<TypedResult<StochasticResult>>;
export function stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod: number | undefined, dPeriod: number | undefined, opts: OutputOptions): Promise<StochasticResult>;
export function stochastic(high: NumericArray, low: NumericArray, close: NumericArray, kPeriod: number = 14, dPeriod: number = 3, opts?: OutputOptions): Promise<StochasticResult> | Promise<TypedResult<StochasticResult>> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(kPeriod, 'kPeriod'); assertNum(dPeriod, 'dPeriod');
  return native.stochastic(high, low, close, kPeriod, dPeriod, opts);
}

export function atr(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
export function atr(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function atr(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): Promise<number[]>;
export function atr(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.atr(high, low, close, period, opts);
}

export function adx(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<AdxResult>;
export function adx(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Promise<TypedResult<AdxResult>>;
export function adx(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): Promise<AdxResult>;
export function adx(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): Promise<AdxResult> | Promise<TypedResult<AdxResult>> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.adx(high, low, close, period, opts);
}

export function vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray): Promise<number[]>;
export function vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts: TypedOutput): Promise<Float64Array>;
export function vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts: OutputOptions): Promise<number[]>;
export function vwap(high: NumericArray, low: NumericArray, close: NumericArray, volume: NumericArray, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close'); assertArray(volume, 'volume');
  return native.vwap(high, low, close, volume, opts);
}

export function obv(prices: NumericArray, volume: NumericArray): Promise<number[]>;
export function obv(prices: NumericArray, volume: NumericArray, opts: TypedOutput): Promise<Float64Array>;
export function obv(prices: NumericArray, volume: NumericArray, opts: OutputOptions): Promise<number[]>;
export function obv(prices: NumericArray, volume: NumericArray, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices'); assertArray(volume, 'volume');
  return native.obv(prices, volume, opts);
}

export function wma(prices: NumericArray, period: number): Promise<number[]>;
export function wma(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function wma(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function wma(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.wma(prices, period, opts);
}

export function hma(prices: NumericArray, period: number): Promise<number[]>;
export function hma(prices: NumericArray, period: number, opts: TypedOutput): Promise<Float64Array>;
export function hma(prices: NumericArray, period: number, opts: OutputOptions): Promise<number[]>;
export function hma(prices: NumericArray, period: number, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.hma(prices, period, opts);
}

export function cci(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
export function cci(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function cci(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): Promise<number[]>;
export function cci(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.cci(high, low, close, period, opts);
}

export function williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period?: number): Promise<number[]>;
export function williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, opts: OutputOptions): Promise<number[]>;
export function williamsR(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 14, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period');
  return native.williamsR(high, low, close, period, opts);
}

export function momentum(prices: NumericArray, period?: number): Promise<number[]>;
export function momentum(prices: NumericArray, period: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function momentum(prices: NumericArray, period: number | undefined, opts: OutputOptions): Promise<number[]>;
export function momentum(prices: NumericArray, period: number = 10, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.momentum(prices, period, opts);
}

export function keltner(high: NumericArray, low: NumericArray, close: NumericArray, period?: number, mult?: number): Promise<KeltnerResult>;
export function keltner(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, mult: number | undefined, opts: TypedOutput): Promise<TypedResult<KeltnerResult>>;
export function keltner(high: NumericArray, low: NumericArray, close: NumericArray, period: number | undefined, mult: number | undefined, opts: OutputOptions): Promise<KeltnerResult>;
export function keltner(high: NumericArray, low: NumericArray, close: NumericArray, period: number = 20, mult: number = 2.0, opts?: OutputOptions): Promise<KeltnerResult> | Promise<TypedResult<KeltnerResult>> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  assertNum(period, 'period'); assertNum(mult, 'mult');
  return native.keltner(high, low, close, period, mult, opts);
}

export function donchian(high: NumericArray, low: NumericArray, period?: number): Promise<DonchianResult>;
export function donchian(high: NumericArray, low: NumericArray, period: number | undefined, opts: TypedOutput): Promise<TypedResult<DonchianResult>>;
export function donchian(high: NumericArray, low: NumericArray, period: number | undefined, opts: OutputOptions): Promise<DonchianResult>;
export function donchian(high: NumericArray, low: NumericArray, period: number = 20, opts?: OutputOptions): Promise<DonchianResult> | Promise<TypedResult<DonchianResult>> {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(period, 'period');
  return native.donchian(high, low, period, opts);
}

export function roc(prices: NumericArray, period?: number): Promise<number[]>;
export function roc(prices: NumericArray, period: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function roc(prices: NumericArray, period: number | undefined, opts: OutputOptions): Promise<number[]>;
export function roc(prices: NumericArray, period: number = 10, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(prices, 'prices'); assertNum(period, 'period');
  return native.roc(prices, period, opts);
}

export function parabolicSAR(high: NumericArray, low: NumericArray, step?: number, maxStep?: number): Promise<number[]>;
export function parabolicSAR(high: NumericArray, low: NumericArray, step: number | undefined, maxStep: number | undefined, opts: TypedOutput): Promise<Float64Array>;
export function parabolicSAR(high: NumericArray, low: NumericArray, step: number | undefined, maxStep: number | undefined, opts: OutputOptions): Promise<number[]>;
export function parabolicSAR(high: NumericArray, low: NumericArray, step: number = 0.02, maxStep: number = 0.2, opts?: OutputOptions): Promise<number[] | Float64Array> {
  assertArray(high, 'high'); assertArray(low, 'low');
  assertNum(step, 'step'); assertNum(maxStep, 'maxStep');
  return native.parabolicSAR(high, low, step, maxStep, opts);
}

export function ichimoku(high: NumericArray, low: NumericArray, close: NumericArray): Promise<IchimokuResult>;
export function ichimoku(high: NumericArray, low: NumericArray, close: NumericArray, opts: TypedOutput): Promise<TypedResult<IchimokuResult>>;
export function ichimoku(high: NumericArray, low: NumericArray, close: NumericArray, opts: OutputOptions): Promise<IchimokuResult>;
export function ichimoku(high: NumericArray, low: NumericArray, close: NumericArray, opts?: OutputOptions): Promise<IchimokuResult> | Promise<TypedResult<IchimokuResult>> {
  assertArray(high, 'high'); assertArray(low, 'low'); assertArray(close, 'close');
  return native.ichimoku(high, low, close, opts);
}

export function calculate(args: CalculateArgs): Promise<number[] | boolean[]>;
export function calculate(args: CalculateArgs, opts: TypedOutput): Promise<TypedResult<number[] | boolean[]>>;
export function calculate(args: CalculateArgs, opts: OutputOptions): Promise<number[] | boolean[]>;
export function calculate({ formula, params, returnType = 'auto' }: CalculateArgs, opts?: OutputOptions): Promise<number[] | boolean[]> | Promise<TypedResult<number[] | boolean[]>> {
  if (typeof formula !== 'string') throw new TypeError('formula must be a string');
  if (typeof params !== 'object' || params === null) throw new TypeError('params must be an object');
  for (const [name, col] of Object.entries(params)) assertArray(col, `params.${name}`);
  const rt = returnType as 'number' | 'boolean' | 'array' | 'auto';
  return native.calculate({ formula, params, returnType: rt }, opts);
}


