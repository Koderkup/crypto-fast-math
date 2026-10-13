#pragma once
#include <vector>
#include <cstddef>
#include <cstdint>

namespace cfm {

struct MacdResult {
  std::vector<double> macd;
  std::vector<double> signal;
  std::vector<double> histogram;
};

struct BbandsResult {
  std::vector<double> upper;
  std::vector<double> middle;
  std::vector<double> lower;
};

struct StochasticResult {
  std::vector<double> k;
  std::vector<double> d;
};

struct AdxResult {
  std::vector<double> adx;
  std::vector<double> plusDI;
  std::vector<double> minusDI;
};

struct KeltnerResult {
  std::vector<double> upper;
  std::vector<double> middle;
  std::vector<double> lower;
};

struct DonchianResult {
  std::vector<double> upper;
  std::vector<double> middle;
  std::vector<double> lower;
};

struct IchimokuResult {
  std::vector<double> tenkan;
  std::vector<double> kijun;
  std::vector<double> senkouA;
  std::vector<double> senkouB;
  std::vector<double> chikou;
};

/// Среднее арифметическое по скользящему окну (SMA).
/// Первые `period-1` элементов — NaN (недостаточно данных для окна).
std::vector<double> sma(const double* p, size_t n, int period);

/// Экспоненциальное скользящее среднее (EMA).
/// Альфа = 2/(period+1). Первые `period-1` элементов — NaN, затем затравка SMA.
std::vector<double> ema(const double* p, size_t n, int period);

/// Индекс относительной силы (RSI, Wilder).
/// Значения NaN до индекса `period` включительно (нужен `period` дельт).
std::vector<double> rsi(const double* p, size_t n, int period);

/// MACD (fast/slow/signal). Возвращает линии macd, signal, histogram.
MacdResult macd(const double* p, size_t n, int fastPeriod, int slowPeriod, int signalPeriod);

/// Bollinger Bands (period, k std-dev).
BbandsResult bollinger(const double* p, size_t n, int period, double stdDev);

/// Волатильность — скользящее стандартное отклонение доходностей за `period` свечей.
std::vector<double> volatility(const double* p, size_t n, int period);

/// Медианная цена свечи: (high + low) / 2.
std::vector<double> medianPrice(const double* high, const double* low, size_t n);

/// Типичная цена: (high + low + close) / 3.
std::vector<double> typicalPrice(const double* high, const double* low, const double* close, size_t n);

/// Критерий Келли: доля капитала к риску.
double kellyCriterion(double winRate, double winAvg, double lossAvg);

/// Бычье импульсное движение (Elder Impulse): EMA(13) ↑ и MACD-hist ↑.
std::vector<uint8_t> bullishImpulse(const double* close, size_t n);

/// Медвежье импульсное движение (Elder Impulse): EMA(13) ↓ и MACD-hist ↓.
std::vector<uint8_t> bearishImpulse(const double* close, size_t n);

// === Priority 1: Stochastic, ATR, ADX, VWAP ===

/// Стохастический осциллятор (Stoch %K и %D).
/// %K = ((Close - LowN) / (HighN - LowN)) * 100, %D = SMA(%K, dPeriod)
StochasticResult stochastic(const double* high, const double* low, const double* close, size_t n, int kPeriod, int dPeriod);

/// Average True Range (ATR) — Wilder smoothing of True Range.
std::vector<double> atr(const double* high, const double* low, const double* close, size_t n, int period);

/// Average Directional Index (ADX) — Wilder implementation.
AdxResult adx(const double* high, const double* low, const double* close, size_t n, int period);

/// Volume Weighted Average Price (VWAP) — cumulative.
std::vector<double> vwap(const double* high, const double* low, const double* close, const double* volume, size_t n);

// === Priority 2: OBV, WMA, HMA, CCI, Williams %R, Momentum ===

/// On-Balance Volume (OBV).
std::vector<double> obv(const double* close, const double* volume, size_t n);

/// Weighted Moving Average (WMA).
std::vector<double> wma(const double* p, size_t n, int period);

/// Hull Moving Average (HMA).
std::vector<double> hma(const double* p, size_t n, int period);

/// Commodity Channel Index (CCI).
std::vector<double> cci(const double* high, const double* low, const double* close, size_t n, int period);

/// Williams %R.
std::vector<double> williamsR(const double* high, const double* low, const double* close, size_t n, int period);

/// Momentum (price difference).
std::vector<double> momentum(const double* p, size_t n, int period);

// === Priority 3: Keltner, Donchian, ROC, Parabolic SAR, Ichimoku ===

/// Keltner Channels (EMA ± mult × ATR).
KeltnerResult keltner(const double* high, const double* low, const double* close, size_t n, int period, double mult);

/// Donchian Channels (N-period high/low, middle = average).
DonchianResult donchian(const double* high, const double* low, size_t n, int period);

/// Rate of Change (ROC).
std::vector<double> roc(const double* p, size_t n, int period);

/// Parabolic SAR.
std::vector<double> parabolicSAR(const double* high, const double* low, size_t n, double step, double maxStep);

/// Ichimoku Cloud.
IchimokuResult ichimoku(const double* high, const double* low, const double* close, size_t n);

// === Batch computation ===
struct BatchInput {
  const double* prices = nullptr;
  const double* high = nullptr;
  const double* low = nullptr;
  const double* close = nullptr;
  const double* volume = nullptr;
  size_t n = 0;
};

struct BatchOutput {
  // Single-output indicators
  std::vector<double> sma;
  std::vector<double> ema;
  std::vector<double> rsi;
  std::vector<double> wma;
  std::vector<double> hma;
  std::vector<double> volatility;
  std::vector<double> momentum;
  std::vector<double> roc;
  std::vector<double> medianPrice;
  std::vector<double> typicalPrice;
  std::vector<double> obv;
  std::vector<double> cci;
  std::vector<double> williamsR;
  std::vector<uint8_t> bullishImpulse;
  std::vector<uint8_t> bearishImpulse;
  std::vector<double> atr;
  std::vector<double> vwap;
  
  // Multi-output indicators
  MacdResult macd;
  BbandsResult bollinger;
  StochasticResult stochastic;
  AdxResult adx;
  KeltnerResult keltner;
  DonchianResult donchian;
  IchimokuResult ichimoku;
  std::vector<double> parabolicSAR;
};

// Compute a batch of indicators on the same input data.
// Only requested indicators (non-empty period/params) are computed.
// All outputs are resized to n and filled with NaN/0 for uncomputed.
void computeBatch(const BatchInput& in, BatchOutput& out,
                  // Single-output with period
                  int smaPeriod = 0, int emaPeriod = 0, int rsiPeriod = 0,
                  int wmaPeriod = 0, int hmaPeriod = 0, int volatilityPeriod = 0,
                  int momentumPeriod = 0, int rocPeriod = 0,
                  int obvEnabled = 0, int cciPeriod = 0, int williamsRPeriod = 0,
                  int atrPeriod = 0,
                  // Multi-output
                  int macdFast = 0, int macdSlow = 0, int macdSignal = 0,
                  int bollingerPeriod = 0, double bollingerStdDev = 2.0,
                  int stochasticK = 0, int stochasticD = 0,
                  int adxPeriod = 0,
                  int keltnerPeriod = 0, double keltnerMult = 2.0,
                  int donchianPeriod = 0,
                  int ichimokuEnabled = 0,
                  int parabolicSAREnabled = 0, double psarStep = 0.02, double psarMaxStep = 0.2);

} // namespace cfm
