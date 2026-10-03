# crypto-fast-math

> High-performance crypto trading math for Node.js — powered by C++.

[![npm version](https://img.shields.io/npm/v/crypto-fast-math.svg)](https://www.npmjs.com/package/crypto-fast-math)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)](#)

A Node.js library that brings the raw speed of C++ to crypto trading calculations.
Run ready-made indicators or inject your own formulas as strings — everything is
parsed once and executed at native speed, without blocking the Node.js event loop.

---

## ✨ Why crypto-fast-math?

JavaScript is great for async I/O — perfect for talking to exchange WebSockets.
But when it comes to crunching millions of candles for backtesting, RSI, MACD,
or volatility, pure JS starts to choke.

**crypto-fast-math** solves this by moving heavy math into a C++ core, exposed
to Node.js through Node-API. You keep writing JavaScript — you get C++ speed.

- ⚡ **Up to 100× faster** than pure-JS libraries on large datasets
- 🧵 **Non-blocking** — heavy calculations run on a separate thread
- 📦 **Zero setup** — prebuilt binaries for Windows, Linux and macOS
- 🧮 **Ready-made indicators** — SMA, EMA, RSI, MACD, Bollinger, and more
- 🛠️ **Custom formulas** — pass any expression as a string
- 🧠 **Async by default** — event loop stays free

---

## 📦 Installation

```bash
npm install crypto-fast-math
