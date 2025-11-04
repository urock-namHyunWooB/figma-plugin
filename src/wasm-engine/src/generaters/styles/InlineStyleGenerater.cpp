#include <cmath>
#include <map>
#include <sstream>
#include <string>

#include <nlohmann/json.hpp>

class InlineStyleGenerater {
 public:
  // Figma의 layoutMode를 flexDirection으로 변환
  std::string convertLayoutMode(const std::string& layoutMode) {
    if (layoutMode == "HORIZONTAL")
      return "row";
    if (layoutMode == "VERTICAL")
      return "column";
    return "row";  // default
  }

  // Figma의 primaryAxisAlignItems를 justifyContent로 변환
  std::string convertPrimaryAxisAlign(const std::string& align) {
    if (align == "MIN")
      return "flex-start";
    if (align == "CENTER")
      return "center";
    if (align == "MAX")
      return "flex-end";
    if (align == "SPACE_BETWEEN")
      return "space-between";
    return "flex-start";
  }

  // Figma의 counterAxisAlignItems를 alignItems로 변환
  std::string convertCounterAxisAlign(const std::string& align) {
    if (align == "MIN")
      return "flex-start";
    if (align == "CENTER")
      return "center";
    if (align == "MAX")
      return "flex-end";
    return "flex-start";
  }

  // 숫자를 px 문자열로 변환
  std::string toPx(double value) {
    std::ostringstream oss;
    oss << std::round(value) << "px";
    return oss.str();
  }

  // 단일 요소의 스타일 객체 생성
  std::string generateElementStyleObject(const nlohmann::json& element,
                                         const std::string& styleName) {
    std::vector<std::string> styleProps;

    // Width & Height
    if (element.contains("width")) {
      styleProps.push_back("    width: '" +
                           toPx(element["width"].get<double>()) + "'");
    }
    if (element.contains("height")) {
      styleProps.push_back("    height: '" +
                           toPx(element["height"].get<double>()) + "'");
    }

    // Layout (Flexbox)
    if (element.contains("layout") && element["layout"].is_object()) {
      const auto& layout = element["layout"];

      if (layout.contains("layoutMode") &&
          layout["layoutMode"].get<std::string>() != "NONE") {
        styleProps.push_back("    display: 'flex'");

        std::string layoutMode = layout["layoutMode"].get<std::string>();
        styleProps.push_back("    flexDirection: '" +
                             convertLayoutMode(layoutMode) + "'");

        // alignItems (counterAxis)
        if (layout.contains("counterAxisAlignItems")) {
          std::string align =
              layout["counterAxisAlignItems"].get<std::string>();
          styleProps.push_back("    alignItems: '" +
                               convertCounterAxisAlign(align) + "'");
        }

        // justifyContent (primaryAxis)
        if (layout.contains("primaryAxisAlignItems")) {
          std::string align =
              layout["primaryAxisAlignItems"].get<std::string>();
          styleProps.push_back("    justifyContent: '" +
                               convertPrimaryAxisAlign(align) + "'");
        }

        // gap (itemSpacing)
        if (layout.contains("itemSpacing")) {
          styleProps.push_back("    gap: '" +
                               toPx(layout["itemSpacing"].get<double>()) + "'");
        }
      }
    }

    // Padding
    if (element.contains("padding") && element["padding"].is_object()) {
      const auto& padding = element["padding"];

      if (padding.contains("top") && padding.contains("right") &&
          padding.contains("bottom") && padding.contains("left")) {
        double top = padding["top"].get<double>();
        double right = padding["right"].get<double>();
        double bottom = padding["bottom"].get<double>();
        double left = padding["left"].get<double>();

        // 모든 값이 같으면
        if (top == right && right == bottom && bottom == left) {
          styleProps.push_back("    padding: '" + toPx(top) + "'");
        }
        // 상하/좌우가 같으면
        else if (top == bottom && left == right) {
          styleProps.push_back("    padding: '" + toPx(top) + " " +
                               toPx(right) + "'");
        }
        // 모두 다르면
        else {
          styleProps.push_back("    padding: '" + toPx(top) + " " +
                               toPx(right) + " " + toPx(bottom) + " " +
                               toPx(left) + "'");
        }
      }
    }

    // 스타일이 없으면 빈 문자열 반환
    if (styleProps.empty()) {
      return "";
    }

    // 스타일 객체 조합
    std::string result = "  " + styleName + ": {\n";
    for (size_t i = 0; i < styleProps.size(); i++) {
      result += styleProps[i];
      if (i < styleProps.size() - 1) {
        result += ",";
      }
      result += "\n";
    }
    result += "  }";

    return result;
  }

  // 요소 이름을 스타일 키로 변환 (camelCase)
  std::string generateStyleKey(const nlohmann::json& element, int index) {
    if (element.contains("name")) {
      std::string name = element["name"].get<std::string>();
      // 공백과 특수문자 제거, camelCase로 변환
      std::string key = "";
      bool capitalizeNext = false;

      for (char c : name) {
        if (c == ' ' || c == '_' || c == '-') {
          capitalizeNext = true;
        } else if (capitalizeNext) {
          key += static_cast<char>(std::toupper(c));
          capitalizeNext = false;
        } else {
          key += static_cast<char>(std::tolower(c));
        }
      }

      return key.empty() ? "element" + std::to_string(index) : key;
    }

    return "element" + std::to_string(index);
  }

  // 전체 요소를 순회하며 스타일 수집 (재귀)
  void collectElementStyles(
      const nlohmann::json& element,
      std::vector<std::pair<std::string, std::string>>& stylesMap,
      int& counter) {
    if (!element.contains("id")) {
      return;
    }

    std::string elementId = element["id"].get<std::string>();
    std::string styleKey = generateStyleKey(element, counter++);
    std::string styleObject = generateElementStyleObject(element, styleKey);

    if (!styleObject.empty()) {
      stylesMap.push_back({elementId, styleObject});
    }

    // Children 재귀 처리
    if (element.contains("children") && element["children"].is_array()) {
      for (const auto& child : element["children"]) {
        collectElementStyles(child, stylesMap, counter);
      }
    }
  }

