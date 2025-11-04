#include <string>

#include <emscripten.h>
#include <nlohmann/json.hpp>

#include "../styles/InlineStyleGenerater.cpp"

class ReactGenerater {
 public:
  nlohmann::json generateReactElementTree(
      const nlohmann::json& componentSpecs) {
    nlohmann::json elementTree = nlohmann::json::array();

    return elementTree;
  }

 public:
  // JSON value를 JavaScript 코드로 변환
  std::string jsonValueToJsCode(const nlohmann::json& value) {
    if (value.is_string()) {
      return "\"" + value.get<std::string>() + "\"";
    } else if (value.is_number_integer()) {
      return std::to_string(value.get<int>());
    } else if (value.is_number_float()) {
      return std::to_string(value.get<double>());
    } else if (value.is_boolean()) {
      return value.get<bool>() ? "true" : "false";
    } else if (value.is_null()) {
      return "null";
    } else if (value.is_array() || value.is_object()) {
      return value.dump();
    }
    return "undefined";
  }

  // PropDefinition type을 TypeScript 타입으로 변환
  std::string mapPropTypeToTsType(const nlohmann::json& prop) {
    std::string type = prop["type"].get<std::string>();

    if (type == "string")
      return "string";
    if (type == "number")
      return "number";
    if (type == "boolean")
      return "boolean";
    if (type == "object")
      return "any";
    if (type == "array")
      return "any[]";
    if (type == "component")
      return "React.ReactNode";
    if (type == "function") {
      // function 타입: parameters와 returnType으로 함수 시그니처 생성
      std::string funcType = "(";

      if (prop.contains("parameters") && prop["parameters"].is_array()) {
        const auto& params = prop["parameters"];
        for (size_t i = 0; i < params.size(); i++) {
          if (params[i].contains("name") && params[i].contains("type")) {
            funcType += params[i]["name"].get<std::string>() + ": ";
            funcType += params[i]["type"].get<std::string>();
            if (i < params.size() - 1) {
              funcType += ", ";
            }
          }
        }
      }

      funcType += ") => ";

      if (prop.contains("returnType")) {
        funcType += prop["returnType"].get<std::string>();
      } else {
        funcType += "void";
      }

      return funcType;
    }

    return "any";
  }

  // Props Interface 생성
  std::string generatePropsInterface(const std::string& componentName,
                                     const nlohmann::json& propsDefinition) {
    if (propsDefinition.empty()) {
      return "";
    }

    std::string interfaceName = componentName + "Props";
    std::string result = "interface " + interfaceName + " {\n";

    for (const auto& prop : propsDefinition) {
      if (prop.contains("name")) {
        std::string propName = prop["name"].get<std::string>();
        std::string propType = mapPropTypeToTsType(prop);
        bool required =
            prop.contains("required") ? prop["required"].get<bool>() : true;

        result += "  " + propName;
        if (!required) {
          result += "?";
        }
        result += ": " + propType + ";\n";
      }
    }

    result += "}\n\n";
    return result;
  }

  // Props 파라미터 생성 (destructuring with default values and type annotation)
  std::string generatePropsParam(const std::string& componentName,
                                 const nlohmann::json& propsDefinition) {
    if (propsDefinition.empty()) {
      return "";
    }

    std::vector<std::string> propNamesForDestructuring;

    for (const auto& prop : propsDefinition) {
      if (prop.contains("name")) {
        std::string propName = prop["name"].get<std::string>();
        std::string destructuringProp = propName;

        // defaultValue가 있고 빈 문자열이 아니면 추가
        if (prop.contains("defaultValue") && !prop["defaultValue"].is_null()) {
          // 빈 문자열인 경우 제외
          if (!(prop["defaultValue"].is_string() &&
                prop["defaultValue"].get<std::string>().empty())) {
            destructuringProp +=
                " = " + jsonValueToJsCode(prop["defaultValue"]);
          }
        }

        propNamesForDestructuring.push_back(destructuringProp);
      }
    }

    if (propNamesForDestructuring.empty()) {
      return "";
    }

    std::string result = "{ ";
    for (size_t i = 0; i < propNamesForDestructuring.size(); i++) {
      result += propNamesForDestructuring[i];
      if (i < propNamesForDestructuring.size() - 1) {
        result += ", ";
      }
    }
    result += " }: " + componentName + "Props";

    return result;
  }

  // State 이름을 Setter 함수명으로 변환 (camelCase -> setCamelCase)
  std::string generateSetterName(const std::string& stateName) {
    if (stateName.empty()) {
      return "set";
    }

    // 첫 글자를 대문자로 변환
    std::string result = "set";
    result += static_cast<char>(std::toupper(stateName[0]));
    result += stateName.substr(1);

    return result;
  }

