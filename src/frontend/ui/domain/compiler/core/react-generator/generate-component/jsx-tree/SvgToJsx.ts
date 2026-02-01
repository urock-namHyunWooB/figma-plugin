import ts from "typescript";

/**
 * SVG 문자열을 TypeScript JSX AST로 변환하는 유틸리티
 *
 * 변환 과정:
 * 1. SVG 문자열을 파싱하여 DOM 구조로 변환
 * 2. SVG 속성을 JSX 호환 형식으로 변환 (stroke-width → strokeWidth)
 * 3. TypeScript AST JsxElement로 생성
 */
class SvgToJsx {
  private factory = ts.factory;
  // SVG가 다중 색상인지 여부 (convert 호출 시 설정됨)
  private _isMultiColorSvg = false;

  /**
   * SVG 속성 이름을 JSX camelCase로 변환하는 매핑
   */
  private readonly SVG_ATTR_MAP: Record<string, string> = {
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-miterlimit": "strokeMiterlimit",
    "stroke-opacity": "strokeOpacity",
    "fill-opacity": "fillOpacity",
    "fill-rule": "fillRule",
    "clip-path": "clipPath",
    "clip-rule": "clipRule",
    "font-family": "fontFamily",
    "font-size": "fontSize",
    "font-weight": "fontWeight",
    "font-style": "fontStyle",
    "text-anchor": "textAnchor",
    "text-decoration": "textDecoration",
    "dominant-baseline": "dominantBaseline",
    "alignment-baseline": "alignmentBaseline",
    "stop-color": "stopColor",
    "stop-opacity": "stopOpacity",
    "color-interpolation": "colorInterpolation",
    "color-interpolation-filters": "colorInterpolationFilters",
    "flood-color": "floodColor",
    "flood-opacity": "floodOpacity",
    "lighting-color": "lightingColor",
    "marker-start": "markerStart",
    "marker-mid": "markerMid",
    "marker-end": "markerEnd",
    "paint-order": "paintOrder",
    "shape-rendering": "shapeRendering",
    "vector-effect": "vectorEffect",
    "pointer-events": "pointerEvents",
    // xmlns 관련 속성은 제거 대상
    xmlns: "__REMOVE__",
    "xmlns:xlink": "__REMOVE__",
    "xlink:href": "xlinkHref",
  };

  /**
   * SVG 문자열을 JSX Element AST로 변환
   * @param svgString - SVG 문자열
   * @returns TypeScript JsxElement 또는 JsxSelfClosingElement
   */
  public convert(
    svgString: string
  ): ts.JsxElement | ts.JsxSelfClosingElement | null {
    try {
      // 다중 색상 여부 판단
      this._isMultiColorSvg = this._detectMultiColorSvg(svgString);

      // 간단한 정규식 기반 파싱 (복잡한 SVG는 DOMParser 필요)
      const parsed = this._parseSvgString(svgString);
      if (!parsed) return null;

      return this._createJsxFromParsed(parsed);
    } catch (error) {
      console.error("SVG to JSX conversion failed:", error);
      return null;
    }
  }

  /**
   * SVG가 다중 색상인지 감지
   * fill 속성에서 유니크한 색상이 2개 이상이면 다중 색상
   */
  private _detectMultiColorSvg(svgString: string): boolean {
    // fill="xxx" 패턴에서 색상 추출
    const fillMatches = svgString.match(/fill="([^"]+)"/g);
    if (!fillMatches) return false;

