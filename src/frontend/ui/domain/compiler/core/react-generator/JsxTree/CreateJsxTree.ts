import { FinalAstTree } from "@compiler";
import ts from "typescript";
import debug from "@compiler/manager/DebuggingManager";

class CreateJsxTree {
  private _jsxTree: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression;

  private astTree: FinalAstTree;

  private factory = ts.factory;
  private styleVariables: Map<string, string> = new Map(); // node.id -> style variable name
  private cssObjectCache: Map<string, ts.CallExpression> = new Map(); // 스타일 문자열 -> css() 호출 결과 캐시

  public get jsxTree() {
    return this._jsxTree;
  }

  constructor(astTree: FinalAstTree) {
    this.astTree = astTree;
    this._jsxTree = this._createJsxTree(astTree);
    console.log(this._jsxTree);
  }

  public _createJsxTree(
    node: FinalAstTree
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // Slot 노드는 props.slotName으로 참조 (children 없음)
    const slotJsx = this._createSlotJsxExpression(node);
    if (slotJsx) {
      debug.tsNode(slotJsx);
      return slotJsx;
    }

    // 일반 노드: 태그, 속성, children을 조합하여 JSX Element 생성
    const tagName = this._getTagName(node);
    const attributes = this._createAttributes(node);
    const children = this._createChildren(node);

    return this._createJsxElement(tagName, attributes, children);
  }

