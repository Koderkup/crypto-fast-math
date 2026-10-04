// addon.cpp — Node-API (node-addon-api) bridge: sync + async wrappers.
// C++ ядро общается с TS через этот файл. Формулы парсятся один раз,
// переменные регистрируются динамически (без хардкода метрик).
#include <napi.h>
#include <vector>
#include <string>
#include <cstring>
#include <utility>
#include <stdexcept>
#include <limits>
#include "indicators.hpp"
#include "formula_engine.hpp"
#include "exprtk.hpp"

static constexpr double NAN_D = std::numeric_limits<double>::quiet_NaN();

// ===========================================================================
// Утилиты для преобразования JS-массивов чисел -> double*
// ===========================================================================

/// Считывает Double-массив из JS-значения (TypedArray / Array / number[]).
/// Возвращает nullptr + выбрасывает Napi::Error при ошибке формата.
struct Arr {
  std::vector<double> data;
  const double* ptr() const { return data.data(); }
    size_t size() const { return data.size(); }
};

static Arr readArray(const Napi::Value& v, const char* argName);

static Arr readArray(const Napi::Value& v, const char* argName) {
  Arr out;
  if (v.IsNumber()) {
    // скаляр → одноэлементный массив (удобно для kellyCriterion и пр.)
    out.data.push_back(v.As<Napi::Number>().DoubleValue());
    return out;
  }
  if (v.IsArray()) {
    auto arr = v.As<Napi::Array>();
    out.data.reserve(arr.Length());
    for (size_t i = 0; i < arr.Length(); ++i) {
      Napi::Value item = arr.Get(i);
      if (item.IsNumber()) { out.data.push_back(item.As<Napi::Number>().DoubleValue()); continue; }
      if (item.IsNull() || item.IsUndefined()) { out.data.push_back(NAN_D); continue; }
      Napi::TypeError::New(arr.Get(i).Env(),
        std::string("Array '") + argName + "' must contain only numbers or null").ThrowAsJavaScriptException();
      return out;
    }
    return out;
  }
  if (v.IsTypedArray()) {
    auto ta = v.As<Napi::TypedArray>();
    napi_typedarray_type t = ta.TypedArrayType();
    if (t != napi_float64_array && t != napi_float32_array &&
        t != napi_int32_array && t != napi_uint32_array &&
        t != napi_int16_array && t != napi_uint16_array &&
        t != napi_uint8_array && t != napi_int8_array) {
      Napi::TypeError::New(v.Env(),
        std::string("TypedArray '") + argName + "' must be numeric").ThrowAsJavaScriptException();
      return out;
    }
    size_t len = ta.ElementLength();
    out.data.reserve(len);
    double buf_val;
    napi_env env = v.Env();
    void* data; size_t ofs; napi_value buf; napi_typedarray_type tt;
    napi_get_typedarray_info(env, ta, &tt, &len, &data, &buf, &ofs);
    const uint8_t* base = static_cast<const uint8_t*>(data) + ofs;
    auto to_double = [&](size_t i)->double {
      switch (tt) {
        case napi_float64_array: return *reinterpret_cast<const double*>(base + i*8);
        case napi_float32_array: return static_cast<double>(*reinterpret_cast<const float*>(base + i*4));
        case napi_int32_array:   return static_cast<double>(*reinterpret_cast<const int32_t*>(base + i*4));
        case napi_uint32_array:  return static_cast<double>(*reinterpret_cast<const uint32_t*>(base + i*4));
        case napi_int16_array:   return static_cast<double>(*reinterpret_cast<const int16_t*>(base + i*2));
        case napi_uint16_array:  return static_cast<double>(*reinterpret_cast<const uint16_t*>(base + i*2));
        case napi_int8_array:    return static_cast<double>(static_cast<int8_t>(base[i]));
        case napi_uint8_array:   return static_cast<double>(base[i]);
        default: return NAN_D;
      }
    };
    for (size_t i = 0; i < len; ++i) out.data.push_back(to_double(i));
    return out;
  }
  Napi::TypeError::New(v.Env(),
    std::string("Expected '") + argName + "' to be a number or array of numbers")
      .ThrowAsJavaScriptException();
  return out;
}

