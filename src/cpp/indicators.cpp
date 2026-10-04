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

// ===========================================================================
// Priority 1: Stochastic, ATR, ADX, VWAP
// ===========================================================================

std::vector<double> atr(const double* high, const double* low, const double* close, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  std::vector<double> tr(n, 0.0);
  for (size_t i = 0; i < n; ++i) {
    double h_l = high[i] - low[i];
    if (i == 0) { tr[i] = h_l; }
    else {
      double h_pc = std::abs(high[i] - close[i - 1]);
      double l_pc = std::abs(low[i] - close[i - 1]);
      tr[i] = std::max(h_l, std::max(h_pc, l_pc));
    }
  }
  double avg = 0.0;
  for (int i = 0; i < period; ++i) avg += tr[i];
  avg /= period;
  out[period - 1] = avg;
  for (size_t i = static_cast<size_t>(period); i < n; ++i) {
    avg = (avg * (period - 1.0) + tr[i]) / period;
    out[i] = avg;
  }
  return out;
}

AdxResult adx(const double* high, const double* low, const double* close, size_t n, int period) {
  AdxResult res;
  res.adx.assign(n, NAN_D);
  res.plusDI.assign(n, NAN_D);
  res.minusDI.assign(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(2 * period - 1)) return res;
  std::vector<double> tr(n, 0.0), plusDM(n, 0.0), minusDM(n, 0.0);
  for (size_t i = 0; i < n; ++i) {
    if (i == 0) { tr[i] = high[i] - low[i]; }
    else {
      double h_l = high[i] - low[i];
      double h_pc = std::abs(high[i] - close[i - 1]);
      double l_pc = std::abs(low[i] - close[i - 1]);
      tr[i] = std::max(h_l, std::max(h_pc, l_pc));
      double dh = high[i] - high[i - 1], dl = low[i - 1] - low[i];
      if (dh > 0 && dh > dl) plusDM[i] = dh;
      if (dl > 0 && dl > dh) minusDM[i] = dl;
    }
  }
  double atr = 0.0, pdm = 0.0, mdm = 0.0;
  for (int i = 0; i < period; ++i) { atr += tr[i]; pdm += plusDM[i]; mdm += minusDM[i]; }
  atr /= period; pdm /= period; mdm /= period;
  res.adx[period - 1] = 0.0;
  res.plusDI[period - 1] = pdm / atr * 100.0;
  res.minusDI[period - 1] = mdm / atr * 100.0;
  double prevDX = 0.0;
  for (size_t i = static_cast<size_t>(period); i < n; ++i) {
    atr = (atr * (period - 1.0) + tr[i]) / period;
    pdm = (pdm * (period - 1.0) + plusDM[i]) / period;
    mdm = (mdm * (period - 1.0) + minusDM[i]) / period;
    double pdi = pdm / atr * 100.0, mdi = mdm / atr * 100.0;
    res.plusDI[i] = pdi; res.minusDI[i] = mdi;
    double diff = std::abs(pdi - mdi), sum_ = pdi + mdi;
    double dx = sum_ == 0.0 ? 0.0 : (diff / sum_) * 100.0;
    if (i == static_cast<size_t>(period)) { prevDX = dx; res.adx[i] = prevDX; }
    else { prevDX = (prevDX * (period - 1.0) + dx) / period; res.adx[i] = prevDX; }
  }
  return res;
}

std::vector<double> vwap(const double* high, const double* low, const double* close, const double* volume, size_t n) {
  std::vector<double> out(n, NAN_D);
  double cumPV = 0.0, cumV = 0.0;
  for (size_t i = 0; i < n; ++i) {
    double tp = (high[i] + low[i] + close[i]) / 3.0;
    cumPV += tp * volume[i]; cumV += volume[i];
    out[i] = cumV > 0.0 ? cumPV / cumV : 0.0;
  }
  return out;
}

