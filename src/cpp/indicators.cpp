// indicators.cpp — чистые C++ реализации торговых индикаторов.
#include "indicators.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>
#include <limits>
#include <cstdint>
#include <deque>

namespace cfm {

static constexpr double NAN_D = std::numeric_limits<double>::quiet_NaN();

// ---------------------------------------------------------------------------
// O(n) sliding-window max/min via monotonic deque (single pass, no inner loop).
// Output is NaN for indices < period-1, matching the window-indicator convention.
// ---------------------------------------------------------------------------
static std::vector<double> rollingMax(const double* v, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  std::deque<size_t> dq;
  for (size_t i = 0; i < n; ++i) {
    if (!dq.empty() && dq.front() <= i - static_cast<size_t>(period)) dq.pop_front();
    while (!dq.empty() && v[dq.back()] <= v[i]) dq.pop_back();
    dq.push_back(i);
    if (i >= static_cast<size_t>(period - 1)) out[i] = v[dq.front()];
  }
  return out;
}

static std::vector<double> rollingMin(const double* v, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0 || n < static_cast<size_t>(period)) return out;
  std::deque<size_t> dq;
  for (size_t i = 0; i < n; ++i) {
    if (!dq.empty() && dq.front() <= i - static_cast<size_t>(period)) dq.pop_front();
    while (!dq.empty() && v[dq.back()] >= v[i]) dq.pop_back();
    dq.push_back(i);
    if (i >= static_cast<size_t>(period - 1)) out[i] = v[dq.front()];
  }
  return out;
}

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
  const size_t start = static_cast<size_t>(slowPeriod) - 1; // first valid macd value
  for (size_t i = start; i < n; ++i) res.macd[i] = fast[i] - slow[i];

  // Signal line = EMA(signalPeriod) of the macd line.
  //
  // The macd line has a leading NaN warm-up (indices < start), so seeding the
  // EMA with the first `signalPeriod` raw values poisons the recursion: a
  // single NaN seed makes every subsequent value NaN forever. That bug made
  // `signal` and `histogram` all-NaN for the default (12,26,9) parameters.
  // Fix: seed with the SMA of the first `signalPeriod` *valid* macd values —
  // the convention used by TA-Lib. First signal value lands at index
  // start + signalPeriod - 1 (= 33 for 12/26/9), NaN before that.
  if (n > start) {
    const size_t seedEnd = start + static_cast<size_t>(signalPeriod); // exclusive
    if (seedEnd <= n) {
      double sum = 0.0;
      for (size_t i = start; i < seedEnd; ++i) sum += res.macd[i];
      double prev = sum / static_cast<double>(signalPeriod);
      res.signal[seedEnd - 1] = prev;
      const double alpha = 2.0 / (static_cast<double>(signalPeriod) + 1.0);
      for (size_t i = seedEnd; i < n; ++i) {
        prev = alpha * res.macd[i] + (1.0 - alpha) * prev;
        res.signal[i] = prev;
      }
    }
  }
  for (size_t i = 0; i < n; ++i) {
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
  if (n < static_cast<size_t>(period)) return res;
  // O(n) rolling sum and sum-of-squares → population stddev.
  // var = E[X²] − E[X]², guarded against rounding (var < 0 → 0).
  // Matches the two-pass stddev_window() within float tolerance.
  double sum = 0.0, sumSq = 0.0;
  for (size_t i = 0; i < n; ++i) {
    sum += p[i];
    sumSq += p[i] * p[i];
    if (static_cast<int>(i) >= period) {
      const double drop = p[i - period];
      sum -= drop;
      sumSq -= drop * drop;
    }
    if (static_cast<int>(i) >= period - 1) {
      const double mean = sum / static_cast<double>(period);
      double var = sumSq / static_cast<double>(period) - mean * mean;
      if (var < 0.0) var = 0.0;
      const double sd = std::sqrt(var);
      res.middle[i] = mean;
      res.upper[i]  = mean + stdDev * sd;
      res.lower[i]  = mean - stdDev * sd;
    }
  }
  return res;
}