  /**
   * Slot 노드를 JSX Expression으로 변환
   * Slot 노드는 props.slotName으로 참조됨
   * Slot 노드는 children을 가질 수 없으므로 early return
   */
  private _createSlotJsxExpression(
    node: FinalAstTree
  ): ts.JsxExpression | null {
    if (!(node as any).isSlot) {
      return null;
    }

    const slotName = (node as any).slotName;
    return this.factory.createJsxExpression(
      undefined,
      this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("props"),
        this.factory.createIdentifier(slotName)
      )
    );
  }

  /**
   * 노드의 JSX Attributes 생성
   */
  private _createAttributes(node: FinalAstTree): ts.JsxAttributeLike[] {
    const attributes: ts.JsxAttributeLike[] = [];
    const styleAttr = this._createStyleAttribute(node);
    if (styleAttr) {
      attributes.push(styleAttr);
    }
    return attributes;
  }

  /**
   * 노드의 Children 생성 (재귀적, visible 조건 처리 포함)
   */
  private _createChildren(node: FinalAstTree): ts.JsxChild[] {
    const children: ts.JsxChild[] = [];

    for (const child of node.children) {
      const childJsx = this._createJsxTree(child);

      if (child.visible.type === "condition") {
        const condition = this._convertEstreeToTsExpression(
          child.visible.condition
        );
        const conditionalJsx = this._wrapWithConditionalRendering(
          condition,
          childJsx as ts.JsxElement | ts.JsxSelfClosingElement
        );
        children.push(conditionalJsx);
      } else {
        // static인 경우 그대로 추가
        children.push(childJsx as ts.JsxChild);
      }
    }

    return children;
  }

  /**
   * JSX Element 생성 (self-closing 또는 일반 element)
   */
  private _createJsxElement(
    tagName: string,
    attributes: ts.JsxAttributeLike[],
    children: ts.JsxChild[]
  ): ts.JsxElement | ts.JsxSelfClosingElement {
    const tagIdentifier = this.factory.createIdentifier(tagName);
    const jsxAttributes = this.factory.createJsxAttributes(attributes);

    if (children.length === 0) {
      return this.factory.createJsxSelfClosingElement(
        tagIdentifier,
        undefined,
        jsxAttributes
      );
    }

    return this.factory.createJsxElement(
      this.factory.createJsxOpeningElement(
        tagIdentifier,
        undefined,
        jsxAttributes
      ),
      children,
      this.factory.createJsxClosingElement(tagIdentifier)
    );
  }

  private _getTagName(node: FinalAstTree): string {
    if (node.type === "TEXT") return "span";
    if (node.type === "INSTANCE") {
      // INSTANCE는 컴포넌트 이름 사용 (공백 제거, PascalCase로 변환?)
      return node.name.replace(/\s+/g, "");
    }
    return "div";
  }

  /**
   * Style 속성 생성 (base + variant style maps)
   */
  private _createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    // 스타일 최적화: dynamic styles에서 공통 속성을 base로 이동
    const optimized = this._optimizeStyles(node);
    const baseStyle = optimized.base;
    const dynamicStyles = optimized.dynamic;

    // 스타일이 없는 경우
    if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
      return null;
    }

    const baseStyleVarName = this._getStyleVariableName(node);
    const classNameParts: ts.Expression[] = [];

    // 1. Base style 추가
    if (Object.keys(baseStyle).length > 0) {
      const baseStyleReference = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("styles"),
        this.factory.createIdentifier(baseStyleVarName)
      );
      classNameParts.push(baseStyleReference);
    }

    // 2. Dynamic styles를 prop별로 그룹핑하여 variant map 참조
    const grouped = this._groupDynamicStylesByProp(dynamicStyles);

    for (const [propName] of grouped.entries()) {
      // variant map 이름: {baseStyleVarName}{PropName} (Styles 접미사 제거)
      const variantMapName = `${baseStyleVarName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;

      // styles.{variantMapName}[props.{propName}]
      const variantMapAccess = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("styles"),
        this.factory.createIdentifier(variantMapName)
      );

      const propAccess = this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier("props"),
        this.factory.createIdentifier(propName)
      );

      const variantStyleAccess = this.factory.createElementAccessExpression(
        variantMapAccess,
        propAccess
      );

      classNameParts.push(variantStyleAccess);
    }

    // 3. cx 함수를 사용하여 className 결합
    // cx(styles.base, styles.sizeStyles[props.size], styles.stateStyles[props.state])
    let classNameExpression: ts.Expression;

    if (classNameParts.length === 1) {
      // 단일 스타일만 있는 경우
      classNameExpression = classNameParts[0];
    } else {
      // cx 함수 호출: cx(style1, style2, ...)
      const cxIdentifier = this.factory.createIdentifier("cx");
      classNameExpression = this.factory.createCallExpression(
        cxIdentifier,
        undefined,
        classNameParts
      );
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("className"),
      this.factory.createJsxExpression(undefined, classNameExpression)
    );
  }

  /**
   * 노드의 스타일 변수 이름 생성 (짧고 의미있는 이름)
   */
  private _getStyleVariableName(node: FinalAstTree): string {
    if (this.styleVariables.has(node.id)) {
      return this.styleVariables.get(node.id)!;
    }

    // 1. 노드 타입과 이름을 기반으로 짧은 이름 생성
    const baseName = this._generateShortName(node);
    const uniqueVarName = this._ensureUniqueVarName(baseName);

    this.styleVariables.set(node.id, uniqueVarName);
    return uniqueVarName;
  }

  /**
   * 짧고 의미있는 변수명 생성
   */
  private _generateShortName(node: FinalAstTree): string {
    // 1. 노드 타입 기반 기본 이름
    const typeMap: Record<string, string> = {
      TEXT: "text",
      INSTANCE: "icon",
      FRAME: "frame",
      GROUP: "group",
      VECTOR: "vector",
      RECTANGLE: "rect",
      ELLIPSE: "ellipse",
    };

    let baseName = typeMap[node.type] || "node";

    // 2. 노드 이름에서 의미있는 키워드 추출 (짧게)
    const nameWords = this._extractKeywords(node.name);

    if (nameWords.length > 0) {
      // 첫 번째 키워드 사용 (최대 2개 단어 조합)
      const keyword = nameWords.slice(0, 2).join("");
      if (keyword.length <= 10) {
        baseName = keyword.toLowerCase();
      } else {
        // 너무 길면 첫 글자만 사용
        baseName = nameWords
          .slice(0, 3)
          .map((w) => w.charAt(0))
          .join("")
          .toLowerCase();
      }
    }

    // 3. node.id의 마지막 숫자 부분을 짧은 식별자로 사용 (중복 방지)
    // 예: "4139:411" -> "411" 또는 해시값
    const idParts = node.id.split(":");
    if (idParts.length > 1) {
      const lastPart = idParts[idParts.length - 1];
      // 숫자가 너무 길면 마지막 3자리만 사용
      const shortId = lastPart.slice(-3);
      // 기존 baseName과 결합하되, 이미 충분히 구분되면 생략
      if (!baseName || baseName === "node") {
        baseName = `node${shortId}`;
      }
    }

    return baseName || "node";
  }

  /**
   * 노드 이름에서 의미있는 키워드 추출
   */
  private _extractKeywords(name: string): string[] {
    if (!name) return [];

    // 특수 문자, 숫자, 등호 제거 후 단어 추출
    const cleaned = name.replace(/[=:,]/g, " ").replace(/\d+/g, "").trim();

    // 공백으로 분리하고 의미없는 단어 필터링
    const stopWords = new Set([
      "false",
      "true",
      "default",
      "disabled",
      "enabled",
      "the",
      "a",
      "an",
    ]);

    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => word.length > 1 && !stopWords.has(word.toLowerCase()))
      .slice(0, 3); // 최대 3개만 사용
  }

  /**
   * 고유한 변수 이름 보장 (중복 시 숫자 추가)
   */
  private _ensureUniqueVarName(baseName: string): string {
    const existingNames = Array.from(this.styleVariables.values());
    let uniqueName = baseName;
    let counter = 0;

    while (existingNames.includes(uniqueName)) {
      counter++;
      uniqueName = `${baseName}${counter}`;
    }

    return uniqueName;
  }

  /**
   * ESTree 조건에서 prop 이름과 값 추출
   * props.Size === "Large" → { prop: "size", value: "Large" }
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    // props.X === "value" 형태만 처리
    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
        // prop 이름을 camelCase로 변환 (예: "Size" → "size")
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          prop: camelPropName,
          value: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * Dynamic styles를 prop별로 그룹핑
   */
  private _groupDynamicStylesByProp(
    dynamicStyles: Array<{ condition: any; style: Record<string, any> }>
  ): Map<string, Array<{ value: string; style: Record<string, any> }>> {
    const grouped = new Map<
      string,
      Array<{ value: string; style: Record<string, any> }>
    >();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue; // 추출 불가능한 조건은 스킵

      if (!grouped.has(extracted.prop)) {
        grouped.set(extracted.prop, []);
      }

      grouped.get(extracted.prop)!.push({
        value: extracted.value,
        style: dynamicStyle.style,
      });
    }

    return grouped;
  }

  /**
   * CSS 속성 키를 camelCase로 변환
   * "flex-direction" → "flexDirection"
   */
  private _normalizeCssKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  /**
   * CSS 객체 생성 (중복 체크 및 캐싱)
   */
  private _createCssCall(style: Record<string, any>): ts.CallExpression {
    // 스타일 객체를 문자열로 변환하여 캐시 키 생성 (정규화된 키 사용)
    const normalizedStyle: Record<string, any> = {};
    for (const [key, value] of Object.entries(style)) {
      normalizedStyle[this._normalizeCssKey(key)] = value;
    }
    const cacheKey = JSON.stringify(normalizedStyle);

    if (this.cssObjectCache.has(cacheKey)) {
      return this.cssObjectCache.get(cacheKey)!;
    }

    const styleObjectProperties = Object.entries(normalizedStyle).map(
      ([key, value]) =>
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(key),
          this._convertStyleValueToExpression(value)
        )
    );

    const styleObject = this.factory.createObjectLiteralExpression(
      styleObjectProperties,
      true
    );

    const cssCall = this.factory.createCallExpression(
      this.factory.createIdentifier("css"),
      undefined,
      [styleObject]
    );

    this.cssObjectCache.set(cacheKey, cssCall);
    return cssCall;
  }

  /**
   * Variant 스타일 map 생성 (예: sizeStyles: { Large: css({...}), Medium: css({...}) })
   */
  private _createVariantStyleMap(
    mapName: string,
    variants: Array<{ value: string; style: Record<string, any> }>
  ): ts.PropertyAssignment {
    // 객체 리터럴 속성들 생성: { Large: css({...}), Medium: css({...}), ... }
    const variantProperties: ts.PropertyAssignment[] = variants.map(
      (variant) => {
        const cssCall = this._createCssCall(variant.style);

        // 하이픈이나 특수문자가 포함된 경우 computed property 사용
        const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(
          variant.value
        );
        const propertyName = isValidIdentifier
          ? this.factory.createIdentifier(variant.value)
          : this.factory.createStringLiteral(variant.value);

        return this.factory.createPropertyAssignment(
          propertyName,
          cssCall,
          !isValidIdentifier // computed property로 설정
        );
      }
    );

    const variantMapObject = this.factory.createObjectLiteralExpression(
      variantProperties,
      true
    );

    return this.factory.createPropertyAssignment(
      this.factory.createIdentifier(mapName),
      variantMapObject
    );
  }

  /**
   * 스타일 값을 TypeScript Expression으로 변환
   */
  private _convertStyleValueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    return this.factory.createNull();
  }

  /**
   * ESTree AST를 TypeScript Expression으로 변환
   * ConditionNode (BinaryExpression | UnaryExpression | MemberExpression | Literal) → ts.Expression
   */
  private _convertEstreeToTsExpression(estreeNode: any): ts.Expression {
    if (!estreeNode || !estreeNode.type) {
      return this.factory.createTrue(); // fallback
    }

    switch (estreeNode.type) {
      case "BinaryExpression":
        return this._convertBinaryExpression(estreeNode);

      case "UnaryExpression":
        return this._convertUnaryExpression(estreeNode);

      case "MemberExpression":
        return this._convertMemberExpression(estreeNode);

      case "Literal":
        return this._convertLiteral(estreeNode);

      case "LogicalExpression":
        // ESTree의 LogicalExpression (&&, ||)도 BinaryExpression으로 처리
        return this._convertBinaryExpression(estreeNode);

      case "Identifier":
        return this._convertIdentifier(estreeNode);

      default:
        console.warn(
          `Unknown ESTree node type: ${estreeNode.type}`,
          estreeNode
        );
        return this.factory.createTrue(); // fallback
    }
  }

  /**
   * BinaryExpression 변환 (예: props.size === 'L')
   */
  private _convertBinaryExpression(node: any): ts.BinaryExpression {
    const left = this._convertEstreeToTsExpression(node.left);
    const right = this._convertEstreeToTsExpression(node.right);

    const operatorMap: Record<string, ts.SyntaxKind> = {
      "===": ts.SyntaxKind.EqualsEqualsEqualsToken,
      "!==": ts.SyntaxKind.ExclamationEqualsEqualsToken,
      "==": ts.SyntaxKind.EqualsEqualsToken,
      "!=": ts.SyntaxKind.ExclamationEqualsToken,
      "<": ts.SyntaxKind.LessThanToken,
      "<=": ts.SyntaxKind.LessThanEqualsToken,
      ">": ts.SyntaxKind.GreaterThanToken,
      ">=": ts.SyntaxKind.GreaterThanEqualsToken,
      "&&": ts.SyntaxKind.AmpersandAmpersandToken,
      "||": ts.SyntaxKind.BarBarToken,
      "+": ts.SyntaxKind.PlusToken,
      "-": ts.SyntaxKind.MinusToken,
      "*": ts.SyntaxKind.AsteriskToken,
      "/": ts.SyntaxKind.SlashToken,
      "%": ts.SyntaxKind.PercentToken,
    };

    const syntaxKind =
      operatorMap[node.operator] || ts.SyntaxKind.EqualsEqualsEqualsToken;

    return this.factory.createBinaryExpression(
      left,
      (this.factory.createToken as any)(syntaxKind),
      right
    );
  }

  /**
   * UnaryExpression 변환 (예: !props.isOpen)
   */
  private _convertUnaryExpression(node: any): ts.PrefixUnaryExpression {
    const operand = this._convertEstreeToTsExpression(node.argument);
    const operatorKind =
      node.operator === "!"
        ? ts.SyntaxKind.ExclamationToken
        : ts.SyntaxKind.MinusToken;
    const operatorToken = this.factory.createToken(operatorKind);

    return this.factory.createPrefixUnaryExpression(
      operatorToken as any,
      operand
    );
  }

  /**
   * MemberExpression 변환 (예: props.size, props['Left Icon'])
   */
  private _convertMemberExpression(node: any): ts.Expression {
    const object = this._convertEstreeToTsExpression(node.object);

    // computed가 true면 bracket notation (props['Left Icon']), false면 dot notation (props.size)
    if (node.computed) {
      const property = this._convertEstreeToTsExpression(node.property);
      return this.factory.createElementAccessExpression(object, property);
    } else {
      // property가 Identifier인 경우
      const propertyName = node.property.name || node.property;
      return this.factory.createPropertyAccessExpression(
        object,
        this.factory.createIdentifier(propertyName)
      );
    }
  }

  /**
   * Identifier 변환 (예: props, 변수명 등)
   */
  private _convertIdentifier(node: any): ts.Identifier {
    const name = node.name || "unknown";
    return this.factory.createIdentifier(name);
  }

  /**
   * Literal 변환 (string, number, boolean 등)
   */
  private _convertLiteral(node: any): ts.Expression {
    const value = node.value;

    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    if (value === null) {
      return this.factory.createNull();
    }

    // 기본값
    return this.factory.createStringLiteral(String(value));
  }

  /**
   * 조건부 렌더링으로 JSX 요소 감싸기
   */
  private _wrapWithConditionalRendering(
    condition: ts.Expression,
    element: ts.JsxElement | ts.JsxSelfClosingElement
  ): ts.JsxExpression {
    const conditionalExpression = this.factory.createBinaryExpression(
      condition,
      this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
      element
    );

    return this.factory.createJsxExpression(undefined, conditionalExpression);
  }

  /**
   * Dynamic styles에서 공통 속성을 추출하여 base style로 이동
   */
  private _optimizeStyles(node: FinalAstTree): {
    base: Record<string, any>;
    dynamic: Array<{ condition: any; style: Record<string, any> }>;
  } {
    const baseStyle = { ...(node.style.base || {}) };
    const dynamicStyles = node.style.dynamic || [];

    if (dynamicStyles.length === 0) {
      return { base: baseStyle, dynamic: [] };
    }

    // 1. 모든 dynamic styles의 키 수집
    const allDynamicKeys = new Set<string>();
    dynamicStyles.forEach((dynamic) => {
      Object.keys(dynamic.style).forEach((key) => allDynamicKeys.add(key));
    });

    // 2. 각 키에 대해 모든 dynamic styles에서 같은 값인지 확인
    const commonProperties: Record<string, any> = {};

    for (const key of allDynamicKeys) {
      const firstValue = dynamicStyles[0].style[key];
      if (firstValue === undefined) continue;

      // 모든 dynamic styles에서 같은 값인지 확인
      const allSame = dynamicStyles.every(
        (dynamic) => dynamic.style[key] === firstValue
      );

      if (allSame) {
        // 공통 속성 발견 → base로 이동
        commonProperties[key] = firstValue;
      }
    }

    // 3. Base style에 공통 속성 추가
    Object.assign(baseStyle, commonProperties);

    // 4. Dynamic styles에서 공통 속성 제거
    const optimizedDynamic = dynamicStyles
      .map((dynamic) => {
        const optimizedStyle = { ...dynamic.style };
        Object.keys(commonProperties).forEach((key) => {
          delete optimizedStyle[key];
        });
        return {
          condition: dynamic.condition,
          style: optimizedStyle,
        };
      })
      .filter((dynamic) => Object.keys(dynamic.style).length > 0); // 빈 스타일 제거

    return { base: baseStyle, dynamic: optimizedDynamic };
  }
}

export default CreateJsxTree;
