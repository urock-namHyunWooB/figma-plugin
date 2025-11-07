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

  // RGB 색상을 CSS 문자열로 변환
  std::string rgbToCss(const nlohmann::json& color, double opacity = 1.0) {
    if (!color.contains("r") || !color.contains("g") || !color.contains("b")) {
      return "";
    }

    int r = color["r"].get<int>();
    int g = color["g"].get<int>();
    int b = color["b"].get<int>();

    std::ostringstream oss;
    if (opacity < 1.0) {
      oss << "rgba(" << r << ", " << g << ", " << b << ", " << opacity << ")";
    } else {
      oss << "rgb(" << r << ", " << g << ", " << b << ")";
    }
    return oss.str();
  }

  // 단일 요소의 스타일 객체 생성
  std::string generateElementStyleObject(
      const nlohmann::json& element, const std::string& styleName,
      const std::string& parentLayoutMode = "") {
    std::vector<std::string> styleProps;

    // 요소 타입 확인
    std::string elementType = "";
    if (element.contains("type")) {
      elementType = element["type"].get<std::string>();
    }

    // 부모가 layoutMode: NONE이면 자식은 absolute positioning
    bool isAbsolutePositioned = (parentLayoutMode == "NONE");

    if (isAbsolutePositioned) {
      styleProps.push_back("    position: 'absolute'");

      // x, y를 left, top으로 변환
      if (element.contains("x")) {
        styleProps.push_back("    left: '" + toPx(element["x"].get<double>()) +
                             "'");
      }
      if (element.contains("y")) {
        styleProps.push_back("    top: '" + toPx(element["y"].get<double>()) +
                             "'");
      }
    }

    // TEXT 타입은 width, height 제외 (텍스트 자체 크기 사용)
    if (elementType != "TEXT") {
      // Width & Height
      if (element.contains("width")) {
        styleProps.push_back("    width: '" +
                             toPx(element["width"].get<double>()) + "'");
      }
      if (element.contains("height")) {
        styleProps.push_back("    height: '" +
                             toPx(element["height"].get<double>()) + "'");
      }
    }

    // Layout (Flexbox or Absolute)
    if (element.contains("layout") && element["layout"].is_object()) {
      const auto& layout = element["layout"];

      if (layout.contains("layoutMode")) {
        std::string layoutMode = layout["layoutMode"].get<std::string>();

        if (layoutMode == "NONE") {
          // layoutMode: NONE → position: relative
          // 자식 요소들이 absolute로 배치될 수 있도록
          // 단, 이미 absolute로 설정되지 않았을 때만
          if (!isAbsolutePositioned) {
            styleProps.push_back("    position: 'relative'");
          }
        } else {
          // AUTO LAYOUT (HORIZONTAL, VERTICAL)
          styleProps.push_back("    display: 'flex'");
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
            styleProps.push_back(
                "    gap: '" + toPx(layout["itemSpacing"].get<double>()) + "'");
          }
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

    // Fills (Background Color or Text Color)
    if (element.contains("fills") && element["fills"].is_array() &&
        !element["fills"].empty()) {
      const auto& fills = element["fills"];
      const auto& firstFill = fills[0];

      if (firstFill.contains("type") &&
          firstFill["type"].get<std::string>() == "SOLID") {
        if (firstFill.contains("color")) {
          double opacity = firstFill.contains("opacity")
                               ? firstFill["opacity"].get<double>()
                               : 1.0;
          std::string colorValue = rgbToCss(firstFill["color"], opacity);

          if (!colorValue.empty()) {
            // TEXT 타입은 color, 나머지는 background
            if (elementType == "TEXT") {
              styleProps.push_back("    color: '" + colorValue + "'");
            } else {
              styleProps.push_back("    background: '" + colorValue + "'");
            }
          }
        }
      }
    }

    // Strokes (Border)
    if (element.contains("strokes") && element["strokes"].is_array() &&
        !element["strokes"].empty()) {
      const auto& strokes = element["strokes"];
      const auto& firstStroke = strokes[0];

      if (firstStroke.contains("type") &&
          firstStroke["type"].get<std::string>() == "SOLID") {
        if (firstStroke.contains("color")) {
          std::string borderColor = rgbToCss(firstStroke["color"]);
          if (!borderColor.empty()) {
            // strokeWeight가 있으면 함께 설정
            std::string borderWidth = "1px";
            if (element.contains("strokeWeight")) {
              borderWidth = toPx(element["strokeWeight"].get<double>());
            }
            styleProps.push_back("    border: '" + borderWidth + " solid " +
                                 borderColor + "'");
          }
        }
      }
    }

    // Corner Radius (Border Radius)
    if (element.contains("cornerRadius")) {
      double radius = element["cornerRadius"].get<double>();
      if (radius > 0) {
        styleProps.push_back("    borderRadius: '" + toPx(radius) + "'");
      }
    }

    // ELLIPSE 타입은 원형으로 (borderRadius: 50%)
    if (elementType == "ELLIPSE") {
      styleProps.push_back("    borderRadius: '50%'");
    }

    // Opacity
    if (element.contains("opacity")) {
      double opacity = element["opacity"].get<double>();
      if (opacity < 1.0) {
        std::ostringstream oss;
        oss << opacity;
        styleProps.push_back("    opacity: " + oss.str());
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

    // Root의 스타일 (baseVariant의 스타일)
    std::string rootStyle = "";
    if (componentStructure.contains("padding") ||
        componentStructure.contains("layout") ||
        componentStructure.contains("fills") ||
        componentStructure.contains("strokes") ||
        componentStructure.contains("cornerRadius") ||
        componentStructure.contains("opacity") ||
        componentStructure.contains("boundingBox")) {
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
      if (componentStructure.contains("fills")) {
        rootElement["fills"] = componentStructure["fills"];
      }
      if (componentStructure.contains("strokes")) {
        rootElement["strokes"] = componentStructure["strokes"];
      }
      if (componentStructure.contains("strokeWeight")) {
        rootElement["strokeWeight"] = componentStructure["strokeWeight"];
      }
      if (componentStructure.contains("cornerRadius")) {
        rootElement["cornerRadius"] = componentStructure["cornerRadius"];
      }
      if (componentStructure.contains("opacity")) {
        rootElement["opacity"] = componentStructure["opacity"];
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
      // 현재 요소의 layoutMode 확인
      std::string currentLayoutMode = "";
      if (element.contains("layout") && element["layout"].is_object() &&
          element["layout"].contains("layoutMode")) {
        currentLayoutMode = element["layout"]["layoutMode"].get<std::string>();
      }

      for (const auto& child : element["children"]) {
        // 자식에게 부모의 layoutMode 전달
        collectElementStylesWithMappingAndParent(child, stylesMap, counter,
                                                 currentLayoutMode);
      }
    }
  }

  // 부모 layoutMode를 전달하는 버전
  void collectElementStylesWithMappingAndParent(
      const nlohmann::json& element,
      std::vector<std::pair<std::string, std::string>>& stylesMap, int& counter,
      const std::string& parentLayoutMode) {
    if (!element.contains("id")) {
      return;
    }

    std::string elementId = element["id"].get<std::string>();
    std::string styleKey = generateUniqueStyleKey(element, counter++);
    std::string styleObject =
        generateElementStyleObject(element, styleKey, parentLayoutMode);

    if (!styleObject.empty()) {
      stylesMap.push_back({elementId, styleObject});
      elementIdToStyleKey[elementId] = styleKey;
    }

    // Children 재귀 처리
    if (element.contains("children") && element["children"].is_array()) {
      // 현재 요소의 layoutMode 확인
      std::string currentLayoutMode = "";
      if (element.contains("layout") && element["layout"].is_object() &&
          element["layout"].contains("layoutMode")) {
        currentLayoutMode = element["layout"]["layoutMode"].get<std::string>();
      }

      for (const auto& child : element["children"]) {
        collectElementStylesWithMappingAndParent(child, stylesMap, counter,
                                                 currentLayoutMode);
      }
    }
  }
};