  // 전체 styles 객체 생성
  std::string generateStylesObject(const nlohmann::json& componentStructure) {
    if (!componentStructure.contains("elements") ||
        !componentStructure["elements"].is_array()) {
      return "";
    }

    std::vector<std::pair<std::string, std::string>> stylesMap;
    int counter = 0;

    // Root의 스타일
    std::string rootStyle = "";
    if (componentStructure.contains("padding") ||
        componentStructure.contains("layout")) {
      nlohmann::json rootElement = nlohmann::json::object();
      if (componentStructure.contains("padding")) {
        rootElement["padding"] = componentStructure["padding"];
      }
      if (componentStructure.contains("layout")) {
        rootElement["layout"] = componentStructure["layout"];
      }
      if (componentStructure.contains("boundingBox")) {
        rootElement["width"] = componentStructure["boundingBox"]["width"];
        rootElement["height"] = componentStructure["boundingBox"]["height"];
      }

      rootStyle = generateElementStyleObject(rootElement, "container");
      if (!rootStyle.empty()) {
        stylesMap.push_back({"root", rootStyle});
      }
    }

    // 각 요소의 스타일 수집
    for (const auto& element : componentStructure["elements"]) {
      collectElementStyles(element, stylesMap, counter);
    }

    if (stylesMap.empty()) {
      return "";
    }

    // styles 객체 조합
    std::string result = "const styles = {\n";
    for (size_t i = 0; i < stylesMap.size(); i++) {
      result += stylesMap[i].second;
      if (i < stylesMap.size() - 1) {
        result += ",";
      }
      result += "\n";
    }
    result += "};\n\n";

    return result;
  }

  // elementId -> styleKey 매핑 저장용
  std::map<std::string, std::string> elementIdToStyleKey;

  // styleKey 중복 방지용 (키 -> 사용 횟수)
  std::map<std::string, int> styleKeyUsageCount;

  // 고유한 스타일 키 생성 (중복 방지)
  std::string generateUniqueStyleKey(const nlohmann::json& element, int index) {
    std::string baseKey = generateStyleKey(element, index);

    // 이미 사용된 키인지 확인
    auto it = styleKeyUsageCount.find(baseKey);
    if (it == styleKeyUsageCount.end()) {
      // 처음 사용하는 키
      styleKeyUsageCount[baseKey] = 1;
      return baseKey;
    } else {
      // 중복된 키 - 숫자 붙이기
      it->second++;
      return baseKey + std::to_string(it->second);
    }
  }

  // 전체 스타일 생성 (매핑도 함께)
  std::string generateStyles(const nlohmann::json& componentStructure) {
    elementIdToStyleKey.clear();
    styleKeyUsageCount.clear();

    if (!componentStructure.contains("elements") ||
        !componentStructure["elements"].is_array()) {
      return "";
    }

    std::vector<std::pair<std::string, std::string>> stylesMap;
    int counter = 0;

    // Root의 스타일
    std::string rootStyle = "";
    if (componentStructure.contains("padding") ||
        componentStructure.contains("layout")) {
      nlohmann::json rootElement = nlohmann::json::object();
      if (componentStructure.contains("padding")) {
        rootElement["padding"] = componentStructure["padding"];
      }
      if (componentStructure.contains("layout")) {
        rootElement["layout"] = componentStructure["layout"];
      }
      if (componentStructure.contains("boundingBox")) {
        rootElement["width"] = componentStructure["boundingBox"]["width"];
        rootElement["height"] = componentStructure["boundingBox"]["height"];
      }

      rootStyle = generateElementStyleObject(rootElement, "container");
      if (!rootStyle.empty()) {
        stylesMap.push_back({"root", rootStyle});
        styleKeyUsageCount["container"] = 1;
      }
    }

    // 각 요소의 스타일 수집 및 매핑
    for (const auto& element : componentStructure["elements"]) {
      collectElementStylesWithMapping(element, stylesMap, counter);
    }

    if (stylesMap.empty()) {
      return "";
    }

    // styles 객체 조합
    std::string result = "const styles = {\n";
    for (size_t i = 0; i < stylesMap.size(); i++) {
      result += stylesMap[i].second;
      if (i < stylesMap.size() - 1) {
        result += ",";
      }
      result += "\n";
    }
    result += "};\n\n";

    return result;
  }

  // 스타일 키 가져오기
  std::string getStyleKey(const std::string& elementId) {
    auto it = elementIdToStyleKey.find(elementId);
    if (it != elementIdToStyleKey.end()) {
      return it->second;
    }
    return "";
  }

 private:
  // 요소를 순회하며 스타일 수집 및 elementId 매핑
  void collectElementStylesWithMapping(
      const nlohmann::json& element,
      std::vector<std::pair<std::string, std::string>>& stylesMap,
      int& counter) {
    if (!element.contains("id")) {
      return;
    }

    std::string elementId = element["id"].get<std::string>();
    std::string styleKey = generateUniqueStyleKey(element, counter++);
    std::string styleObject = generateElementStyleObject(element, styleKey);

    if (!styleObject.empty()) {
      stylesMap.push_back({elementId, styleObject});
      elementIdToStyleKey[elementId] = styleKey;
    }

    // Children 재귀 처리
    if (element.contains("children") && element["children"].is_array()) {
      for (const auto& child : element["children"]) {
        collectElementStylesWithMapping(child, stylesMap, counter);
      }
    }
  }
};
