// indicators.cpp — чистые C++ реализации торговых индикаторов.
#include "indicators.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>
#include <limits>

namespace cfm {

static constexpr double NAN_D = std::numeric_limits<double>::quiet_NaN();

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

/// Скользящее среднее по окну `period` (SMA). Первые period-1 — NaN.
static std::vector<double> sma_window(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  double window = 0.0;
  for (size_t i = 0; i < n; ++i) {
    window += p[i];
    if (static_cast<int>(i) >= period) window -= p[i - period];
    if (static_cast<int>(i) >= period - 1) out[i] = window / period;
  }
  return out;
}

/// Экспоненциальное скользящее среднее (EMA) со затравкой SMA.
static std::vector<double> ema_core(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  const double alpha = 2.0 / (static_cast<double>(period) + 1.0);
  double sma = 0.0;
  for (int i = 0; i < period; ++i) sma += p[i];
  sma /= period;
  out[period - 1] = sma;
  double prev = sma;
  for (size_t i = static_cast<size_t>(period); i < n; ++i) {
    prev = alpha * p[i] + (1.0 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/// Стандартное отклонение (population / N) по окну, заканчивающемуся в индексе i.
static double stddev_window(const double* base, size_t i, int period) {
  if (period <= 1) return 0.0;
  double mean = 0.0;
  for (int k = 0; k < period; ++k) mean += base[i - period + 1 + k];
  mean /= period;
  double var = 0.0;
  for (int k = 0; k < period; ++k) {
    double d = base[i - period + 1 + k] - mean;
    var += d * d;
  }
  return std::sqrt(var / static_cast<double>(period));
}

// ---------------------------------------------------------------------------
// Публичные индикаторы
// ---------------------------------------------------------------------------

std::vector<double> sma(const double* p, size_t n, int period) {
  if (period <= 0) throw std::invalid_argument("period must be > 0");
  return sma_window(p, n, period);
}

std::vector<double> ema(const double* p, size_t n, int period) {
  if (period <= 0) throw std::invalid_argument("period must be > 0");
  return ema_core(p, n, period);
}

/// RSI по методу Уайлдера: 100 - 100/(1+RS).
std::vector<double> rsi(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period + 1)) return out;
  double avgGain = 0.0, avgLoss = 0.0;
  for (int i = 1; i <= period; ++i) {
    double diff = p[i] - p[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  auto rsiValue = [](double g, double l) -> double {
    if (l == 0.0) return 100.0;
    if (g == 0.0) return 0.0;
    return 100.0 - 100.0 / (1.0 + g / l);
  };
  out[period] = rsiValue(avgGain, avgLoss);
  for (size_t i = static_cast<size_t>(period + 1); i < n; ++i) {
    double diff = p[i] - p[i - 1];
    double gain = diff > 0 ? diff : 0.0;
    double loss = diff < 0 ? -diff : 0.0;
    avgGain = (avgGain * (period - 1.0) + gain) / period;
    avgLoss = (avgLoss * (period - 1.0) + loss) / period;
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}

// === END CHUNK 1 ===

MacdResult macd(const double* p, size_t n, int fastPeriod, int slowPeriod, int signalPeriod) {
  MacdResult res;
  res.macd.assign(n, NAN_D);
  res.signal.assign(n, NAN_D);
  res.histogram.assign(n, NAN_D);
  if (fastPeriod <= 0 || slowPeriod <= 0 || signalPeriod <= 0)
    throw std::invalid_argument("periods must be > 0");
  if (fastPeriod >= slowPeriod)
    throw std::invalid_argument("fastPeriod must be < slowPeriod");
  auto fast = ema_core(p, n, fastPeriod);
  auto slow = ema_core(p, n, slowPeriod);
  size_t needed = static_cast<size_t>(slowPeriod);
  for (size_t i = needed - 1; i < n; ++i) res.macd[i] = fast[i] - slow[i];
  auto sig = ema_core(res.macd.data(), n, signalPeriod);
  for (size_t i = 0; i < n; ++i) {
    if (!std::isnan(sig[i]) && !std::isnan(res.macd[i])) res.signal[i] = sig[i];
    if (!std::isnan(res.macd[i]) && !std::isnan(res.signal[i])) {
      res.histogram[i] = res.macd[i] - res.signal[i];
    }
  }
  return res;
}

BbandsResult bollinger(const double* p, size_t n, int period, double stdDev) {
  BbandsResult res;
  res.upper.assign(n, NAN_D);
  res.middle.assign(n, NAN_D);
  res.lower.assign(n, NAN_D);
  if (period <= 0) throw std::invalid_argument("period must be > 0");
  auto mid = sma_window(p, n, period);
  for (size_t i = 0; i < n; ++i) {
    if (std::isnan(mid[i])) continue;
    double sd = stddev_window(p, i, period);
    res.middle[i] = mid[i];
    res.upper[i]  = mid[i] + stdDev * sd;
    res.lower[i]  = mid[i] - stdDev * sd;
  }
  return res;
}

std::vector<double> volatility(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0) throw std::invalid_argument("period must be > 0");
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double mean = 0.0;
    std::vector<double> rets;
    rets.reserve(period);
    // Compute up to (period-1) returns ending at i; skip idx==0 (no previous price)
    for (int k = 1; k < period; ++k) {
      size_t idx = i - period + k;
      if (idx == 0) continue;
      double prev = p[idx - 1];
      double r = (prev == 0.0) ? 0.0 : (p[idx] - prev) / prev;
      rets.push_back(r);
      mean += r;
    }
    if (rets.empty()) continue;
    mean /= static_cast<double>(rets.size());
    double var = 0.0;
    for (double r : rets) { double d = r - mean; var += d * d; }
    out[i] = std::sqrt(var / static_cast<double>(rets.size()));
  }
  return out;
}

std::vector<double> medianPrice(const double* high, const double* low, size_t n) {
  std::vector<double> out(n);
  for (size_t i = 0; i < n; ++i) out[i] = (high[i] + low[i]) / 2.0;
  return out;
}

std::vector<double> typicalPrice(const double* high, const double* low, const double* close, size_t n) {
  std::vector<double> out(n);
  for (size_t i = 0; i < n; ++i) out[i] = (high[i] + low[i] + close[i]) / 3.0;
  return out;
}

// === END CHUNK 2 ===

double kellyCriterion(double winRate, double winAvg, double lossAvg) {
  if (winRate < 0.0 || winRate > 1.0)
    throw std::domain_error("winRate must be in [0,1]");
  if (lossAvg <= 0.0) throw std::domain_error("lossAvg must be > 0");
  if (winAvg <= 0.0) return 0.0;
  double f = (winRate * winAvg - (1.0 - winRate) * lossAvg) / winAvg;
  return std::max(0.0, std::min(f, 1.0));
}

std::vector<uint8_t> bullishImpulse(const double* close, size_t n) {
  std::vector<uint8_t> out(n, 0);
  if (n < 14) return out;
  auto ema13 = ema_core(close, n, 13);
  auto mc = macd(close, n, 12, 26, 9);
  for (size_t i = 13; i < n; ++i) {
    if (std::isnan(ema13[i]) || std::isnan(ema13[i - 1])) continue;
    if (std::isnan(mc.histogram[i]) || std::isnan(mc.histogram[i - 1])) continue;
    bool emaUp = ema13[i] > ema13[i - 1];
    bool histUp = mc.histogram[i] > mc.histogram[i - 1];
    out[i] = (emaUp || histUp) ? 1 : 0;
  }
  return out;
}

std::vector<uint8_t> bearishImpulse(const double* close, size_t n) {
  std::vector<uint8_t> out(n, 0);
  if (n < 14) return out;
  auto ema13 = ema_core(close, n, 13);
  auto mc = macd(close, n, 12, 26, 9);
  for (size_t i = 13; i < n; ++i) {
    if (std::isnan(ema13[i]) || std::isnan(ema13[i - 1])) continue;
    if (std::isnan(mc.histogram[i]) || std::isnan(mc.histogram[i - 1])) continue;
    bool emaDown = ema13[i] < ema13[i - 1];
    bool histDown = mc.histogram[i] < mc.histogram[i - 1];
    out[i] = (emaDown || histDown) ? 1 : 0;
  }
  return out;
}

} // namespace cfm
