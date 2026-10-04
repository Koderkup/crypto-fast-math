# crypto-fast-math

[![npm version](https://img.shields.io/npm/v/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

High-performance trading & crypto math for Node.js — **C++ core via Node-API**, ready-made technical indicators + custom [ExprTk](https://github.com/ArashPartow/exprtk) formulas, zero-config prebuilt binaries.

## Features

### Ready-made indicators (C++ speed)
| Indicator | Sync | Async | Description |
|---|---|---|---|
| SMA | ✅ | ✅ | Simple Moving Average |
| EMA | ✅ | ✅ | Exponential Moving Average |
| RSI | ✅ | ✅ | Relative Strength Index (Wilder) |
| MACD | ✅ | ✅ | MACD histogram with signal line |
| Bollinger Bands | ✅ | ✅ | Upper / Middle / Lower bands |
| Volatility | ✅ | ✅ | Rolling standard deviation of returns |
| Median Price | ✅ | ✅ | (high + low) / 2 per candle |
| Typical Price | ✅ | ✅ | (high + low + close) / 3 |
| Kelly Criterion | ✅ | ✅ | Optimal position sizing fraction |
| Bullish Impulse | ✅ | ✅ | Elder Impulse (green) |
| Bearish Impulse | ✅ | ✅ | Elder Impulse (red) |

### Custom formulas (ExprTk engine)
Write any formula using named `params` columns:

```ts
calculate({
  formula: '(Close - Open) / Close * 100',
  params: { Close: [...], Open: [...] },
  returnType: 'number'
})
```

- **No hardcoded metrics** — variable names come from `params` keys
- Runs on a **dedicated 16 MB stack thread** to avoid V8 main-thread stack overflow
- Supports arithmetic, comparisons, `sqrt`, `log`, `pi`, `e`, conditionals, etc.

## Installation

```bash
npm install crypto-fast-math
```

Prebuilt binaries are provided for most platforms. If a prebuilt isn't available,
`node-gyp-build` will fall back to a source compile (requires Python 3 + a C++17 compiler).

## Quick Start

### TypeScript / JavaScript (Recommended)

```ts
import * as cfm from 'crypto-fast-math';

// SMA — sync
const sma = cfm.smaSync([100, 102, 101, 105, 107], 3);
// → Float64Array [NaN, NaN, 101.0, 102.67, 104.33]

// EMA — async (non-blocking)
const ema = await cfm.ema([100, 102, 101, 105, 107], 3);

// RSI
const rsi = cfm.rsiSync([100, 102, 101, 105, 107, 110, 108, 112], 3);

// Bollinger Bands
const bb = cfm.bollingerSync(prices, 20, 2.0);
// → { upper: Float64Array, middle: Float64Array, lower: Float64Array }

// Custom ExprTk formula
const result = cfm.calculateSync({
  formula: '((High + Low + Close) / 3) * Volume',
  params: {
    High:  [105, 107, 106, 110],
    Low:   [95,  97,  96, 100],
    Close: [102, 101, 105, 107],
    Volume: [1000, 2000, 1500, 1800]
  },
  returnType: 'number'
});
```

### Raw C++ addon

```js
const addon = require('crypto-fast-math/build/Release/addon.node');
const sma = addon.smaSync([100, 102, 101, 105, 107], 3);
```

## API Reference

### Indicators

#### `smaSync(prices: NumericArray, period: number): Float64Array`
Returns SMA with `NaN` for the first `period-1` elements.

#### `emaSync(prices: NumericArray, period: number): Float64Array`
EMA with smoothing factor `α = 2/(period+1)`. Seeded with SMA.

#### `rsiSync(prices: NumericArray, period: number): Float64Array`
Wilder-style RSI. Values in `[0, 100]`, `NaN` before `period` deltas accumulated.

#### `volatilitySync(prices: NumericArray, period: number): Float64Array`
Rolling standard deviation of log returns over `period` candles.

#### `medianPriceSync(high, low): Float64Array`
Each element = `(high + low) / 2`.

#### `typicalPriceSync(high, low, close): Float64Array`
Each element = `(high + low + close) / 3`.

#### `kellyCriterionSync(winRate, winAvg, lossAvg): number`
Kelly fraction = `winRate - (1 - winRate) / (winAvg / lossAvg)`.

#### `macdSync(prices, fastPeriod, slowPeriod, signalPeriod): { macd, signal, histogram }`
Returns three `Float64Array`s of the same length as input.

#### `bollingerSync(prices, period, stdDev = 2.0): { upper, middle, lower }`
Returns three `Float64Array`s. Middle is SMA, upper/lower = SMA ± stdDev × σ.

#### `bullishImpulseSync(prices / close): Uint8Array`
1 where EMA(13)↑ and MACD histogram↑, else 0.

#### `bearishImpulseSync(prices / close): Uint8Array`
1 where EMA(13)↓ and MACD histogram↓, else 0.

### Custom Formulas

#### `calculateSync({ formula, params, returnType = 'auto' }): number[] | boolean[]`
Parses `formula` once with ExprTk, registers all keys in `params` as variables,
then evaluates element-by-element.

- `formula: string` — any valid ExprTk expression.
- `params: Record<string, NumericArray>` — named data columns.
- `returnType: 'number' | 'boolean' | 'array' | 'auto'` — `'auto'` detects
  comparison operators (`<`, `>`, `==`, etc.) to return booleans.

#### `calculate({ ... }): Promise<number[] | boolean[]>`
Async version — runs the formula evaluation on the libuv thread pool.

### Async API

Every sync function has an async counterpart with the same signature and a
`Promise<...>` return type:

```ts
sma(prices, period) → Promise<Float64Array>
ema(prices, period) → Promise<Float64Array>
rsi(prices, period) → Promise<Float64Array>
macd(prices, fast, slow, signal) → Promise<{ macd, signal, histogram }>
bollinger(prices, period, sd?) → Promise<{ upper, middle, lower }>
// ... etc
```

## Building from Source

```bash
# Linux / macOS
npm run build

# Windows (PowerShell / Developer Command Prompt)
npm run build
```

The build process:
1. `node-gyp configure` — generates the Visual Studio / Make project
2. `scripts/fix-vcxproj.js` — patches the generated `.vcxproj` to enable RTTI
   (`/GR`) and C++ exceptions (`/EHsc`), which are disabled by default in
   node-gyp's `common.gypi`. This is required for ExprTk's `dynamic_cast` usage
   to work correctly.
3. `node-gyp build --release` — compiles the C++ addon

## Running Tests

```bash
npm test
```

## License

MIT
