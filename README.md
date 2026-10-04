# crypto-fast-math

[![npm version](https://img.shields.io/npm/v/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![npm downloads](https://img.shields.io/npm/dm/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**High-performance trading & crypto math for Node.js.** A native **C++17 core** (Node-API) with
**25+ ready-made technical indicators** and a **compiled custom-formula engine** (ExprTk), shipped
with **prebuilt binaries** for Windows, Linux and macOS — no compiler, no `node-gyp`, no config.

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
- [Ready-made indicators](#ready-made-indicators)
- [API reference](#api-reference)
- [Custom formulas (ExprTk engine)](#custom-formulas-exprtk-engine)
- [Performance](#performance)
- [TypeScript](#typescript)
- [Building from source](#building-from-source)
- [Running the tests](#running-the-tests)
- [Publishing to npm (maintainers)](#publishing-to-npm-maintainers)
- [License](#license)

---

## Why crypto-fast-math?

| | |
|---|---|
| ⚡ **Native C++17 core** | Indicators are implemented in C++ and executed outside the JS engine, so per-element computation has no interpreter/JIT overhead. |
| 🧮 **Compiled custom formulas** | Write any metric as a string. [ExprTk](https://github.com/ArashPartow/exprtk) parses it **once** and evaluates it in C++ — measured **≈1.7× faster** than the equivalent hand-written JS for a representative formula, and the gap widens as the formula gets more complex. |
| 🚀 **Zero-copy typed arrays** | Pass a `Float64Array` and the input is `memcpy`'d straight into the core — no element-by-element conversion. |
| 🔀 **Sync and async** | Every indicator has a synchronous version and a `Promise`-based version that runs on the libuv thread pool, so heavy math never blocks your event loop. |
| 📦 **Zero-config install** | Prebuilt `.node` binaries are bundled in the package and resolved automatically by [`node-gyp-build`](https://github.com/prebuild/node-gyp-build). |
| 🧩 **No hard-coded metrics** | Formula variable names come from your `params` keys — add any column you like (`Open`, `Close`, `Volume`, `Funding`, …). |
| 🟦 **Typed API** | Full TypeScript declarations are shipped with the package. |

> **Design note.** The native core is a *throughput* tool: it pays off when the compute per call
> is large enough to dominate the fixed cost of moving data across the JS↔C++ boundary. See
> [Performance](#performance) for measured numbers and guidance on when to prefer the native
> functions over plain JS.

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

### Sync vs async

Every indicator `xxxSync(...)` has an async twin `xxx(...)` with the **same arguments** that
returns a `Promise`:

```ts
cfm.smaSync(prices, 20);   // blocking, lowest latency for small inputs
await cfm.sma(prices, 20); // non-blocking, runs on the libuv thread pool
```

Use the async form inside request handlers, servers and anything that must stay responsive;
use the sync form inside worker threads, CLI scripts and tight backtest loops.

## Ready-made indicators

Every row exposes a **sync** function (`…Sync`) and an **async** twin (`…`). Parameters listed
with `=` have that default. All price/volume inputs accept a plain `number[]` or any numeric
`TypedArray` (best: `Float64Array`).

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
  // Reference to an unknown variable 'Open' throws
}
```

The engine also throws on syntactically invalid expressions, so you can validate user-supplied
formulas before running them over a large dataset.

## Performance

Benchmarks below compare the native core against **hand-written, V8-optimised JavaScript** over
**100 000 candles**, averaged over 50 runs (run it yourself with `node benchmark.js`). Native
functions receive `Float64Array` inputs (their fastest path); the JS references use plain packed
arrays. Measured on Windows, Node.js 24.

| Operation (N = 100 000) | Pure JS | Native | Speedup |
|---|---|---|---|
| **Custom ExprTk formula** `(High-Low)/Close*Volume*sin(Close)` | 21.6 ms | **12.4 ms** | **1.7×** |
| Volatility(26) | 21.5 ms | 20.7 ms | ≈1.0× |
| Typical Price (3 columns) | 3.5 ms | 5.9 ms | 0.6× |
| Williams %R(14) | 4.1 ms | 7.1 ms | 0.6× |
| WMA(20) | 3.8 ms | 7.0 ms | 0.5× |
| Stochastic(14, 3) | 5.5 ms | 12.5 ms | 0.4× |
| SMA(20) | 0.70 ms | 5.8 ms | 0.1× |
| EMA(12) | 0.76 ms | 5.5 ms | 0.1× |
| RSI(14) | 1.40 ms | 5.9 ms | 0.2× |

### How to read these numbers

The C++ core is faster whenever the **per-call compute dominates the cost of moving data across the
JS↔C++ boundary**. That boundary cost is roughly fixed per call and, for 100k-element results, is
dominated by turning the result back into a plain JS array (`Array.from(Float64Array)` costs ≈4 ms
at this size on Node 24). So:

- **Custom formulas win clearly (≈1.7× here).** The expression is compiled once and every candle is
  evaluated in a tight C++ loop, so the boundary cost is amortised by the compute. The more complex
  the formula, the larger the win.
- **Simple single-pass indicators (SMA / EMA / RSI) are faster in pure JS** at this size — a compiled
  V8 loop with no marshalling beats a native call for trivial O(n) work on a single column.
- **Multi-column and warm-up-heavy indicators** sit near the crossover; the native side pulls ahead
  as the amount of math per call grows (more columns, larger periods, more math functions).

The **async API is a separate, unconditional win**: `await cfm.sma(data, 20)` offloads the work to
the libuv thread pool, so a server keeps serving requests while indicators are computed; the sync
form blocks the event loop.

**Practical guidance**

| Situation | Recommendation |
|---|---|
| A single trivial indicator on a small in-memory array | Plain JS is fine — and often faster. |
| Custom / composite formulas, many columns, complex math | Use `calculate` / `calculateSync` — this is the core's sweet spot. |
| Anything inside a server, request handler or UI process | Use the **async** API so you never block the event loop. |
| Batch jobs / backtests | Measure both; pass `Float64Array` inputs to the native functions. |

> **Tip.** Always pass `Float64Array` (not plain `number[]`) to the native functions — typed arrays
> take a `memcpy` fast path into the core instead of an element-by-element conversion.

```bash
node benchmark.js
```

## TypeScript

Type declarations ship with the package, so everything is typed out of the box. The main exported
types:

```ts
import type {
  NumericArray,        // number[] | Float32Array | Float64Array | Int32Array | Uint32Array | ...
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