  // Internal States 생성 (useState hooks)
  std::string generateInternalStates(
      const nlohmann::json& internalStateDefinition) {
    if (internalStateDefinition.empty()) {
      return "";
    }

    std::string result = "";

    for (const auto& state : internalStateDefinition) {
      if (state.contains("name") && state.contains("initialValue")) {
        std::string stateName = state["name"].get<std::string>();
        std::string setterName = generateSetterName(stateName);
        std::string initialValue = jsonValueToJsCode(state["initialValue"]);

        result += "  const [" + stateName + ", " + setterName +
                  "] = useState(" + initialValue + ");\n";
      }
    }

    return result;
  }

  // 들여쓰기 생성 (2 spaces per level)
  std::string generateIndent(int level) { return std::string(level * 2, ' '); }

  // Figma type을 JSX 태그명으로 변환
  std::string getJSXTagName(const std::string& type) {
    if (type == "TEXT") {
      return "span";
    }
    // 나머지는 div로
    return "div";
  }

  // "prop:name" 또는 "state:name" 형태에서 실제 이름만 추출
  std::string extractBindingName(const std::string& bindingValue) {
    size_t colonPos = bindingValue.find(':');
    if (colonPos != std::string::npos && colonPos < bindingValue.length() - 1) {
      return bindingValue.substr(colonPos + 1);
    }
    return bindingValue;
  }

  // visibleExpression 파싱: "prop:title && state:isOpen" → "title && isOpen"
  std::string parseVisibleExpression(const std::string& expression) {
    std::string result = expression;

    // "prop:" 제거
    size_t pos = 0;
    while ((pos = result.find("prop:", pos)) != std::string::npos) {
      result.erase(pos, 5);  // "prop:" 길이는 5
    }

    // "state:" 제거
    pos = 0;
    while ((pos = result.find("state:", pos)) != std::string::npos) {
      result.erase(pos, 6);  // "state:" 길이는 6
    }

    return result;
  }

  // 단일 JSX 요소 생성 (재귀)
  std::string generateJSXElement(const nlohmann::json& element, int indentLevel,
                                 const nlohmann::json& elementBindings,
                                 InlineStyleGenerater& styleGen) {
    if (!element.contains("type") || !element.contains("id")) {
      return "";
    }

    std::string type = element["type"].get<std::string>();
    std::string elementId = element["id"].get<std::string>();

    // Visibility 확인
    std::string visibleMode = "always";
    std::string visibleExpression = "";

    if (elementBindings.contains(elementId)) {
      const auto& binding = elementBindings[elementId];
      if (binding.contains("visibleMode") &&
          binding["visibleMode"].is_string()) {
        visibleMode = binding["visibleMode"].get<std::string>();
      }
      if (binding.contains("visibleExpression") &&
          binding["visibleExpression"].is_string()) {
        visibleExpression = binding["visibleExpression"].get<std::string>();
      }
    }

    // visibleMode가 "hidden"이면 렌더링하지 않음
    if (visibleMode == "hidden") {
      return "";
    }

    std::string indent = generateIndent(indentLevel);
    std::string tagName = getJSXTagName(type);

    // 바인딩 정보 확인
    bool hasBinding =
        elementBindings.contains(elementId) &&
        elementBindings[elementId].contains("connectedPropName") &&
        !elementBindings[elementId]["connectedPropName"].is_null();

    std::string boundPropName = "";
    if (hasBinding) {
      std::string rawBinding =
          elementBindings[elementId]["connectedPropName"].get<std::string>();
      boundPropName = extractBindingName(rawBinding);
    }

    // 조건부 렌더링 시작 (visibleMode가 "expression"인 경우)
    std::string conditionalStart = "";
    std::string conditionalEnd = "";

    if (visibleMode == "expression" && !visibleExpression.empty()) {
      std::string parsedExpression = parseVisibleExpression(visibleExpression);
      conditionalStart = indent + "{" + parsedExpression + " && (\n";
      conditionalEnd = indent + ")}\n";
      indent = generateIndent(indentLevel + 1);
    }

    std::string result = conditionalStart;
    result += indent + "<" + tagName;

    // style 속성 추가
    std::string styleKey = styleGen.getStyleKey(elementId);
    if (!styleKey.empty()) {
      result += " style={styles." + styleKey + "}";
    }

    result += ">";

    // TEXT 또는 INSTANCE 타입이고 바인딩이 있는 경우: 바인딩된 prop을 자식으로
    // (children 무시)
    if ((type == "TEXT" || type == "INSTANCE") && hasBinding) {
      result += "{" + boundPropName + "}";
    }
    // 바인딩이 없고 children이 있으면 재귀 처리
    else if (element.contains("children") && element["children"].is_array() &&
             !element["children"].empty()) {
      result += "\n";
      for (const auto& child : element["children"]) {
        result += generateJSXElement(
            child,
            visibleMode == "expression" ? indentLevel + 2 : indentLevel + 1,
            elementBindings, styleGen);
      }
      result += indent;
    }

    result += "</" + tagName + ">\n";
    result += conditionalEnd;

    return result;
  }