StochasticResult stochastic(const double* high, const double* low, const double* close, size_t n, int kPeriod, int dPeriod) {
  StochasticResult res;
  res.k.assign(n, NAN_D); res.d.assign(n, NAN_D);
  if (kPeriod <= 0 || dPeriod <= 0 || n < static_cast<size_t>(kPeriod)) return res;
  for (size_t i = static_cast<size_t>(kPeriod - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < kPeriod; ++j) {
      size_t idx = i - kPeriod + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    double range = hh - ll;
    res.k[i] = range == 0.0 ? 0.0 : (close[i] - ll) / range * 100.0;
  }
  for (size_t i = static_cast<size_t>(kPeriod - 1 + dPeriod - 1); i < n; ++i) {
    double sum = 0.0; bool valid = true;
    for (int j = 0; j < dPeriod; ++j) {
      double val = res.k[i - dPeriod + 1 + j];
      if (std::isnan(val)) { valid = false; break; }
      sum += val;
    }
    if (valid) res.d[i] = sum / dPeriod;
  }
  return res;
}

// ===========================================================================
// Priority 2: OBV, WMA, HMA, CCI, Williams %R, Momentum
// ===========================================================================

std::vector<double> obv(const double* close, const double* volume, size_t n) {
  std::vector<double> out(n, 0.0);
  if (n == 0) return out;
  out[0] = volume[0];
  for (size_t i = 1; i < n; ++i) {
    if (close[i] > close[i - 1]) out[i] = out[i - 1] + volume[i];
    else if (close[i] < close[i - 1]) out[i] = out[i - 1] - volume[i];
    else out[i] = out[i - 1];
  }
  return out;
}

std::vector<double> wma(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  double denom = static_cast<double>(period) * (period + 1) / 2.0;
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double sum = 0.0;
    for (int j = 0; j < period; ++j)
      sum += p[i - j] * static_cast<double>(period - j);
    out[i] = sum / denom;
  }
  return out;
}

std::vector<double> hma(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  int half = period / 2;
  int sq = static_cast<int>(std::sqrt(static_cast<double>(period)));
  if (sq <= 0) sq = 1;
  auto wmaH = wma(p, n, half);
  auto wmaF = wma(p, n, period);
  std::vector<double> diff(n, NAN_D);
  for (size_t i = 0; i < n; ++i) {
    if (std::isnan(wmaH[i]) || std::isnan(wmaF[i])) continue;
    diff[i] = 2.0 * wmaH[i] - wmaF[i];
  }
  out = wma(diff.data(), n, sq);
  return out;
}

std::vector<double> cci(const double* high, const double* low, const double* close, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  std::vector<double> tp(n);
  for (size_t i = 0; i < n; ++i) tp[i] = (high[i] + low[i] + close[i]) / 3.0;
  auto smaTp = sma_window(tp.data(), n, period);
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double md = 0.0;
    for (int j = 0; j < period; ++j)
      md += std::abs(tp[i - period + 1 + j] - smaTp[i]);
    md /= period;
    out[i] = md == 0.0 ? 0.0 : (tp[i] - smaTp[i]) / (0.015 * md);
  }
  return out;
}

std::vector<double> williamsR(const double* high, const double* low, const double* close, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < period; ++j) {
      size_t idx = i - period + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    double range = hh - ll;
    out[i] = range == 0.0 ? 0.0 : (hh - close[i]) / range * 100.0;
  }
  return out;
}

std::vector<double> momentum(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i)
    out[i] = p[i] - p[i - period + 1];
  return out;
}

// ===========================================================================
// Priority 3: Keltner, Donchian, ROC, Parabolic SAR, Ichimoku
// ===========================================================================