    const uniqueColors = new Set<string>();
    for (const match of fillMatches) {
      const color = match.match(/fill="([^"]+)"/)?.[1];
      if (color && this._isColorValue(color)) {
        // 색상값 정규화 (소문자)
        uniqueColors.add(color.toLowerCase());
      }
    }

    // 유니크한 색상이 2개 이상이면 다중 색상
    return uniqueColors.size >= 2;
  }

  /**
   * SVG 문자열을 파싱하여 구조화된 데이터로 변환
   */
  private _parseSvgString(svgString: string): ParsedElement | null {
    // 공백 정리
    const cleanedSvg = svgString.trim();

    // 루트 요소 추출
    return this._parseElement(cleanedSvg);
  }

  /**
   * 단일 요소 파싱
   */
  private _parseElement(elementStr: string): ParsedElement | null {
    // 여는 태그 매칭: <tagName attr1="value1" attr2="value2" ...>
    const openTagMatch = elementStr.match(
      /^<(\w+)((?:\s+[\w\-:]+(?:="[^"]*")?)*)\s*(\/?)>/
    );
    if (!openTagMatch) return null;

    const tagName = openTagMatch[1];
    const attrsString = openTagMatch[2];
    const isSelfClosing = openTagMatch[3] === "/";

    // 속성 파싱
    const attributes = this._parseAttributes(attrsString);

    // Self-closing 태그인 경우
    if (isSelfClosing) {
      return {
        tagName,
        attributes,
        children: [],
      };
    }

    // 닫는 태그까지의 내용 추출
    const closingTagRegex = new RegExp(`</${tagName}>`);
    const fullTagMatch = elementStr.match(closingTagRegex);
    if (!fullTagMatch) {
      // 닫는 태그가 없으면 self-closing으로 처리
      return {
        tagName,
        attributes,
        children: [],
      };
    }

    // 자식 요소 추출
    const openTagEnd = openTagMatch[0].length;
    const closeTagStart = elementStr.lastIndexOf(`</${tagName}>`);
    const innerContent = elementStr.slice(openTagEnd, closeTagStart);

    // 자식 요소 파싱
    const children = this._parseChildren(innerContent);

    return {
      tagName,
      attributes,
      children,
    };
  }

  /**
   * 속성 문자열 파싱
   */
  private _parseAttributes(attrsString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    if (!attrsString) return attributes;

    // 속성 매칭: attrName="attrValue" 또는 attrName (boolean)
    const attrRegex = /([\w\-:]+)(?:="([^"]*)")?/g;
    let match;

    while ((match = attrRegex.exec(attrsString)) !== null) {
      const attrName = match[1];
      const attrValue = match[2] !== undefined ? match[2] : "true";
      attributes[attrName] = attrValue;
    }

    return attributes;
  }

  /**
   * 자식 요소들 파싱
   */
  private _parseChildren(innerContent: string): ParsedElement[] {
    const children: ParsedElement[] = [];
    const trimmed = innerContent.trim();
    if (!trimmed) return children;

    // 각 자식 요소 추출 (간단한 구현 - 중첩된 같은 태그 처리는 제한적)
    let remaining = trimmed;
    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (!remaining.startsWith("<")) break;

      // 태그 이름 추출
      const tagMatch = remaining.match(/^<(\w+)/);
      if (!tagMatch) break;

      const tagName = tagMatch[1];

      // Self-closing 태그 확인
      const selfClosingMatch = remaining.match(
        new RegExp(`^<${tagName}(?:\\s+[^>]*)?\\s*/>`)
      );
      if (selfClosingMatch) {
        const child = this._parseElement(selfClosingMatch[0]);
        if (child) children.push(child);
        remaining = remaining.slice(selfClosingMatch[0].length);
        continue;
      }

      // 일반 태그 - 닫는 태그 찾기 (간단한 구현)
      const closeTagIndex = this._findClosingTag(remaining, tagName);
      if (closeTagIndex === -1) break;

      const elementStr = remaining.slice(
        0,
        closeTagIndex + `</${tagName}>`.length
      );
      const child = this._parseElement(elementStr);
      if (child) children.push(child);

      remaining = remaining.slice(elementStr.length);
    }

    return children;
  }

  /**
   * 중첩을 고려한 닫는 태그 위치 찾기
   */
  private _findClosingTag(str: string, tagName: string): number {
    let depth = 0;
    let i = 0;

    while (i < str.length) {
      // 여는 태그 확인
      const openMatch = str
        .slice(i)
        .match(new RegExp(`^<${tagName}(?:\\s|>|/)`));
      if (openMatch) {
        // Self-closing 확인
        const selfCloseMatch = str
          .slice(i)
          .match(new RegExp(`^<${tagName}[^>]*/>`));
        if (!selfCloseMatch) {
          depth++;
        }
        i += openMatch[0].length - 1;
      }

      // 닫는 태그 확인
      const closeMatch = str.slice(i).match(new RegExp(`^</${tagName}>`));
      if (closeMatch) {
        depth--;
        if (depth === 0) {
          return i;
        }
        i += closeMatch[0].length;
        continue;
      }

      i++;
    }

    return -1;
  }

  /**
   * 파싱된 구조를 JSX AST로 변환
   */
  private _createJsxFromParsed(
    parsed: ParsedElement
  ): ts.JsxElement | ts.JsxSelfClosingElement {
    const tagName = parsed.tagName;
    const attributes = this._createJsxAttributes(parsed.attributes);
    const children = parsed.children.map((child) =>
      this._createJsxFromParsed(child)
    );

    if (children.length === 0) {
      return this.factory.createJsxSelfClosingElement(
        this.factory.createIdentifier(tagName),
        undefined,
        this.factory.createJsxAttributes(attributes)
      );
    }

    return this.factory.createJsxElement(
      this.factory.createJsxOpeningElement(
        this.factory.createIdentifier(tagName),
        undefined,
        this.factory.createJsxAttributes(attributes)
      ),
      children as ts.JsxChild[],
      this.factory.createJsxClosingElement(
        this.factory.createIdentifier(tagName)
      )
    );
  }

  /**
   * SVG 속성을 JSX 속성으로 변환
   */
  private _createJsxAttributes(
    attributes: Record<string, string>
  ): ts.JsxAttributeLike[] {
    const jsxAttrs: ts.JsxAttributeLike[] = [];

    for (const [attrName, attrValue] of Object.entries(attributes)) {
      // JSX 속성 이름 변환
      const jsxAttrName = this._convertAttrName(attrName);

      // 제거 대상 속성 스킵
      if (jsxAttrName === "__REMOVE__") continue;

      // fill 속성 처리:
      // - 원래 색상 유지 (currentColor 변환 시 부모에 color가 없으면 렌더링 문제 발생)
      // - 부모 컴포넌트에서 CSS로 색상 제어가 필요하면 별도 처리
      const finalValue = attrValue;

      // 값이 순수 숫자인 경우에만 JSX Expression으로 (공백 포함 시 문자열 유지)
      const numValue = parseFloat(finalValue);
      const isNumeric =
        !isNaN(numValue) &&
        isFinite(numValue) &&
        !/[a-zA-Z%]/.test(finalValue) &&
        !/\s/.test(finalValue);

      let jsxAttrValue: ts.JsxAttributeValue;
      if (isNumeric) {
        jsxAttrValue = this.factory.createJsxExpression(
          undefined,
          this.factory.createNumericLiteral(numValue)
        );
      } else {
        jsxAttrValue = this.factory.createStringLiteral(finalValue);
      }

      jsxAttrs.push(
        this.factory.createJsxAttribute(
          this.factory.createIdentifier(jsxAttrName),
          jsxAttrValue
        )
      );
    }

    return jsxAttrs;
  }

  /**
   * CSS 명명된 색상 목록 (일부)
   */
  private readonly NAMED_COLORS = new Set([
    "white",
    "black",
    "red",
    "green",
    "blue",
    "yellow",
    "cyan",
    "magenta",
    "gray",
    "grey",
    "orange",
    "pink",
    "purple",
    "brown",
    "transparent",
    "currentcolor",
  ]);

  /**
   * 값이 색상 값인지 확인
   * #RRGGBB, #RGB, rgb(), rgba(), 명명된 색상 등
   */
  private _isColorValue(value: string): boolean {
    if (!value) return false;
    // #으로 시작하는 hex 색상
    if (/^#[0-9A-Fa-f]{3,8}$/.test(value)) return true;
    // rgb, rgba, hsl, hsla 함수
    if (/^(rgb|rgba|hsl|hsla)\(/.test(value)) return true;
    // 명명된 색상 (CSS color names)
    if (this.NAMED_COLORS.has(value.toLowerCase())) return true;
    // none은 색상 아님
    if (value === "none") return false;
    return false;
  }

  /**
   * SVG 속성 이름을 JSX camelCase로 변환
   */
  private _convertAttrName(attrName: string): string {
    // 매핑 테이블에 있으면 사용
    if (this.SVG_ATTR_MAP[attrName]) {
      return this.SVG_ATTR_MAP[attrName];
    }

    // class → className
    if (attrName === "class") {
      return "className";
    }

    // 케밥 케이스 → camelCase 변환
    if (attrName.includes("-")) {
      return attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    return attrName;
  }
}

/**
 * 파싱된 SVG 요소 구조
 */
interface ParsedElement {
  tagName: string;
  attributes: Record<string, string>;
  children: ParsedElement[];
}

export default SvgToJsx;
