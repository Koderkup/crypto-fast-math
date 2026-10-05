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

} // namespace cfm