KeltnerResult keltner(const double* high, const double* low, const double* close, size_t n, int period, double mult) {
  KeltnerResult res;
  res.upper.assign(n, NAN_D);
  res.middle.assign(n, NAN_D);
  res.lower.assign(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return res;
  auto atrVals = atr(high, low, close, n, period);
  auto emaVals = ema(close, n, period);
  for (size_t i = 0; i < n; ++i) {
    if (std::isnan(emaVals[i]) || std::isnan(atrVals[i])) continue;
    res.middle[i] = emaVals[i];
    res.upper[i]  = emaVals[i] + mult * atrVals[i];
    res.lower[i]  = emaVals[i] - mult * atrVals[i];
  }
  return res;
}

DonchianResult donchian(const double* high, const double* low, size_t n, int period) {
  DonchianResult res;
  res.upper.assign(n, NAN_D);
  res.middle.assign(n, NAN_D);
  res.lower.assign(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return res;
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < period; ++j) {
      size_t idx = i - period + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    res.upper[i] = hh;
    res.lower[i] = ll;
    res.middle[i] = (hh + ll) / 2.0;
  }
  return res;
}

std::vector<double> roc(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i)
    out[i] = p[i] - p[i - period + 1];
  return out;
}

std::vector<double> parabolicSAR(const double* high, const double* low, size_t n, double step, double maxStep) {
  std::vector<double> out(n, NAN_D);
  if (n < 2) return out;
  if (step <= 0) step = 0.02;
  if (maxStep <= step) maxStep = step * 10;
  bool uptrend = true;
  double sar = low[0];
  double af = step;
  for (size_t i = 1; i < n; ++i) {
    double ep = uptrend ? high[i - 1] : low[i - 1];
    sar = sar + af * (ep - sar);
    if (uptrend) {
      if (sar >= low[i]) {
        uptrend = false; sar = ep; af = step; ep = low[i];
      }
      sar = std::min(sar, low[i]);
    } else {
      if (sar <= high[i]) {
        uptrend = true; sar = ep; af = step; ep = high[i];
      }
      sar = std::max(sar, high[i]);
    }
    if (uptrend) ep = std::max(ep, high[i]);
    else ep = std::min(ep, low[i]);
    af = std::min(af + step, maxStep);
    out[i] = sar;
  }
  return out;
}

IchimokuResult ichimoku(const double* high, const double* low, const double* close, size_t n) {
  IchimokuResult res;
  res.tenkan.assign(n, NAN_D);
  res.kijun.assign(n, NAN_D);
  res.senkouA.assign(n, NAN_D);
  res.senkouB.assign(n, NAN_D);
  res.chikou.assign(n, NAN_D);
  const int tPeriod = 9, kPeriod = 26, sPeriod = 52;
  // Tenkan-sen (9-period)
  for (size_t i = static_cast<size_t>(tPeriod - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < tPeriod; ++j) {
      size_t idx = i - tPeriod + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    res.tenkan[i] = (hh + ll) / 2.0;
  }
  // Kijun-sen (26-period)
  for (size_t i = static_cast<size_t>(kPeriod - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < kPeriod; ++j) {
      size_t idx = i - kPeriod + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    res.kijun[i] = (hh + ll) / 2.0;
  }
  // Senkou Span A (shift 26 forward)
  for (size_t i = 25; i < n; ++i) {
    size_t target = i + 26;
    if (target < n && !std::isnan(res.tenkan[i]) && !std::isnan(res.kijun[i]))
      res.senkouA[target] = (res.tenkan[i] + res.kijun[i]) / 2.0;
  }
  // Senkou Span B (shift 26 forward)
  for (size_t i = static_cast<size_t>(sPeriod - 1); i < n; ++i) {
    double hh = -1e300, ll = 1e300;
    for (int j = 0; j < sPeriod; ++j) {
      size_t idx = i - sPeriod + 1 + j;
      hh = std::max(hh, high[idx]); ll = std::min(ll, low[idx]);
    }
    size_t target = i + 26;
    if (target < n) res.senkouB[target] = (hh + ll) / 2.0;
  }
  // Chikou Span (shift 26 backward)
  for (size_t i = 26; i < n; ++i) res.chikou[i] = close[i - 26];
  return res;
}

} // namespace cfm
