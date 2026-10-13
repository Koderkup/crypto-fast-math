#pragma once
#include <cstddef>
#include <string>
#include <cstdint>
#include <vector>


namespace cfm {

enum class ReturnType {
  Number,   // number[] (по одному результату на свечу)
  Boolean,  // boolean[]
  Array     // number[] (семантически массив, тоже числа на свещу)
};

/// Определяет тип возврата: "number", "boolean", "array" или "auto".
ReturnType parseReturnType(const std::string& rt, const std::string& formula);

struct EvalResult {
  std::vector<double> numbers;   // для Number / Array
  std::vector<uint8_t> booleans; // для Boolean
  ReturnType type = ReturnType::Number;
};

struct EvalInput {
  std::vector<std::string> variables;     // имена метрик (без хардкода)
  std::vector<const double*> columns;     // значения по свечам, выровнены с variables
  size_t candleCount = 0;
};

/// Разбор формулы ExprTk один раз, динамическая регистрация переменных,
/// затем подстановка значений по свечам. Выбрасывает std::invalid_argument
/// при ошибке парсинга/аргументов.
EvalResult evaluateFormula(const std::string& formula, const EvalInput& in, ReturnType rt);

// ─── Prepared Formula API: parse-once / eval-many ───────────────────────────
// Parses & compiles the formula on a large-stack thread (ExprTk recursive
// descent needs > V8 main-thread stack) and caches the compiled expression tree
// + symbol table in a global registry keyed by an opaque handle. Evaluate is
// then O(n) per candle with *no* thread spawn and *no* re-parse, protected by
// a mutex so the same prepared formula can be evaluated from multiple threads
// (e.g. libuv async workers) safely.
//
// Design notes (thread safety):
//   The compiled ExprTk expression references variable T* pointers held in the
//   symbol table's storage (`values_`). Multiple concurrent evaluates would
//   race on shared storage, so `evaluate` takes `mtx_` serializing the
//   value-swapping + evaluation. Because JS is single-threaded on the main
//   thread and evaluates are O(n) and fast, hold time is negligible; the async
//   path gets correctness without unbounded concurrency (which would risk
//   data races on the shared expression tree internals anyway).
//
// Handle lifetime: handles are process-global ints owned by a registry map.
// They are never recycled during a process, so a stale handle lookup is the
// only failure mode (returns false from evaluatePrepared).
using FormulaHandle = int32_t;

/// Parse + compile `formula` once. Returns a handle. Throws std::invalid_argument
/// on parse error or bad arguments.
FormulaHandle prepareFormula(const std::string& formula, const std::vector<std::string>& variables, ReturnType rt);

/// Evaluate a previously-prepared formula. Returns false if `handle` is unknown.
bool evaluatePrepared(FormulaHandle handle, const EvalInput& in, EvalResult& out);

} // namespace cfm
