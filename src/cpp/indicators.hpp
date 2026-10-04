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

} // namespace cfm
