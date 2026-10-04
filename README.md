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
// → [NaN, NaN, 101.0, 102.67, 104.33]

// EMA — async (non-blocking)
const ema = await cfm.ema([100, 102, 101, 105, 107], 3);

// RSI
const rsi = cfm.rsiSync([100, 102, 101, 105, 107, 110, 108, 112], 3);

// Bollinger Bands
const bb = cfm.bollingerSync(prices, 20, 2.0);
// → { upper: number[], middle: number[], lower: number[] }

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

#### `smaSync(prices: NumericArray, period: number): number[]`
Returns SMA with `NaN` for the first `period-1` elements.

#### `emaSync(prices: NumericArray, period: number): number[]`
EMA with smoothing factor `α = 2/(period+1)`. Seeded with SMA.

#### `rsiSync(prices: NumericArray, period: number): number[]`
Wilder-style RSI. Values in `[0, 100]`, `NaN` before `period` deltas accumulated.

#### `volatilitySync(prices: NumericArray, period: number): number[]`
Rolling standard deviation of returns over `period` candles.

#### `medianPriceSync(high, low): number[]`
Each element = `(high + low) / 2`.

#### `typicalPriceSync(high, low, close): number[]`
Each element = `(high + low + close) / 3`.

#### `kellyCriterionSync(winRate, winAvg, lossAvg): number`
Kelly fraction = `winRate - (1 - winRate) / (winAvg / lossAvg)`.

#### `macdSync(prices, fastPeriod, slowPeriod, signalPeriod): { macd, signal, histogram }`
Returns three `number[]`s of the same length as input.

#### `bollingerSync(prices, period, stdDev = 2.0): { upper, middle, lower }`
Returns three `number[]`. Middle is SMA, upper/lower = SMA ± stdDev × σ.

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
sma(prices, period) → Promise<number[]>
ema(prices, period) → Promise<number[]>
rsi(prices, period) → Promise<number[]>
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

## Performance

Benchmarks compare native C++ addon against hand-written JavaScript on
100k candles, averaged over 50 runs. For best performance, pass
`Float64Array` inputs (enables zero-copy `memcpy` into the C++ core).

| Indicator (period)            | JS       | Native  | Speedup  |
|-------------------------------|----------|---------|----------|
| Volatility (26)               | 32.8 ms  | 24.1 ms | **1.4×** |
| Typical Price                 | 15.3 ms  | 7.0 ms  | **2.2×** |
| ExprTk formula\*              | 15.0 ms  | 9.8 ms  | **1.5×** |
| SMA (20)                      | 0.7 ms   | 6.6 ms  | 0.1×     |
| EMA (12)                      | 0.7 ms   | 5.3 ms  | 0.1×     |
| RSI (14)                      | 1.5 ms   | 6.1 ms  | 0.2×     |

\* `(High - Low) / Close * Volume * Math.sin(Close)`

**Simple indicators (SMA, EMA, RSI)** are so lightweight that V8's JIT
optimizes them faster than the native function-call + array-conversion
overhead. Use the native core when:

- Working with **complex custom formulas** via the ExprTk engine
- Computing **heavy multi-pass indicators** (volatility, Bollinger Bands, MACD)
- Processing **large datasets** where per-element computation dominates I/O

Run your own benchmark with:

```bash
node benchmark.js
```

## License

MIT