/// Возвращает std::vector<double> из Napi::Array (числа и null→NaN).
static std::vector<double> vecFromArray(const Napi::Value& v, const char* name) {
  Arr a = readArray(v, name);
  if (v.Env().IsExceptionPending()) return {};
  return std::move(a.data);
}

/// Преобразует std::vector<double> в Napi::Array (NaN → null для JSON-читаемости).
static Napi::Array toArray(Napi::Env env, const std::vector<double>& v) {
  auto out = Napi::Array::New(env, v.size());
  for (size_t i = 0; i < v.size(); ++i)
    out[i] = Napi::Number::New(env, v[i]);
  return out;
}

/// Преобразует std::vector<uint8_t> в Napi::Uint8Array.
static Napi::Uint8Array toUint8(Napi::Env env, const std::vector<uint8_t>& v) {
  auto out = Napi::Uint8Array::New(env, v.size());
  if (!v.empty()) std::memcpy(out.Data(), v.data(), v.size());
  return out;
}

// ===========================================================================
// SYNC: SMA
// ===========================================================================
static Napi::Value smaSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "smaSync(prices, period): expected 2 arguments").ThrowAsJavaScriptException();
    return env.Null();
  }
  Arr prices = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int period = info[1].As<Napi::Number>().Int32Value();
  try {
    auto res = cfm::sma(prices.ptr(), prices.size(), period);
    return toArray(env, res);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// ===========================================================================
// SYNC: остальные индикаторы
// ===========================================================================
static Napi::Value emaSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int period = info[1].As<Napi::Number>().Int32Value();
  return toArray(env, cfm::ema(p.ptr(), p.size(), period));
}

static Napi::Value rsiSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int period = info[1].As<Napi::Number>().Int32Value();
  return toArray(env, cfm::rsi(p.ptr(), p.size(), period));
}

static Napi::Value volatilitySync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int period = info[1].As<Napi::Number>().Int32Value();
  return toArray(env, cfm::volatility(p.ptr(), p.size(), period));
}

static Napi::Value medianPriceSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr hi = readArray(info[0], "high");
  if (env.IsExceptionPending()) return env.Null();
  Arr lo = readArray(info[1], "low");
  if (env.IsExceptionPending()) return env.Null();
  if (hi.size() != lo.size()) {
    Napi::TypeError::New(env, "high and low must have equal length").ThrowAsJavaScriptException();
    return env.Null();
  }
  return toArray(env, cfm::medianPrice(hi.ptr(), lo.ptr(), hi.size()));
}

static Napi::Value typicalPriceSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr hi = readArray(info[0], "high");
  if (env.IsExceptionPending()) return env.Null();
  Arr lo = readArray(info[1], "low");
  if (env.IsExceptionPending()) return env.Null();
  Arr cl = readArray(info[2], "close");
  if (env.IsExceptionPending()) return env.Null();
  if (hi.size() != lo.size() || lo.size() != cl.size()) {
    Napi::TypeError::New(env, "high/low/close must have equal length").ThrowAsJavaScriptException();
    return env.Null();
  }
  return toArray(env, cfm::typicalPrice(hi.ptr(), lo.ptr(), cl.ptr(), hi.size()));
}

