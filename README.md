# crypto-fast-math

[![npm version](https://img.shields.io/npm/v/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![npm downloads](https://img.shields.io/npm/dm/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**High-performance trading & crypto math for Node.js.** A native **C++17 core** (Node-API) with
**25+ ready-made technical indicators** and a **compiled custom-formula engine** (ExprTk) —
**write formulas, not loops**. Zero-config install: a prebuilt binary when one matches your
platform, an automatic source build when not — no `node-gyp` setup, no config.

```ts
import * as cfm from 'crypto-fast-math';

const rsi = cfm.rsiSync(closes, 14);                       // sync, C++ speed
const ema = await cfm.ema(closes, 21);                     // async, off the event loop
const x   = cfm.calculateSync({                            // your own formula
  formula: '(High - Low) / Close * 100',
  params: { High: highs, Low: lows, Close: closes },
});
```

---

## Table of contents

- [Why crypto-fast-math?](#why-crypto-fast-math)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How to import](#how-to-import)
- [Examples](#examples)
- [Ready-made indicators](#ready-made-indicators)
- [API reference](#api-reference)
- [Custom formulas (ExprTk engine)](#custom-formulas-exprtk-engine)
- [Recipes](#recipes)
- [Performance](#performance)
- [Where native wins and where JS is fine](#where-native-wins-and-where-js-is-fine)
- [Browser support](#browser-support)
- [TypeScript](#typescript)
- [Troubleshooting](#troubleshooting)
- [Building from source](#building-from-source)
- [Running the tests](#running-the-tests)
- [Publishing to npm (maintainers)](#publishing-to-npm-maintainers)
- [License](#license)

---

## Why crypto-fast-math?

| | |
|---|---|
| ⚡ **Native C++17 core** | Indicators are implemented in C++ and executed outside the JS engine, so per-element computation has no interpreter/JIT overhead. |
| 🧮 **Write formulas, not loops** | Describe any rule once — `'Close > EMA50 and RSI < 30'` — and [ExprTk](https://github.com/ArashPartow/exprtk) **compiles it once** and evaluates it per candle inside the C++ core. Measured **1.0–1.6× faster than idiomatic JS** (`.map` / `Array.from` chains) at 100 k candles; a hand-written tight loop can still beat it — the win is you never write the loop. See [Performance](#performance). |
| 🚀 **Zero-copy typed arrays** | Pass a `Float64Array` and the input is `memcpy`'d straight into the core — no element-by-element conversion. |
| 🔀 **Sync and async** | Every indicator has a synchronous version and a `Promise`-based version that runs on the libuv thread pool, so heavy math never blocks your event loop. |
| 📦 **Zero-config install** | Prebuilt `.node` binaries ship inside the package and are resolved automatically by [`node-gyp-build`](https://github.com/prebuild/node-gyp-build) — with an automatic compile-from-source fallback. |
| 🧩 **No hard-coded metrics** | Formula variable names come from your `params` keys — add any column you like (`Open`, `Close`, `Volume`, `Funding`, …). |
| 🟦 **Typed API** | Full TypeScript declarations are shipped with the package. |

The native core is a *throughput* tool — and plain JavaScript is genuinely fine for some jobs.
The measured fine print lives in [Where native wins and where JS is fine](#where-native-wins-and-where-js-is-fine);
raw benchmark numbers are in [Performance](#performance).

## Installation

```bash
npm install crypto-fast-math
```

That's it. `node-gyp-build` picks the right prebuilt binary for your OS/architecture during
`npm install`. Supported prebuilds:

| Platform | Architectures |
|---|---|
| Windows | `win32-x64` |
| Linux (glibc) | `linux-x64`, `linux-arm64` |
| macOS | `darwin-x64`, `darwin-arm64` (Apple Silicon) |

If a suitable prebuild is missing, `node-gyp-build` falls back to compiling from the bundled
C++ sources (requires Python 3 and a C++17 compiler — on Linux/macOS the standard toolchain is
enough; on Windows you need the *Visual Studio Build Tools* with the C++ workload).

## Quick start

### CommonJS

```js
const cfm = require('crypto-fast-math');

const sma = cfm.smaSync([100, 102, 101, 105, 107], 3);
// [NaN, NaN, 101, 102.666..., 104.333...]
```

### ESM / TypeScript

```ts
import * as cfm from 'crypto-fast-math';
// or: import { smaSync, ema, calculateSync } from 'crypto-fast-math';

const closes = new Float64Array([100, 102, 101, 105, 107]);

const sma = cfm.smaSync(closes, 3);   // number[]
const ema = await cfm.ema(closes, 3); // number[] (async)
```

### How to import

Three equivalent ways — all expose the same functions:

```ts
// 1. Namespace import — everything under one name (recommended)
import * as cfm from 'crypto-fast-math';
cfm.smaSync(closes, 20);

// 2. Named imports — only what you use
import { smaSync, ema, calculateSync } from 'crypto-fast-math';

// 3. CommonJS
const cfm = require('crypto-fast-math');
```

Named imports are preferred when you use only a few indicators — bundlers can
tree-shake the rest. There is no default export.

**Module format.** The package ships CommonJS with full TypeScript
declarations. In ESM projects both styles work:

```ts
import * as cfm from 'crypto-fast-math';  // CJS interop namespace
import cfm from 'crypto-fast-math';        // default interop (esModuleInterop)
```

In TypeScript with `"module": "esnext"`, set `"esModuleInterop": true` in
`tsconfig.json` for the second style. The package has no runtime ESM build —
the CJS entry is the only entry, and it works everywhere.

### Sync vs async

Every indicator `xxxSync(...)` has an async twin `xxx(...)` with the **same arguments** that
returns a `Promise`:

```ts
cfm.smaSync(prices, 20);   // blocking, lowest latency for small inputs
await cfm.sma(prices, 20); // non-blocking, runs on the libuv thread pool
```

**Sync vs async — when to use which:**

| Situation | Use | Why |
|---|---|---|
| CLI scripts, backtests, worker threads | `…Sync` | No event-loop coordination; lowest overhead per call. |
| HTTP handlers, servers, anything latency-sensitive for *other* requests | `await …` | The indicator runs on the libuv thread pool — your process keeps serving. |
| Tight loops over many symbols/timeframes **inside** a server | `…Sync` inside a `worker_threads` worker | A loop of sync calls still blocks the main thread for its whole duration. |
| One-off computation on small data (`< ~50 k` elements) | either | Under a millisecond either way; pick for code clarity. |
| Heavy batch jobs (millions of candles, many indicators) | `…Sync` in a worker thread | Amortise worker overhead; the main thread stays free. |

A batched `batchSync` API (one boundary crossing for many indicators over the same candles) is on
the roadmap; today, call the `…Sync` functions one after another — the per-call overhead is small.

## Examples

### Streaming from an exchange (WebSocket)

Compute signals on live klines without blocking the event loop — the point of
the async API:

```ts
import WebSocket from 'ws';
import * as cfm from 'crypto-fast-math';

const closes: number[] = [];
const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

ws.on('message', async (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.topic !== 'kline.1.BTCUSDT') return;

  const candle = msg.data[0];
  closes.push(parseFloat(candle.close));
  if (closes.length < 50) return;

  // Compute on the last 50 candles only
  const recent = new Float64Array(closes.slice(-50));

  const rsi = await cfm.rsi(recent, 14);       // runs on the thread pool
  const ema = await cfm.ema(recent, 21);       // event loop keeps serving

  const signal = cfm.calculateSync({
    formula: 'RSI < 30 and Close > EMA',
    params: { RSI: rsi, Close: recent, EMA: ema },
    returnType: 'boolean',
  });

  if (signal[signal.length - 1]) {
    console.log('BUY signal');
  }
});
```

### Backtest over 1M candles

Precompute indicators once as typed arrays, then evaluate the whole strategy in
a single pass:

```ts
import * as cfm from 'crypto-fast-math';

const candles = loadCandles(); // 1M candles, any source
const closes  = new Float64Array(candles.map(c => c.close));
const highs   = new Float64Array(candles.map(c => c.high));
const lows    = new Float64Array(candles.map(c => c.low));
const volumes = new Float64Array(candles.map(c => c.volume));

// Precompute indicators once — Float64Array in, Float64Array out
const ema50 = cfm.emaSync(closes, 50, { output: 'typed' });
const rsi14 = cfm.rsiSync(closes, 14, { output: 'typed' });
const atr14 = cfm.atrSync(highs, lows, closes, 14, { output: 'typed' });

// Evaluate the strategy across all candles in one call
const signals = await cfm.calculate({
  formula: 'Close > EMA50 and RSI < 30 and ATR > 1.5',
  params: { Close: closes, EMA50: ema50, RSI: rsi14, ATR: atr14 },
  returnType: 'boolean',
});

const entries = signals.filter(Boolean).length;
console.log(`${entries} entry points`);
```

## Ready-made indicators

Every row exposes a **sync** function (`…Sync`) and an **async** twin (`…`). Parameters listed
with `=` have that default. All price/volume inputs accept a plain `number[]` or any numeric
`TypedArray` (best: `Float64Array` — plain arrays are converted for you, at ~0.5–0.7 ms per 100 k
values).

The full surface, for copy-paste:

```ts
import {
  // Trend / moving averages
  sma, smaSync, ema, emaSync, wma, wmaSync, hma, hmaSync,
  // Momentum & oscillators
  rsi, rsiSync, macd, macdSync, stochastic, stochasticSync,
  cci, cciSync, williamsR, williamsRSync, momentum, momentumSync, roc, rocSync,
  // Volatility & channels
  bollinger, bollingerSync, keltner, keltnerSync, donchian, donchianSync,
  atr, atrSync, volatility, volatilitySync, parabolicSAR, parabolicSARSync,
  // Trend strength
  adx, adxSync, ichimoku, ichimokuSync,
  // Volume
  vwap, vwapSync, obv, obvSync,
  // Price helpers, signals & sizing
  medianPrice, medianPriceSync, typicalPrice, typicalPriceSync,
  bullishImpulse, bullishImpulseSync, bearishImpulse, bearishImpulseSync,
  kellyCriterion, kellyCriterionSync,
  // Custom formula engine
  calculate, calculateSync,
} from 'crypto-fast-math';
// or simply:  import * as cfm from 'crypto-fast-math';
```

| Group | Indicator | Async / Sync | Inputs | Parameters | Returns |
|---|---|---|---|---|---|
| **Trend** | SMA | `sma` / `smaSync` | `prices` | `period` | `number[]` |
| | EMA | `ema` / `emaSync` | `prices` | `period` | `number[]` |
| | WMA | `wma` / `wmaSync` | `prices` | `period` | `number[]` |
| | HMA | `hma` / `hmaSync` | `prices` | `period` | `number[]` |
| **Momentum** | RSI | `rsi` / `rsiSync` | `prices` | `period` | `number[]` |
| | MACD | `macd` / `macdSync` | `prices` | `fast`, `slow`, `signal` | `{ macd, signal, histogram }` |
| | Stochastic | `stochastic` / `stochasticSync` | `high`, `low`, `close` | `kPeriod=14`, `dPeriod=3` | `{ k, d }` |
| | CCI | `cci` / `cciSync` | `high`, `low`, `close` | `period=20` | `number[]` |
| | Williams %R | `williamsR` / `williamsRSync` | `high`, `low`, `close` | `period=14` | `number[]` |
| | Momentum | `momentum` / `momentumSync` | `prices` | `period=10` | `number[]` |
| | ROC | `roc` / `rocSync` | `prices` | `period=10` | `number[]` |
| **Volatility** | Bollinger Bands | `bollinger` / `bollingerSync` | `prices` | `period`, `stdDev=2.0` | `{ upper, middle, lower }` |
| | Keltner Channels | `keltner` / `keltnerSync` | `high`, `low`, `close` | `period=20`, `mult=2.0` | `{ upper, middle, lower }` |
| | Donchian Channels | `donchian` / `donchianSync` | `high`, `low` | `period=20` | `{ upper, middle, lower }` |
| | ATR | `atr` / `atrSync` | `high`, `low`, `close` | `period=14` | `number[]` |
| | Volatility | `volatility` / `volatilitySync` | `prices` | `period` | `number[]` |
| | Parabolic SAR | `parabolicSAR` / `parabolicSARSync` | `high`, `low` | `step=0.02`, `maxStep=0.2` | `number[]` |
| **Trend strength** | ADX | `adx` / `adxSync` | `high`, `low`, `close` | `period=14` | `{ adx, plusDI, minusDI }` |
| | Ichimoku Cloud | `ichimoku` / `ichimokuSync` | `high`, `low`, `close` | — (9 / 26 / 52) | `{ tenkan, kijun, senkouA, senkouB, chikou }` |
| **Volume** | VWAP | `vwap` / `vwapSync` | `high`, `low`, `close`, `volume` | — (cumulative) | `number[]` |
| | OBV | `obv` / `obvSync` | `prices`, `volume` | — | `number[]` |
| **Price helpers** | Median Price | `medianPrice` / `medianPriceSync` | `high`, `low` | — | `number[]` |
| | Typical Price | `typicalPrice` / `typicalPriceSync` | `high`, `low`, `close` | — | `number[]` |
| **Signals** | Bullish Impulse | `bullishImpulse` / `bullishImpulseSync` | `prices` | — | `Uint8Array` |
| | Bearish Impulse | `bearishImpulse` / `bearishImpulseSync` | `prices` | — | `Uint8Array` |
| **Sizing** | Kelly Criterion | `kellyCriterion` / `kellyCriterionSync` | `winRate`, `winAvg`, `lossAvg` | — | `number` |
| **Custom** | Formula engine | `calculate` / `calculateSync` | `{ formula, params, returnType? }` | see below | `number[]` / `boolean[]` |

### Output conventions

- Each output array has the **same length as the input**.
- Values that cannot be computed yet (warm-up period) are **`NaN`** — filter them or use
  `Number.isNaN` before consuming.
- Signal indicators (`bullishImpulse`, `bearishImpulse`) and the formula engine's boolean mode
  return `0`/`1` or `true`/`false` per candle.

#### Output format: `number[]` or `Float64Array`

By default every indicator returns a plain `number[]`. Pass `{ output: 'typed' }` as the last
argument to get a **`Float64Array`** instead — same values, no conversion step:

```ts
const a = cfm.smaSync(closes, 20);                  // number[]
const b = cfm.smaSync(closes, 20, { output: 'typed' }); // Float64Array
const c = await cfm.rsi(closes, 14, { output: 'typed' }); // Float64Array (async too)

// multi-output indicators convert every field:
const { upper, middle, lower } = cfm.bollingerSync(closes, 20, undefined, { output: 'typed' });
// upper, middle, lower → Float64Array each
```

| | Default (`number[]`) | `{ output: 'typed' }` (`Float64Array`) |
|---|---|---|
| Result type | `number[]` | `Float64Array` |
| Conversion cost per 100 k values | ≈0.5 ms | none (zero-copy) |
| Best for | JSON, spreads, `Array`-only APIs, destructuring into plain code | Feeding the result back into another indicator, `calculate` params, charts, numeric loops |

Multi-output indicators (`macd`, `bollinger`, `stochastic`, `adx`, `keltner`, `donchian`,
`ichimoku`) return objects whose fields follow the option; boolean results from `calculate`
and `Uint8Array` signal flags are never converted. TypeScript infers the result type from
the option — no casts needed.

**Migration from pre-`output` code:** nothing changes — the option is additive and every
existing call keeps its `number[]` result:

| Old code | Still works | Faster variant |
|---|---|---|
| `cfm.smaSync(closes, 20)` | ✅ unchanged | `cfm.smaSync(closes, 20, { output: 'typed' })` |
| `const r = await cfm.macd(c, 12, 26, 9)` | ✅ unchanged | add `{ output: 'typed' }` → typed fields |
| Results fed into `calculate({ params })` | ✅ either type accepted | pass the typed result straight through — no copy |

## API reference

Each entry shows the **sync** signature; the async twin is identical but returns a `Promise<…>`.
`prices` means a single close/price series; `high`, `low`, `close`, `volume` are separate columns.

### Moving averages

- **`smaSync(prices, period)`** — simple moving average.
- **`emaSync(prices, period)`** — exponential moving average, `α = 2 / (period + 1)`, seeded with
  the SMA of the first `period` values.
- **`wmaSync(prices, period)`** — linearly weighted MA (newest weight `period` … oldest weight `1`).
- **`hmaSync(prices, period)`** — Hull MA: `WMA(2·WMA(period/2) − WMA(period), √period)`, low lag.

### Momentum & oscillators

- **`rsiSync(prices, period)`** — Wilder RSI, values in `[0, 100]`; `NaN` until `period` deltas.
- **`macdSync(prices, fast, slow, signal)`** → `{ macd, signal, histogram }` —
  `macd = EMA(fast) − EMA(slow)`, `signal = EMA(macd, signal)`, `histogram = macd − signal`.
- **`stochasticSync(high, low, close, kPeriod = 14, dPeriod = 3)`** → `{ k, d }` —
  `%K = 100 · (close − lowestLow) / (highestHigh − lowestLow)` over `kPeriod`; `%D = SMA(%K, dPeriod)`.
- **`cciSync(high, low, close, period = 20)`** —
  `(TP − SMA(TP)) / (0.015 · meanAbsoluteDeviation)`, where `TP = (high + low + close) / 3`.
- **`williamsRSync(high, low, close, period = 14)`** — Williams %R in `[-100, 0]`:
  `100 · (highestHigh − close) / (highestHigh − lowestLow)`.
- **`momentumSync(prices, period = 10)`** — `prices[i] − prices[i − (period − 1)]`.
- **`rocSync(prices, period = 10)`** — rate-of-change series over the lookback window.

### Volatility & channels

- **`bollingerSync(prices, period, stdDev = 2.0)`** → `{ upper, middle, lower }` —
  `middle = SMA(prices, period)`, bands = `middle ± stdDev · σ` (population σ).
- **`keltnerSync(high, low, close, period = 20, mult = 2.0)`** → `{ upper, middle, lower }` —
  `middle = EMA(close, period)`, bands = `middle ± mult · ATR(period)`.
- **`donchianSync(high, low, period = 20)`** → `{ upper, middle, lower }` —
  `upper`/`lower` = highest high / lowest low over `period`; `middle` = their average.
- **`atrSync(high, low, close, period = 14)`** — Average True Range (Wilder smoothing).
- **`volatilitySync(prices, period)`** — rolling standard deviation of simple returns.
- **`parabolicSARSync(high, low, step = 0.02, maxStep = 0.2)`** — Parabolic SAR trailing-stop series.

### Trend strength

- **`adxSync(high, low, close, period = 14)`** → `{ adx, plusDI, minusDI }` — Wilder's ADX.
- **`ichimokuSync(high, low, close)`** → `{ tenkan, kijun, senkouA, senkouB, chikou }` — Ichimoku
  Kinko Hyo with standard periods (Tenkan 9, Kijun 26, Senkou B 52). `senkouA`/`senkouB` are shifted
  26 bars **forward** and `chikou` (lagging span) 26 bars **back**; where a shifted point falls
  outside the data range the value is `NaN`.

### Volume

- **`vwapSync(high, low, close, volume)`** — cumulative `Σ(TP·volume) / Σvolume` using typical price.
- **`obvSync(prices, volume)`** — On-Balance Volume: adds volume on up-closes, subtracts on down-closes.

### Price helpers, signals & sizing

- **`medianPriceSync(high, low)`** — `(high + low) / 2` per candle.
- **`typicalPriceSync(high, low, close)`** — `(high + low + close) / 3` per candle.
- **`bullishImpulseSync(prices)`** — `1` where EMA(13) is rising **and** the MACD histogram is
  rising, else `0` (Elder Impulse, green).
- **`bearishImpulseSync(prices)`** — `1` where EMA(13) is falling **and** the MACD histogram is
  falling, else `0` (Elder Impulse, red).
- **`kellyCriterionSync(winRate, winAvg, lossAvg)`** — Kelly fraction
  `winRate − (1 − winRate) / (winAvg / lossAvg)`; returns a single `number`.

## Custom formulas (ExprTk engine)

The formula engine lets you compute **any** metric without touching C++ or hand-writing JS loops.
You provide an expression string and named data columns; the engine binds every key of `params`
as a variable, **compiles the expression once** with [ExprTk](https://github.com/ArashPartow/exprtk),
then evaluates it for every candle inside the C++ core.

```ts
calculateSync({ formula, params, returnType? }): number[] | boolean[]
calculate({ formula, params, returnType? }): Promise<number[] | boolean[]>
```

| Option | Type | Description |
|---|---|---|
| `formula` | `string` | Any valid ExprTk expression. |
| `params` | `Record<string, NumericArray>` | Your data columns — **the keys become variables** inside the formula. |
| `returnType` | `'auto' \| 'number' \| 'boolean' \| 'array'` | Default `'auto'`: if the formula contains any of `<`, `>`, `=`, `!`, `&&`, `||` the result is `boolean[]`, otherwise `number[]`. |

### Variables are your column names

Nothing is hard-coded: name the columns whatever your data is called (`Close`, `FundingRate`,
`OpenInterest`, `BasisBps`, …) and use those names in the formula. All columns must have the same
length; the result has that length. Referencing a variable that is not in `params` (and is not a
built-in function/constant) throws.

```ts
const result = cfm.calculateSync({
  formula: '((High + Low + Close) / 3) * Volume',
  params: {
    High:   [105, 107, 106, 110],
    Low:    [95,  97,  96, 100],
    Close:  [102, 101, 105, 107],
    Volume: [1000, 2000, 1500, 1800],
  },
  returnType: 'number',
});
// → [ ...one value per candle... ]
```

Columns are read fastest as `Float64Array` (a single `memcpy`); plain `number[]` works too and
is auto-converted:

```ts
const closes = new Float64Array(rawCloses);           // fastest input
const ema    = cfm.emaSync(closes, 50, { output: 'typed' }); // Float64Array result

const spread = cfm.calculateSync({
  formula: '(Close - EMA50) / EMA50 * 100',
  params: { Close: closes, EMA50: ema },              // both typed — zero copies in JS
  returnType: 'number',
}, { output: 'typed' });                              // Float64Array out
```

### Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Using a variable not present in `params` | Throws `ExprTk parse error: ERR239 - Undefined symbol: 'Open'` | Add the column to `params`, or fix the typo — names are **case-sensitive**. |
| Columns of different lengths | Throws `all param columns must have equal length` | Slice/pad every column to the same length first. |
| Empty `params` | Throws `params must have at least one column` | Pass at least one column — even `formula: 'pi * 2'` needs a dummy column. |
| Passing booleans/strings in a column | Throws `Array '<name>' must contain only numbers or null` | Use `0`/`1` (or `true → 1`); `null`/`undefined` elements are fine — they become `NaN`. |
| Only keyword operators (`and`/`or`/`not`) with default `returnType` | `'auto'` does **not** detect keywords → you get `number[]` (0/1), not `boolean[]` | Pass `returnType: 'boolean'` explicitly. |
| Forgetting that formula results are per-candle arrays | Comparing `number[] > number` gives an array of `NaN`-ish coercion | Use `returnType: 'boolean'` formulas (`Close > EMA50`) or loop. |
| Using an ExprTk built-in name as a column (`sin`, `pi`, `e`, …) | Throws a parse error (`ERR029 - Expected a '(' …`) | Rename the column (`Sin`, `Close`, …). |

### Operators, functions and constants

Full ExprTk expression language:

- **Arithmetic:** `+ - * / % ^`, unary `-`, parentheses.
- **Comparisons:** `< <= > >= == !=`; **logical:** `and`, `or`, `not`; **ternary:** `cond ? a : b`.
- **Functions:** `abs`, `sqrt`, `log`, `log10`, `log2`, `exp`, `pow`, `sin`, `cos`, `tan`, `asin`,
  `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `floor`, `ceil`, `round`, `trunc`, `min`, `max`,
  `avg`, `clamp(min, max, value)`, `hypot`, `erf`, `if(cond, a, b)`, and many more.
- **Constants:** `pi`, `e`.

### Boolean & signal formulas

`returnType` can be omitted — `'auto'` mode returns `boolean[]` as soon as the formula contains a
comparison/logical operator (`<`, `>`, `=`, `!`, `&&`, `||`):

```ts
const signals = cfm.calculateSync({
  formula: 'Close > Open and Volume > 1000',
  params: { Close: closes, Open: opens, Volume: volumes },
});
// → boolean[]
```

The keyword operators `and` / `or` / `not` are supported too, but they are **not** part of
`'auto'` detection. If a formula uses only keywords, pass the type explicitly:

```ts
const ok = cfm.calculateSync({
  formula: 'Close and Open',
  params: { Close: closes, Open: opens },
  returnType: 'boolean',
});
```

### Chaining indicators into a formula

Any indicator output can become an input column of a formula — this is how you build **composite
metrics**:

```ts
const ema12 = cfm.emaSync(closes, 12);
const ema26 = cfm.emaSync(closes, 26);

const spreadPct = cfm.calculateSync({
  formula: '(EMA12 - EMA26) / EMA26 * 100',
  params: { EMA12: ema12, EMA26: ema26 },
  returnType: 'number',
});
```

Or feed raw columns and intermediate results together:

```ts
const atr   = cfm.atrSync(highs, lows, closes, 14);
const atrPct = await cfm.calculate({
  formula: 'ATR / Close * 100',
  params: { ATR: atr, Close: closes },
  returnType: 'number',
});
```

### A complete custom strategy signal

```ts
import * as cfm from 'crypto-fast-math';

function trendSignal(highs: number[], lows: number[], closes: number[], volumes: number[]) {
  const ema50  = cfm.emaSync(closes, 50);
  const atr14  = cfm.atrSync(highs, lows, closes, 14);

  // Long when price is above its EMA and ATR (volatility) is expanding.
  return cfm.calculateSync({
    formula: 'Close > EMA50 and ATR > 1.5 and Volume > 0',
    params: { Close: closes, EMA50: ema50, ATR: atr14, Volume: volumes },
  }); // boolean[]
}
```

### Error handling

```ts
try {
  cfm.calculateSync({ formula: 'Close + Open', params: { Close: closes } });
} catch (err) {
  // ExprTk parse error: ERR239 - Undefined symbol: 'Open'
}
```

The engine also throws on syntactically invalid expressions, so you can validate user-supplied
formulas before running them over a large dataset.

## Recipes

### Detect a golden cross (EMA50 × EMA200)

ExprTk has no lag operator (`EMA50[-1]` is not supported), so compute the spread
and find the sign change in JS — one pass over the result:

```ts
const ema50  = cfm.emaSync(closes, 50, { output: 'typed' });
const ema200 = cfm.emaSync(closes, 200, { output: 'typed' });

const spread = cfm.calculateSync({
  formula: 'EMA50 - EMA200',
  params: { EMA50: ema50, EMA200: ema200 },
  returnType: 'number',
}, { output: 'typed' });

const goldenCross = spread.map((v, i) => i > 0 && spread[i - 1] < 0 && v >= 0);
// goldenCross[i] === true on the candle where EMA50 crosses above EMA200
```

### Bollinger squeeze (volatility contraction)

```ts
const bb = cfm.bollingerSync(closes, 20, 2.0, { output: 'typed' });
const width = cfm.calculateSync({
  formula: '(Upper - Lower) / Middle * 100',
  params: { Upper: bb.upper, Lower: bb.lower, Middle: bb.middle },
  returnType: 'number',
}, { output: 'typed' });
// Narrow width → squeeze; watch for a breakout
```

### RSI oversold with an EMA trend filter

```ts
const signals = cfm.calculateSync({
  formula: 'RSI < 30 and Close > EMA50',
  params: {
    RSI: cfm.rsiSync(closes, 14),
    Close: closes,
    EMA50: cfm.emaSync(closes, 50),
  },
}); // boolean[] — true where both conditions hold
```

## Performance

Benchmarks below compare the native core against **hand-written, V8-optimised JavaScript** over
**100 000 candles** (run it yourself: `node benchmark.js`). Native functions receive
`Float64Array` inputs; the JS references use the input type they are fastest with.
Measured on Windows, Node.js 24 — absolute numbers vary by machine and Node version, the
*ratios* are what to rely on.

### Marshalling cost — why the options matter

Pure conversion cost for 100 000 elements, no indicator involved:

| Conversion | Time | Where it happens |
|---|---|---|
| `Array.from(Float64Array)` | ~4–5 ms | ❌ not used anywhere anymore |
| tight loop `Float64Array → number[]` | ~0.45 ms | default API (result → `number[]`) |
| `Float64Array` copy | ~0.4 ms | `{ output: 'typed' }` (zero conversion) |
| `number[] → Float64Array` | ~0.5–0.7 ms | automatic input cast when you pass a plain array |

Two takeaways:

- **`{ output: 'typed' }` removes the entire output conversion** — for simple indicators this is
  the difference between ~1.5 ms and ~0.7 ms per call at 100 k elements.
- **Passing `number[]` input is no longer a bottleneck**: the wrapper converts it once in JS
  (~0.5–0.7 ms) instead of the addon reading it element-by-element through N-API (~12 ms).
  `Float64Array` input is still the fastest path — you skip even that cast.

### Every indicator — native cost per call (100 000 candles)

Three modes: plain `number[]` **input**; `Float64Array` input with default `number[]` output;
and `Float64Array` input with `{ output: 'typed' }`:

| Indicator | `number[]` in | `Float64Array` → `number[]` | `Float64Array` → `typed` | Note |
|---|---|---|---|---|
| SMA (20) | 2.59 ms | 1.57 ms | **0.72 ms** | |
| EMA (12) | 2.14 ms | 1.62 ms | **0.74 ms** | |
| RSI (14) | 2.19 ms | 1.88 ms | **1.19 ms** | |
| Volatility (26) | 3.17 ms | 2.54 ms | **1.65 ms** | O(n) rolling sums |
| WMA (20) | 5.29 ms | 3.77 ms | **2.67 ms** | O(n·period) |
| HMA (9) | 5.63 ms | 5.59 ms | **3.26 ms** | |
| Momentum (10) | 2.43 ms | 1.64 ms | **0.49 ms** | |
| ROC (10) | 2.40 ms | 1.42 ms | **0.44 ms** | |
| Median price | 2.88 ms | 2.34 ms | **0.79 ms** | 2 columns |
| Typical price | 4.22 ms | 2.56 ms | **0.92 ms** | 3 columns |
| Bullish impulse | 3.01 ms | 2.52 ms | **2.32 ms** | `Uint8Array` result |
| Bearish impulse | 3.25 ms | 2.93 ms | **2.36 ms** | `Uint8Array` result |
| Stochastic (14,3) | 4.63 ms | 3.62 ms | **3.00 ms** | O(n·period) |
| ATR (14) | 3.42 ms | 2.15 ms | **1.47 ms** | O(n·period) |
| ADX (14) | 6.51 ms | 4.87 ms | **3.97 ms** | O(n·period) |
| CCI (20) | 5.91 ms | 3.77 ms | **3.48 ms** | O(n·period) |
| Williams %R (14) | 3.13 ms | 2.38 ms | **1.85 ms** | O(n·period) |
| Parabolic SAR | 2.04 ms | 1.35 ms | **0.96 ms** | |
| Keltner (20,2) | 5.74 ms | 4.71 ms | **3.40 ms** | O(n·period) |
| Donchian (20) | 4.68 ms | 4.03 ms | **2.97 ms** | |
| Ichimoku | 13.62 ms | 12.08 ms | **9.89 ms** | 5 outputs |
| Bollinger (20,2) | 7.46 ms | 9.32 ms | **5.98 ms** | 3 outputs |
| MACD (12,26,9) | 4.01 ms | 3.60 ms | **2.46 ms** | 3 outputs |
| VWAP | 3.23 ms | 1.36 ms | **0.82 ms** | 4 columns |
| OBV | 1.54 ms | 0.90 ms | **0.45 ms** | 2 columns |
| ExprTk formula¹ | 5.70 ms | (same) | **4.11 ms** | 4 columns |

¹ `(High - Low) / Close * Volume * sin(Close)` — includes parsing the formula on every call.

### Native vs JavaScript — fair comparison

Both sides measured with **both input types** (the previous benchmark compared JS on `number[]`
against native on `Float64Array`, which flattered the native side):

| Indicator | JS `number[]` | JS `Float64Array` | native → `number[]` | native → `typed` | Verdict |
|---|---|---|---|---|---|
| SMA (20) | 0.61 ms | 0.97 ms | 0.81 ms | **0.47 ms** | **2.0× faster than JS** |
| EMA (12) | 0.59 ms | 0.77 ms | 0.87 ms | **0.58 ms** | **1.3× faster than JS** |
| RSI (14) | 1.24 ms | 1.42 ms | 1.28 ms | **1.05 ms** | **1.4× faster than JS** |
| Volatility (26) | 2.54 ms | 1.23 ms | 1.49 ms | 1.28 ms | ≈1.0× (on par) |
| WMA (20) | 3.14 ms | 5.86 ms | 2.67 ms | **2.59 ms** | **2.3× faster than JS** |
| Typical price | 0.89 ms | 1.29 ms | 1.01 ms | **0.42 ms** | **3.1× faster than JS** |
| ExprTk formula² | 4.17 ms | 4.17 ms | 4.94 ms | 4.35 ms | ≈1.0× (on par) |

² Compared against a **hand-written tight loop** with the same expression — the fairest
possible JS. Against *idiomatic* JS (`Array.from(closes, i => …)` ≈ 8–9 ms) the native formula
engine is **~1.3–1.8× faster**; both figures appear in the summary of `node benchmark.js`.

### How to read these numbers

- **`{ output: 'typed' }` + `Float64Array` input is the fast path.** It wins on every indicator
  above. The default `number[]` API costs you ~1.1–3.4× per call for the convenience of plain
  arrays.
- **Simple indicators are now faster than competent JS** (SMA 2.0×, WMA 2.3×, typical price 3.1×)
  — an earlier revision of this README claimed the opposite, because that benchmark compared
  unfair input types and used `Array.from()` (≈5 ms) for output conversion instead of the tight
  loop (≈0.45 ms) the wrapper actually uses.
- **Volatility is on par with JS, not 12× slower.** It previously recomputed the whole window per
  candle (O(n·period), plus a heap allocation per iteration); the current implementation uses
  O(n) rolling sums.
- **Formula complexity is nearly free in `calculate`** — what costs is crossing the boundary and
  re-parsing the formula string per call (~1–2 ms). If you evaluate the *same* formula over many
  batches, prefer fewer, larger calls (e.g. one call over all candles rather than per-tick calls).

The **async API is a separate, unconditional win**: `await cfm.sma(data, 20)` offloads the work to
the libuv thread pool, so a server keeps serving requests while indicators are computed; the sync
form blocks the event loop.

**Practical guidance**

| Situation | Recommendation |
|---|---|
| Backtests, tight loops, worker threads | `…Sync` + `Float64Array` input + `{ output: 'typed' }`. |
| A single trivial indicator on a small array | Any mode — under a millisecond either way. |
| Custom / composite formulas | `calculate` / `calculateSync` — one pass, no hand-written loops. |
| Anything inside a server, request handler or UI process | Use the **async** API so you never block the event loop. |
| Results consumed by `Array`-only APIs (JSON, spreads) | Default `number[]` — the ~0.45 ms conversion is unavoidable there anyway. |

```bash
node benchmark.js
```

## Browser support

❌ **Not supported.** C++ Node-API addons cannot run inside a browser sandbox.
A WebAssembly build is on the roadmap.

## TypeScript

Type declarations ship with the package, so everything is typed out of the box. The main exported
types:

```ts
import type {
  NumericArray,        // number[] | Float32Array | Float64Array | Int32Array | Uint32Array | ...
  OutputOptions,       // { output?: 'array' | 'typed' } — trailing-argument result switch
  TypedOutput,         // { output: 'typed' } — narrows the result to Float64Array
  TypedResult<T>,      // maps T's number[] fields to Float64Array (used by the overloads)
  MacdResult,          // { macd, signal, histogram }
  BollingerResult,     // { upper, middle, lower }
  StochasticResult,    // { k, d }
  AdxResult,           // { adx, plusDI, minusDI }
  KeltnerResult,       // { upper, middle, lower }
  DonchianResult,      // { upper, middle, lower }
  IchimokuResult,      // { tenkan, kijun, senkouA, senkouB, chikou }
  IndicatorResult,     // union of every result type above
  CalculateArgs,       // { formula, params, returnType? }
} from 'crypto-fast-math';
```

The overloads connect option and result type — no casts:

```ts
const a = cfm.smaSync(closes, 20);                       // number[]
const b = cfm.smaSync(closes, 20, { output: 'typed' });  // Float64Array
const c = cfm.macdSync(closes, 12, 26, 9);               // { macd: number[]; ... }
const d = cfm.macdSync(closes, 12, 26, 9, { output: 'typed' }); // { macd: Float64Array; ... }
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Cannot find module 'crypto-fast-math'` | Package not installed (or wrong directory) | `npm install crypto-fast-math`; check `node_modules/` |
| `The specified module could not be found` (Windows) | Missing Visual C++ Redistributable | Install [VC++ Redist x64](https://aka.ms/vs/17/release/vc_redist.x64.exe) |
| `node-gyp-build` fails during `npm install` | No prebuild for your platform — source fallback needs a toolchain | Windows: Visual Studio Build Tools with the C++ workload; macOS: `xcode-select --install`; Linux: `sudo apt install build-essential` |
| `ExprTk parse error: ERR239 - Undefined symbol` | Variable not in `params` (names are case-sensitive) | Add the column to `params` or fix the typo |
| Results are all `NaN` | Warm-up period is included in the output | Slice off the first `period` values: `const clean = rsi.slice(13)` |
| `all param columns must have equal length` | Columns of different lengths | Slice/pad every column to the same length |
| `Array '<name>' must contain only numbers or null` | Booleans/strings in a data column | Use `0`/`1`; `null`/`undefined` become `NaN` |

## Building from source

```bash
git clone https://github.com/Koderkup/crypto-fast-math.git
cd crypto-fast-math
npm install
npm run build        # compiles the C++ addon and the TypeScript
```

The build pipeline:

1. `node-gyp configure` — generates the platform build files.
2. `scripts/fix-vcxproj.js` — **Windows only:** patches the generated `.vcxproj` to enable RTTI
   (`/GR`), C++ exceptions (`/EHsc`) and `/bigobj`. ExprTk needs them, but node-gyp disables them
   by default.
3. `node-gyp build --release` — compiles `src/cpp/*.cpp` into `build/Release/addon.node`.
4. `tsc` — compiles `src/*.ts` into `dist/`.

**Requirements:** Node.js ≥ 18, Python 3, and a C++17 compiler (MSVC *Build Tools* on Windows;
Xcode command-line tools on macOS; `build-essential`/clang on Linux).

**Supported compilers.** `node-gyp` detects Visual Studio **2017–2022** Build Tools.
Newer previews (e.g. VS 2026 / v18) may not be detected yet — install VS 2022
Build Tools alongside, or pin the version with `npm config set msvs_version 2022`.
The same applies on CI: the workflow uses `windows-latest`, which ships VS 2022.

> **Windows.** `node-gyp` does not auto-detect MSVC from a plain terminal — run the build commands
> from a **Developer Command Prompt for Visual Studio** (or call `vcvarsall.bat x64` first), otherwise
> `node-gyp configure` fails with *"Could not find any Visual Studio installation to use"*.

## Running the tests

```bash
npm test            # builds the addon + TS, then runs the whole suite
npm run test:quick  # runs the suite against an already-built addon
npm run lint        # type-check only (tsc --noEmit)
```

The suite covers every indicator and the formula engine, including sync/async parity.

## Publishing to npm (maintainers)

This package ships prebuilt binaries **inside** the npm tarball using
[`prebuildify`](https://github.com/prebuild/prebuildify) + [`node-gyp-build`](https://github.com/prebuild/node-gyp-build),
so users get a working native module without a compiler.

The recommended flow is fully automated: `.github/workflows/prebuilds.yml`
builds all five platform binaries on a `v*` git tag and publishes the package
with the merged `prebuilds/`. Locally you can do the same by hand:

### 1. Build prebuilds for every target platform

`prebuildify` builds for the **host** OS/architecture only, so run it on each platform you want to
support — locally or, better, in a CI matrix (`windows-latest`, `ubuntu-latest`, `macos-latest`,
plus ARM runners if you target them). On Windows, run it from a **Developer Command Prompt for
Visual Studio** so `node-gyp` can find MSVC.

```bash
npm run prebuild    # compiles the addon and writes prebuilds/<platform>-<arch>/*.node
```

Resulting layout:

```
prebuilds/
  win32-x64/crypto-fast-math.node
  linux-x64/crypto-fast-math.node
  linux-arm64/crypto-fast-math.node
  darwin-x64/crypto-fast-math.node
  darwin-arm64/crypto-fast-math.node
```

Because the binaries are built against **Node-API**, one prebuild per platform/arch works across
Node and Electron versions — no need to rebuild per Node release.

### 2. Check what will be published

```bash
npm pack --dry-run
```

Verify the listing contains `prebuilds/`, `dist/`, `binding.gyp`, `src/cpp/`, `README.md`,
`LICENSE` and `package.json` — and nothing else (no `build/`, no `test/`, no `node_modules/`).

### 3. Log in and publish

```bash
npm login            # username + password + OTP (two-factor auth is required to publish)
npm publish          # for a scoped name add:  --access public
```

### 4. Verify

```bash
npm view crypto-fast-math
# in a clean directory:
npm install crypto-fast-math
node -e "console.log(require('crypto-fast-math').smaSync([1,2,3,4],2))"
```

Notes:

- Bump `"version"` (SemVer) before every publish — npm rejects duplicate versions.
- `node-gyp-build` (wired to the `install` script) resolves the matching bundled prebuild at install
  time and only falls back to compiling from source when no prebuild matches the user's platform.
- The `files` field is the whitelist; it takes precedence over `.gitignore`, so `prebuilds/` and
  `dist/` are included even though they are git-ignored.

## License

MIT © Koderkup — see [LICENSE](./LICENSE).