  // JSX 트리 전체 생성 (return 문 포함)
  std::string generateJSXTree(const nlohmann::json& componentStructure,
                              const nlohmann::json& elementBindings,
                              const nlohmann::json& componentSpec,
                              InlineStyleGenerater& styleGen) {
    if (!componentStructure.contains("elements") ||
        !componentStructure["elements"].is_array()) {
      return "";
    }

    const auto& elements = componentStructure["elements"];
    if (elements.empty()) {
      return "";
    }

    // rootElement 확인 (metadata에서, 없으면 Fragment 사용)
    std::string rootTag = "";
    bool hasRootElement = false;

    if (componentSpec.contains("metadata") &&
        componentSpec["metadata"].contains("rootElement") &&
        componentSpec["metadata"]["rootElement"].is_string()) {
      rootTag = componentSpec["metadata"]["rootElement"].get<std::string>();
      // "div"가 아니면 rootElement 사용
      if (!rootTag.empty() && rootTag != "div") {
        hasRootElement = true;
      }
    }
    // fallback: 이전 버전 호환성
    else if (componentSpec.contains("rootElement") &&
             componentSpec["rootElement"].is_string() &&
             !componentSpec["rootElement"].get<std::string>().empty()) {
      rootTag = componentSpec["rootElement"].get<std::string>();
      hasRootElement = true;
    }

    std::string result = "\n  return (\n";

    if (hasRootElement) {
      result += "    <" + rootTag + " style={styles.container}>\n";
    } else {
      result += "    <>\n";
    }

    // 각 root element 생성
    for (const auto& element : elements) {
      result += generateJSXElement(element, 3, elementBindings, styleGen);
    }

    if (hasRootElement) {
      result += "    </" + rootTag + ">\n";
    } else {
      result += "    </>\n";
    }

    result += "  );\n";

    return result;
  }

  std::string generateReactCode(const nlohmann::json& componentSpecs) {
    const auto& componentspecs = componentSpecs;
    const auto& componentSpec = componentspecs[0];

    std::string result = "";

    // 1. metadata에서 name을 읽어서 function {componentName}(){} 형태로 만든다.
    std::string componentName;
    if (componentSpec.contains("metadata") &&
        componentSpec["metadata"].contains("name")) {
      componentName = componentSpec["metadata"]["name"].get<std::string>();
    } else {
      // fallback: 이전 버전 호환성
      componentName = componentSpec["name"].get<std::string>();
    }

    // Import 문 생성
    bool hasInternalState =
        componentSpec.contains("internalStateDefinition") &&
        componentSpec["internalStateDefinition"].is_array() &&
        !componentSpec["internalStateDefinition"].empty();

    if (hasInternalState) {
      result += "import { useState } from \"react\";\n\n";
    }

    // 2. componentSpec에서 propsDefinition을 읽어서 props를 만든다.
    std::string propsInterface = "";
    std::string propsParam = "";

    if (componentSpec.contains("propsDefinition") &&
        componentSpec["propsDefinition"].is_array()) {
      const auto& propsDefinition = componentSpec["propsDefinition"];

      // Props Interface 생성
      propsInterface = generatePropsInterface(componentName, propsDefinition);
      result += propsInterface;

      // Props 파라미터 생성
      propsParam = generatePropsParam(componentName, propsDefinition);
    }

    // 3. styles 객체 생성 (함수 외부에!)
    InlineStyleGenerater styleGen;
    if (componentSpec.contains("componentStructure")) {
      const auto& componentStructure = componentSpec["componentStructure"];
      std::string stylesObject = styleGen.generateStyles(componentStructure);
      result += stylesObject;
    }

    // 함수 선언 생성
    result += "function " + componentName + "(" + propsParam + ") {\n";

    // 4. internalStateDefinition을 읽어서 내부 state를 만든다.
    if (componentSpec.contains("internalStateDefinition") &&
        componentSpec["internalStateDefinition"].is_array()) {
      const auto& internalStateDefinition =
          componentSpec["internalStateDefinition"];
      result += generateInternalStates(internalStateDefinition);
    }

    // 5. componentStructure를 읽어서 컴포넌트 구조를 만든다.
    // 6. elementBindings를 읽어서 요소를 바인딩 한다.
    if (componentSpec.contains("componentStructure")) {
      const auto& componentStructure = componentSpec["componentStructure"];

      // elementBindings 가져오기 (없으면 빈 객체)
      nlohmann::json elementBindings = nlohmann::json::object();
      if (componentSpec.contains("elementBindings") &&
          componentSpec["elementBindings"].is_object()) {
        elementBindings = componentSpec["elementBindings"];
      }

      result += generateJSXTree(componentStructure, elementBindings,
                                componentSpec, styleGen);
    }

    result += "}\n\n";

    // Export 문 추가
    result += "export default " + componentName + ";\n";

    return result;
  }
};