static Napi::Value kellySync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  double wr = info[0].As<Napi::Number>().DoubleValue();
  double wa = info[1].As<Napi::Number>().DoubleValue();
  double la = info[2].As<Napi::Number>().DoubleValue();
  try {
    return Napi::Number::New(env, cfm::kellyCriterion(wr, wa, la));
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

static Napi::Value macdSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int fp = info[1].As<Napi::Number>().Int32Value();
  int sp = info[2].As<Napi::Number>().Int32Value();
  int sig = info[3].As<Napi::Number>().Int32Value();
  try {
    auto r = cfm::macd(p.ptr(), p.size(), fp, sp, sig);
    auto obj = Napi::Object::New(env);
    obj.Set("macd", toArray(env, r.macd));
    obj.Set("signal", toArray(env, r.signal));
    obj.Set("histogram", toArray(env, r.histogram));
    return obj;
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

static Napi::Value bollingerSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  int period = info[1].As<Napi::Number>().Int32Value();
  double sd = 2.0;
  if (info.Length() > 2 && !info[2].IsUndefined()) sd = info[2].As<Napi::Number>().DoubleValue();
  try {
    auto r = cfm::bollinger(p.ptr(), p.size(), period, sd);
    auto obj = Napi::Object::New(env);
    obj.Set("upper", toArray(env, r.upper));
    obj.Set("middle", toArray(env, r.middle));
    obj.Set("lower", toArray(env, r.lower));
    return obj;
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

static Napi::Value bullishSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  return toUint8(env, cfm::bullishImpulse(p.ptr(), p.size()));
}

static Napi::Value bearishSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Arr p = readArray(info[0], "prices");
  if (env.IsExceptionPending()) return env.Null();
  return toUint8(env, cfm::bearishImpulse(p.ptr(), p.size()));
}

// ===========================================================================
// ASYNC: Napi::AsyncWorker + Promise
// ===========================================================================
// Асинхронный воркер: тяжёлый C++ код работает в отдельном потоке,
// основной поток Node.js не блокируется. Результат доставляется через Promise.

struct WorkerInput {
  std::vector<double> prices;   // для однопоточных индикаторов
  std::vector<double> high, low, close; // для medianPrice / typicalPrice
  int ints[4] = {0,0,0,0};      // period / fast / slow / signal
  double doubles[2] = {0.0,0.0}; // stdDev
  std::string formula;
  std::string returnType;
  std::vector<std::string> varNames;
  std::vector<std::vector<double>> varColumns;
  double winRate = 0, winAvg = 0, lossAvg = 0;
  enum class Kind {
    SMA, EMA, RSI, Volatility, MedianPrice, TypicalPrice,
    Kelly, Macd, Bollinger, Bullish, Bearish, CustomFormula
  } kind = Kind::SMA;
};

enum class OutKind { Array, Object, Number, Uint8 };
enum class RetKind { Number, Boolean, Array };

struct WorkerOutput {
  OutKind outKind = OutKind::Array;
  std::vector<double> doubles;
  std::vector<double> arr2, arr3, arr4;   // signal/mid  hist/lower
  std::vector<uint8_t> booleans;
  double number = 0.0;
  RetKind retKind = RetKind::Number;
};

/// Generic AsyncWorker: тяжёлый C++ в фоне, Promise как транспорт результата.
class GenericWorker : public Napi::AsyncWorker {
public:
  GenericWorker(const Napi::Promise::Deferred& deferred, WorkerInput&& in)
    : Napi::AsyncWorker(deferred.Env(), "crypto-fast-math"),
      deferred_(deferred), input_(std::move(in)) {}

  void Execute() override {
    try { run(); }
    catch (const std::exception& e) { SetError(e.what()); }
  }

      void OnOK() override {
    Napi::HandleScope scope(Env());
    deferred_.Resolve(makeResult());
    // base class OnWorkComplete calls Destroy() after this returns → no delete here
  }
  void OnError(const Napi::Error& e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
    // base class OnWorkComplete calls Destroy() after this returns → no delete here
  }

private:
  Napi::Promise::Deferred deferred_;
  WorkerInput input_;
  WorkerOutput output_;
    void run();
  Napi::Value makeResult();
};

void GenericWorker::run() {
  const double* p = input_.prices.data();
  size_t n = input_.prices.size();
  switch (input_.kind) {
    case WorkerInput::Kind::SMA:
      output_.doubles = cfm::sma(p, n, input_.ints[0]); break;
    case WorkerInput::Kind::EMA:
      output_.doubles = cfm::ema(p, n, input_.ints[0]); break;
    case WorkerInput::Kind::RSI:
      output_.doubles = cfm::rsi(p, n, input_.ints[0]); break;
    case WorkerInput::Kind::Volatility:
      output_.doubles = cfm::volatility(p, n, input_.ints[0]); break;
    case WorkerInput::Kind::MedianPrice:
      output_.doubles = cfm::medianPrice(input_.high.data(), input_.low.data(), input_.high.size()); break;
    case WorkerInput::Kind::TypicalPrice:
      output_.doubles = cfm::typicalPrice(input_.high.data(), input_.low.data(), input_.close.data(), input_.high.size()); break;
    case WorkerInput::Kind::Kelly:
      output_.outKind = OutKind::Number;
      output_.number = cfm::kellyCriterion(input_.winRate, input_.winAvg, input_.lossAvg); break;
    case WorkerInput::Kind::Macd: {
      output_.outKind = OutKind::Object;
      auto r = cfm::macd(p, n, input_.ints[0], input_.ints[1], input_.ints[2]);
      output_.doubles = std::move(r.macd);
      output_.arr2 = std::move(r.signal);
      output_.arr3 = std::move(r.histogram);
      break;
    }
    case WorkerInput::Kind::Bollinger: {
      output_.outKind = OutKind::Object;
      auto r = cfm::bollinger(p, n, input_.ints[0], input_.doubles[0]);
      output_.doubles = std::move(r.upper);
      output_.arr2 = std::move(r.middle);
      output_.arr3 = std::move(r.lower);
      break;
    }
    case WorkerInput::Kind::Bullish:
      output_.outKind = OutKind::Uint8;
      output_.booleans = cfm::bullishImpulse(p, n); break;
    case WorkerInput::Kind::Bearish:
      output_.outKind = OutKind::Uint8;
      output_.booleans = cfm::bearishImpulse(p, n); break;
    case WorkerInput::Kind::CustomFormula: {
      cfm::EvalInput ein;
      ein.variables = input_.varNames;
      ein.candleCount = input_.varColumns.empty() ? 0 : input_.varColumns.front().size();
      for (auto& col : input_.varColumns)
        ein.columns.push_back(col.data());
      cfm::ReturnType rt = cfm::parseReturnType(input_.returnType, input_.formula);
      auto res = cfm::evaluateFormula(input_.formula, ein, rt);
      output_.retKind = (rt == cfm::ReturnType::Boolean) ? RetKind::Boolean : RetKind::Number;
      if (output_.retKind == RetKind::Boolean) {
        output_.outKind = OutKind::Uint8;
        output_.booleans = std::move(res.booleans);
      } else {
        output_.doubles = std::move(res.numbers);
      }
      break;
    }
  }
}

Napi::Value GenericWorker::makeResult() {
  Napi::Env env = Env();
  switch (output_.outKind) {
    case OutKind::Number:
      return Napi::Number::New(env, output_.number);
    case OutKind::Uint8:
      if (output_.retKind == RetKind::Boolean) {
        auto arr = Napi::Array::New(env, output_.booleans.size());
        for (size_t i = 0; i < output_.booleans.size(); ++i)
          arr[i] = Napi::Boolean::New(env, output_.booleans[i] != 0);
        return arr;
      }
      return toUint8(env, output_.booleans);
    case OutKind::Object: {
      auto obj = Napi::Object::New(env);
      switch (input_.kind) {
        case WorkerInput::Kind::Macd:
          obj.Set("macd", toArray(env, output_.doubles));
          obj.Set("signal", toArray(env, output_.arr2));
          obj.Set("histogram", toArray(env, output_.arr3)); break;
        case WorkerInput::Kind::Bollinger:
          obj.Set("upper", toArray(env, output_.doubles));
          obj.Set("middle", toArray(env, output_.arr2));
          obj.Set("lower", toArray(env, output_.arr3)); break;
        default: break;
      }
      return obj;
    }
        case OutKind::Array:
    default:
      return toArray(env, output_.doubles);
  }
}

// ===========================================================================
// ASYNC: helper + wrappers (each returns a Promise)
// ===========================================================================

/// Launches a GenericWorker on the libuv threadpool; returns a Promise (non-blocking).
static Napi::Value runAsync(const Napi::CallbackInfo& info, WorkerInput&& in) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);
  auto* w = new GenericWorker(deferred, std::move(in));
  w->Queue();
  return deferred.Promise();
}

