// formula_engine.cpp — динамический движок формул ExprTk (без хардкода метрик).

// ─── MSVC RTTI fix ──────────────────────────────────────────────────────────
// ExprTk disables its internal RTTI when it sees that the compiler has RTTI
// turned off (checks _CPPRTTI). node-gyp's common.gypi adds /GR- on Windows,
// and even with /GR later in the command line MSVC does not always set
// _CPPRTTI at preprocess time. Force it so ExprTk's dynamic_cast-based
// expression-node dispatch is available at runtime.
#if defined(_MSC_VER) && !defined(_CPPRTTI)
  #define _CPPRTTI 1
#endif
// ────────────────────────────────────────────────────────────────────────────


// formula_engine.cpp — динамический движок формул ExprTk (без хардкода метрик).
#include "formula_engine.hpp"
#include "exprtk.hpp"
#include <stdexcept>
#include <string>
#include <limits>
#include <exception>
#include <cstdint>

#ifdef _WIN32
  #include <process.h>
  #include <windows.h>
#else
  #include <pthread.h>
#endif

namespace cfm {

ReturnType parseReturnType(const std::string& rt, const std::string& formula) {
  if (rt == "number") return ReturnType::Number;
  if (rt == "boolean") return ReturnType::Boolean;
  if (rt == "array") return ReturnType::Array;
  auto hasCmp = formula.find_first_of("<>=") != std::string::npos;
  auto hasLogic = (formula.find("&&") != std::string::npos) ||
                  (formula.find("||") != std::string::npos) ||
                  (formula.find("!")  != std::string::npos);
  return (hasCmp || hasLogic) ? ReturnType::Boolean : ReturnType::Number;
}

// ---------------------------------------------------------------------------
// Internal: actual ExprTk parse + evaluate. Runs on a large-stack thread.
// ---------------------------------------------------------------------------
static EvalResult evaluateFormulaImpl(const std::string& formula,
                                      const EvalInput& in,
                                      ReturnType rt) {
  using T = double;
  exprtk::symbol_table<T>   s;
  exprtk::expression<T>     e;
  exprtk::parser<T>         parser;

  // Динамическая регистрация переменных: JS передаёт список, C++ не хардкодит
  std::vector<T> values(in.variables.size(), 0.0);
  std::vector<T*> valuePtrs; valuePtrs.reserve(in.variables.size());
  for (size_t i = 0; i < in.variables.size(); ++i) {
    s.add_variable(in.variables[i], values[i]);
    valuePtrs.push_back(&values[i]);
  }
  s.add_constants();
  e.register_symbol_table(s);   // register BEFORE compile
  if (!parser.compile(formula, e)) {
    std::string err = "ExprTk parse error: ";
    if (parser.error_count() > 0) {
      auto er = parser.get_error(0);
      err += er.diagnostic.empty() ? "invalid expression" : er.diagnostic;
    } else {
      err += "invalid expression";
    }
    throw std::invalid_argument(err);
  }

  EvalResult out;
  out.type = rt;
  if (rt == ReturnType::Boolean) {
    out.booleans.assign(in.candleCount, 0);
    for (size_t i = 0; i < in.candleCount; ++i) {
      for (size_t v = 0; v < in.variables.size(); ++v)
        *valuePtrs[v] = in.columns[v][i];
      out.booleans[i] = e.value() != 0.0 ? 1 : 0;
    }
  } else {
    out.numbers.assign(in.candleCount, std::numeric_limits<double>::quiet_NaN());
    for (size_t i = 0; i < in.candleCount; ++i) {
      for (size_t v = 0; v < in.variables.size(); ++v)
        *valuePtrs[v] = in.columns[v][i];
      out.numbers[i] = e.value();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Thread wrapper: ExprTk parser needs stack > V8 main-thread limit.
// Runs evaluateFormulaImpl on a thread with 16 MB stack.
// ---------------------------------------------------------------------------
static constexpr size_t CFM_STACK_SIZE = 16 * 1024 * 1024;

struct ThreadCtx {
  EvalInput    input;
  std::string  formula;
  ReturnType   rt;
  EvalResult   result;
  std::exception_ptr ex;
};

#ifdef _WIN32
static unsigned __stdcall exprTkThreadFn(void* arg) {
#else
static void* exprTkThreadFn(void* arg) {
#endif
  ThreadCtx* ctx = static_cast<ThreadCtx*>(arg);
  try {
    ctx->result = evaluateFormulaImpl(ctx->formula, ctx->input, ctx->rt);
  } catch (...) {
    ctx->ex = std::current_exception();
  }
#ifdef _WIN32
  return 0;
#else
  return nullptr;
#endif
}

static EvalResult runExprTk(const std::string& formula, const EvalInput& in, ReturnType rt) {
  ThreadCtx ctx;
  ctx.formula = formula;
  ctx.input = in;
  ctx.rt = rt;

#ifdef _WIN32
  uintptr_t handle = _beginthreadex(nullptr, CFM_STACK_SIZE, exprTkThreadFn, &ctx, 0, nullptr);
  if (handle == 0) throw std::runtime_error("_beginthreadex failed");
  WaitForSingleObject((HANDLE)handle, INFINITE);
  CloseHandle((HANDLE)handle);
#else
  pthread_t thread;
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, CFM_STACK_SIZE);
  if (pthread_create(&thread, &attr, exprTkThreadFn, &ctx) != 0) {
    pthread_attr_destroy(&attr);
    throw std::runtime_error("pthread_create failed");
  }
  pthread_attr_destroy(&attr);
  pthread_join(thread, nullptr);
#endif

  if (ctx.ex) std::rethrow_exception(ctx.ex);
  return ctx.result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
EvalResult evaluateFormula(const std::string& formula, const EvalInput& in, ReturnType rt) {
  if (formula.empty())
    throw std::invalid_argument("formula must not be empty");
  if (in.variables.empty() || in.columns.empty())
    throw std::invalid_argument("variables/columns must not be empty");
  if (in.variables.size() != in.columns.size())
    throw std::invalid_argument("variables and columns must have equal length");
  if (in.candleCount == 0)
    throw std::invalid_argument("candleCount must be > 0");
  for (const auto* c : in.columns)
    if (c == nullptr) throw std::invalid_argument("column pointer is null");

  return runExprTk(formula, in, rt);
}

} // namespace cfm
