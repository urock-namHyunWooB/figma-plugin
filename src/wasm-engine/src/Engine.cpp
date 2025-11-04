#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <nlohmann/json.hpp>

#include "generaters/react/ReactGenerater.cpp"

using namespace emscripten;

enum class CodeType { React };

class Engine {
 private:
  nlohmann::json componentSpecs = nlohmann::json::array();

 public:
  void setComponentSpec(val jsObject) {
    // JavaScript 객체를 JSON 문자열로 변환 후 파싱
    std::string jsonStr =
        val::global("JSON").call<std::string>("stringify", jsObject);
    nlohmann::json spec = nlohmann::json::parse(jsonStr);
    this->componentSpecs.push_back(spec);
  }

 public:
  void init() {}

 public:
  val generateCode(CodeType type, std::string path) {
    if (componentSpecs.empty() || componentSpecs.is_null()) {
      throw std::runtime_error("componentSpecs가 없습니다.");
    }

    if (type == CodeType::React) {
      ReactGenerater reactGenerater;

      std::string code = reactGenerater.generateReactCode(componentSpecs);

      val result = val::object();

      result.set("code", code);
      return result;
    }

    return val::object();
  }
};

// Emscripten 바인딩
EMSCRIPTEN_BINDINGS(engine_module) {
  enum_<CodeType>("CodeType").value("React", CodeType::React);

  class_<Engine>("Engine")
      .constructor<>()
      .function("setComponentSpec", &Engine::setComponentSpec)
      .function("init", &Engine::init)
      .function("generateCode", &Engine::generateCode);
}