static Napi::Value smaAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::SMA;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  return runAsync(info, std::move(in));
}

static Napi::Value emaAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::EMA;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  return runAsync(info, std::move(in));
}

static Napi::Value rsiAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::RSI;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  return runAsync(info, std::move(in));
}

static Napi::Value volatilityAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::Volatility;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  return runAsync(info, std::move(in));
}

static Napi::Value medianPriceAsync(const Napi::CallbackInfo& info) {
  Arr hi = readArray(info[0], "high");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  Arr lo = readArray(info[1], "low");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::MedianPrice;
  in.high = std::move(hi.data); in.low = std::move(lo.data);
  return runAsync(info, std::move(in));
}

static Napi::Value typicalPriceAsync(const Napi::CallbackInfo& info) {
  Arr hi = readArray(info[0], "high");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  Arr lo = readArray(info[1], "low");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  Arr cl = readArray(info[2], "close");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::TypicalPrice;
  in.high = std::move(hi.data); in.low = std::move(lo.data); in.close = std::move(cl.data);
  return runAsync(info, std::move(in));
}

static Napi::Value kellyAsync(const Napi::CallbackInfo& info) {
  WorkerInput in; in.kind = WorkerInput::Kind::Kelly;
  in.winRate = info[0].As<Napi::Number>().DoubleValue();
  in.winAvg  = info[1].As<Napi::Number>().DoubleValue();
  in.lossAvg = info[2].As<Napi::Number>().DoubleValue();
  return runAsync(info, std::move(in));
}