std::vector<double> volatility(const double* p, size_t n, int period) {
  std::vector<double> out(n, NAN_D);
  if (period <= 0) throw std::invalid_argument("period must be > 0");

  // Для выхода i окно — возвраты r(idx) = (p[idx]-p[idx-1])/p[idx-1]
  // с idx ∈ [max(1, i-period+1), i-1] (idx==0 исключён: нет предыдущей цены).
  // Бегущие суммы: каждое значение добавляется/вычитается ровно один раз → O(n)
  // вместо пересчёта всего окна на каждом шаге (и без аллокации в цикле).
  double sum = 0.0, sumSq = 0.0;
  int64_t count = 0;   // конечных возвратов в окне
  int64_t bad = 0;     // не-конечных (NaN/Inf) возвратов в окне
  const int64_t len = static_cast<int64_t>(n);

  auto addReturn = [&](int64_t idx) {
    if (idx < 1 || idx >= len) return;
    const double prev = p[idx - 1];
    const double r = (prev == 0.0) ? 0.0 : (p[idx] - prev) / prev;
    if (!std::isfinite(r)) { ++bad; return; }
    sum += r; sumSq += r * r; ++count;
  };
  auto removeReturn = [&](int64_t idx) {
    if (idx < 1 || idx >= len) return;
    const double prev = p[idx - 1];
    const double r = (prev == 0.0) ? 0.0 : (p[idx] - prev) / prev;
    if (!std::isfinite(r)) { --bad; return; }
    sum -= r; sumSq -= r * r; --count;
  };

  // Первое окно (i = period-1): idx ∈ [1, period-2].
  int64_t lo = 1;
  int64_t hi = static_cast<int64_t>(period) - 2;
  for (int64_t idx = lo; idx <= hi; ++idx) addReturn(idx);

  for (int64_t i = static_cast<int64_t>(period) - 1; i < len; ++i) {
    if (count > 0 && bad == 0) {
      const double mean = sum / static_cast<double>(count);
      double var = sumSq / static_cast<double>(count) - mean * mean;
      if (var < 0.0) var = 0.0; // защита от вычитания погрешности
      out[i] = std::sqrt(var);
    }
    // Окно для i+1: [max(1, i+2-period), i] — выходим из окна старое левое,
    // входит новое правое значение.
    int64_t nextLo = i + 2 - static_cast<int64_t>(period);
    if (nextLo < 1) nextLo = 1;
    const int64_t nextHi = i;
    for (int64_t idx = lo; idx < nextLo; ++idx) removeReturn(idx);
    for (int64_t idx = hi + 1; idx <= nextHi; ++idx) addReturn(idx);
    lo = nextLo; hi = nextHi;
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
    out[i] = (emaUp && histUp) ? 1 : 0;
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
    out[i] = (emaDown && histDown) ? 1 : 0;
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
  auto hh = rollingMax(high, n, kPeriod);
  auto ll = rollingMin(low, n, kPeriod);
  for (size_t i = static_cast<size_t>(kPeriod - 1); i < n; ++i) {
    double range = hh[i] - ll[i];
    res.k[i] = range == 0.0 ? 0.0 : (close[i] - ll[i]) / range * 100.0;
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
  const double k = static_cast<double>(period);
  const double denom = k * (k + 1.0) / 2.0;
  // O(n) incremental WMA: rolling window sum + weighted numerator.
  // num[i] = num[i-1] + period*p[i] - windowSum[i-1]
  // where windowSum = sum of prices in the window (updated incrementally).
  double windowSum = 0.0;
  double num = 0.0;
  for (int j = 0; j < period; ++j) {
    windowSum += p[j];
    num += p[j] * static_cast<double>(j + 1);
  }
  out[period - 1] = num / denom;
  for (size_t i = static_cast<size_t>(period); i < n; ++i) {
    num += k * p[i] - windowSum;
    windowSum += p[i] - p[i - period];
    out[i] = num / denom;
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
  auto hh = rollingMax(high, n, period);
  auto ll = rollingMin(low, n, period);
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    double range = hh[i] - ll[i];
    out[i] = range == 0.0 ? 0.0 : (hh[i] - close[i]) / range * 100.0;
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
  auto hh = rollingMax(high, n, period);
  auto ll = rollingMin(low, n, period);
  for (size_t i = static_cast<size_t>(period - 1); i < n; ++i) {
    res.upper[i] = hh[i];
    res.lower[i] = ll[i];
    res.middle[i] = (hh[i] + ll[i]) / 2.0;
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
  // Tenkan-sen (9-period) — O(n) rolling window
  auto tenkanHH = rollingMax(high, n, tPeriod);
  auto tenkanLL = rollingMin(low, n, tPeriod);
  for (size_t i = static_cast<size_t>(tPeriod - 1); i < n; ++i)
    res.tenkan[i] = (tenkanHH[i] + tenkanLL[i]) / 2.0;
  // Kijun-sen (26-period)
  auto kijunHH = rollingMax(high, n, kPeriod);
  auto kijunLL = rollingMin(low, n, kPeriod);
  for (size_t i = static_cast<size_t>(kPeriod - 1); i < n; ++i)
    res.kijun[i] = (kijunHH[i] + kijunLL[i]) / 2.0;
  // Senkou Span A (shift 26 forward)
  for (size_t i = 25; i < n; ++i) {
    size_t target = i + 26;
    if (target < n && !std::isnan(res.tenkan[i]) && !std::isnan(res.kijun[i]))
      res.senkouA[target] = (res.tenkan[i] + res.kijun[i]) / 2.0;
  }
  // Senkou Span B (shift 26 forward, 52-period window)
  auto senkouBHH = rollingMax(high, n, sPeriod);
  auto senkouBLL = rollingMin(low, n, sPeriod);
  for (size_t i = static_cast<size_t>(sPeriod - 1); i < n; ++i) {
    size_t target = i + 26;
    if (target < n) res.senkouB[target] = (senkouBHH[i] + senkouBLL[i]) / 2.0;
  }
  // Chikou Span (shift 26 backward)
  for (size_t i = 26; i < n; ++i) res.chikou[i] = close[i - 26];
  return res;
}

} // namespace cfm

// ===========================================================================
// Batch computation
// ===========================================================================

namespace cfm {

void computeBatch(const BatchInput& in, BatchOutput& out,
                  int smaPeriod, int emaPeriod, int rsiPeriod,
                  int wmaPeriod, int hmaPeriod, int volatilityPeriod,
                  int momentumPeriod, int rocPeriod,
                  int obvEnabled, int cciPeriod, int williamsRPeriod,
                  int atrPeriod,
                  int macdFast, int macdSlow, int macdSignal,
                  int bollingerPeriod, double bollingerStdDev,
                  int stochasticK, int stochasticD,
                  int adxPeriod,
                  int keltnerPeriod, double keltnerMult,
                  int donchianPeriod,
                  int ichimokuEnabled,
                  int parabolicSAREnabled, double psarStep, double psarMaxStep) {
  const size_t n = in.n;
  if (n == 0) return;

  const double* prices = in.prices ? in.prices : in.close;
  const double* high = in.high ? in.high : prices;
  const double* low = in.low ? in.low : prices;
  const double* close = in.close ? in.close : prices;
  const double* volume = in.volume;

  // Single-output indicators — only allocate if requested
  if (smaPeriod > 0) out.sma = sma(prices, n, smaPeriod);
  if (emaPeriod > 0) out.ema = ema(prices, n, emaPeriod);
  if (rsiPeriod > 0) out.rsi = rsi(prices, n, rsiPeriod);
  if (wmaPeriod > 0) out.wma = wma(prices, n, wmaPeriod);
  if (hmaPeriod > 0) out.hma = hma(prices, n, hmaPeriod);
  if (volatilityPeriod > 0) out.volatility = volatility(prices, n, volatilityPeriod);
  if (momentumPeriod > 0) out.momentum = momentum(prices, n, momentumPeriod);
  if (rocPeriod > 0) out.roc = roc(prices, n, rocPeriod);
  if (cciPeriod > 0 && high && low && close) out.cci = cci(high, low, close, n, cciPeriod);
  if (williamsRPeriod > 0 && high && low && close) out.williamsR = williamsR(high, low, close, n, williamsRPeriod);
  if (atrPeriod > 0 && high && low && close) out.atr = atr(high, low, close, n, atrPeriod);
  if (bollingerPeriod > 0) out.bollinger = bollinger(prices, n, bollingerPeriod, bollingerStdDev);
  if (stochasticK > 0 && stochasticD > 0 && high && low && close) out.stochastic = stochastic(high, low, close, n, stochasticK, stochasticD);
  if (adxPeriod > 0 && high && low && close) out.adx = adx(high, low, close, n, adxPeriod);
  if (keltnerPeriod > 0 && high && low && close) out.keltner = keltner(high, low, close, n, keltnerPeriod, keltnerMult);
  if (donchianPeriod > 0 && high && low) out.donchian = donchian(high, low, n, donchianPeriod);
  if (ichimokuEnabled && high && low && close) out.ichimoku = ichimoku(high, low, close, n);
  if (macdFast > 0 && macdSlow > 0 && macdSignal > 0) out.macd = macd(prices, n, macdFast, macdSlow, macdSignal);

  // Conditional indicators that have explicit enable flags
  if (high && low) {
    out.medianPrice = medianPrice(high, low, n);
    out.typicalPrice = typicalPrice(high, low, close, n);
  }
  if (obvEnabled && close && volume) out.obv = obv(close, volume, n);
  if (high && low && close) {
    out.bullishImpulse = bullishImpulse(close, n);
    out.bearishImpulse = bearishImpulse(close, n);
  }
  if (high && low && close && volume) out.vwap = vwap(high, low, close, volume, n);
  if (parabolicSAREnabled && high && low) out.parabolicSAR = parabolicSAR(high, low, n, psarStep, psarMaxStep);
}

} // namespace cfm