static Napi::Value macdAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::Macd;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  in.ints[1] = info[2].As<Napi::Number>().Int32Value();
  in.ints[2] = info[3].As<Napi::Number>().Int32Value();
  return runAsync(info, std::move(in));
}

static Napi::Value bollingerAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::Bollinger;
  in.prices = std::move(p.data);
  in.ints[0] = info[1].As<Napi::Number>().Int32Value();
  in.doubles[0] = (info.Length() > 2 && !info[2].IsUndefined()) ? info[2].As<Napi::Number>().DoubleValue() : 2.0;
  return runAsync(info, std::move(in));
}

static Napi::Value bullishAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::Bullish;
  in.prices = std::move(p.data);
  return runAsync(info, std::move(in));
}

static Napi::Value bearishAsync(const Napi::CallbackInfo& info) {
  Arr p = readArray(info[0], "prices");
  if (info.Env().IsExceptionPending()) return info.Env().Null();
  WorkerInput in; in.kind = WorkerInput::Kind::Bearish;
  in.prices = std::move(p.data);
  return runAsync(info, std::move(in));
}

// ===========================================================================
// CUSTOM FORMULA (calculate) — sync + async
// ===========================================================================

/// Builds a WorkerInput::CustomFormula from { formula, params, returnType }.
static WorkerInput buildFormulaInput(const Napi::Object& opts, bool& err) {
  Napi::Env env = opts.Env();
  err = false;
  WorkerInput in;
  in.kind = WorkerInput::Kind::CustomFormula;

  if (!opts.Has("formula") || !opts.Get("formula").IsString()) {
    Napi::TypeError::New(env, "options.formula (string) is required").ThrowAsJavaScriptException();
    err = true; return in;
  }
  in.formula = opts.Get("formula").As<Napi::String>().Utf8Value();
  if (opts.Has("returnType") && opts.Get("returnType").IsString())
    in.returnType = opts.Get("returnType").As<Napi::String>().Utf8Value();

  if (!opts.Has("params") || !opts.Get("params").IsObject()) {
    Napi::TypeError::New(env, "options.params (object) is required").ThrowAsJavaScriptException();
    err = true; return in;
  }
  auto params = opts.Get("params").As<Napi::Object>();
  auto keys = params.GetPropertyNames();
  for (size_t i = 0; i < keys.Length(); ++i) {
            std::string name = keys.Get(i).As<Napi::String>().Utf8Value();
    Napi::Value col = params.Get(name);
    Arr a = readArray(col, name.c_str());
    if (env.IsExceptionPending()) { err = true; return in; }
    in.varNames.push_back(name);
    in.varColumns.push_back(std::move(a.data));
  }
    return in;
}

/// calculate({ formula, params, returnType }) — sync.
static Napi::Value calculateSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "calculate({ formula, params, returnType }) expected").ThrowAsJavaScriptException();
    return env.Null();
  }
    bool err = false;
  WorkerInput in = buildFormulaInput(info[0].As<Napi::Object>(), err);
  if (err) return env.Null();
  if (in.varColumns.empty()) {
    Napi::TypeError::New(env, "params must have at least one column").ThrowAsJavaScriptException();
    return env.Null();
  }
  size_t cc = in.varColumns.front().size();
  for (size_t i = 1; i < in.varColumns.size(); ++i) {
    if (in.varColumns[i].size() != cc) {
      Napi::TypeError::New(env, "all param columns must have equal length").ThrowAsJavaScriptException();
      return env.Null();
    }
  }
  cfm::EvalInput ein;
  ein.variables = in.varNames;
  ein.candleCount = cc;
  for (auto& col : in.varColumns) ein.columns.push_back(col.data());
  try {
    cfm::ReturnType rt = cfm::parseReturnType(in.returnType, in.formula);
    auto res = cfm::evaluateFormula(in.formula, ein, rt);
    if (rt == cfm::ReturnType::Boolean) {
      auto arr = Napi::Array::New(env, res.booleans.size());
      for (size_t i = 0; i < res.booleans.size(); ++i)
        arr[i] = Napi::Boolean::New(env, res.booleans[i] != 0);
      return arr;
    }
    return toArray(env, res.numbers);
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

/// calculateAsync({ formula, params, returnType }) — async (Promise).
static Napi::Value calculateAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "calculateAsync({ formula, params, returnType }) expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  bool err = false;
  WorkerInput in = buildFormulaInput(info[0].As<Napi::Object>(), err);
  if (err) return env.Null();
  if (in.varColumns.empty()) {
    Napi::TypeError::New(env, "params must have at least one column").ThrowAsJavaScriptException();
    return env.Null();
  }
  size_t cc = in.varColumns.front().size();
  for (size_t i = 1; i < in.varColumns.size(); ++i) {
    if (in.varColumns[i].size() != cc) {
      Napi::TypeError::New(env, "all param columns must have equal length").ThrowAsJavaScriptException();
      return env.Null();
    }
  }
  return runAsync(info, std::move(in));
}











// ===========================================================================
// Module init — регистрируем sync и async версии всех методов.
// ===========================================================================


Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // sync (быстрые, для небольших массивов / скаляров)
  exports.Set("smaSync",            Napi::Function::New(env, smaSync, "sma"));
  exports.Set("emaSync",            Napi::Function::New(env, emaSync, "ema"));
  exports.Set("rsiSync",            Napi::Function::New(env, rsiSync, "rsi"));
  exports.Set("macdSync",           Napi::Function::New(env, macdSync, "macd"));
  exports.Set("bollingerSync",      Napi::Function::New(env, bollingerSync, "bollinger"));
  exports.Set("volatilitySync",     Napi::Function::New(env, volatilitySync, "volatility"));
  exports.Set("medianPriceSync",    Napi::Function::New(env, medianPriceSync, "medianPrice"));
  exports.Set("typicalPriceSync",   Napi::Function::New(env, typicalPriceSync, "typicalPrice"));
  exports.Set("kellyCriterionSync", Napi::Function::New(env, kellySync, "kellyCriterion"));
  exports.Set("bullishImpulseSync", Napi::Function::New(env, bullishSync, "bullishImpulse"));
  exports.Set("bearishImpulseSync", Napi::Function::New(env, bearishSync, "bearishImpulse"));
    exports.Set("calculateSync",      Napi::Function::New(env, calculateSync, "calculate"));





  // async (не блокируют event loop; возвращают Promise)
  exports.Set("sma",                Napi::Function::New(env, smaAsync, "sma"));
  exports.Set("ema",                Napi::Function::New(env, emaAsync, "ema"));
  exports.Set("rsi",                Napi::Function::New(env, rsiAsync, "rsi"));
  exports.Set("macd",               Napi::Function::New(env, macdAsync, "macd"));
  exports.Set("bollinger",          Napi::Function::New(env, bollingerAsync, "bollinger"));
  exports.Set("volatility",         Napi::Function::New(env, volatilityAsync, "volatility"));
  exports.Set("medianPrice",        Napi::Function::New(env, medianPriceAsync, "medianPrice"));
  exports.Set("typicalPrice",       Napi::Function::New(env, typicalPriceAsync, "typicalPrice"));
  exports.Set("kellyCriterion",     Napi::Function::New(env, kellyAsync, "kellyCriterion"));
  exports.Set("bullishImpulse",     Napi::Function::New(env, bullishAsync, "bullishImpulse"));
  exports.Set("bearishImpulse",     Napi::Function::New(env, bearishAsync, "bearishImpulse"));
  exports.Set("calculate",          Napi::Function::New(env, calculateAsync, "calculate"));

      return exports;
}

NODE_API_MODULE(addon, Init)

