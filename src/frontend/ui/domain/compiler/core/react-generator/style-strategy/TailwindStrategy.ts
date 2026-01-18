import ts from "typescript";
import { FinalAstTree } from "@compiler";
import { StyleStrategy, DynamicStyleInfo } from "./StyleStrategy";
import { traverseBFS } from "@compiler/utils/traverse";
import { capitalize, normalizeName } from "@compiler/utils/stringUtils";

/**
 * CSS 속성+값 → Tailwind 클래스 매핑 테이블
 * 정확히 일치하는 값만 매핑 (그 외는 arbitrary value로 처리)
 */
const CSS_TO_TAILWIND_MAP: Record<string, Record<string, string>> = {
  // Display
  display: {
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    "inline-grid": "inline-grid",
    block: "block",
    "inline-block": "inline-block",
    inline: "inline",
    none: "hidden",
    contents: "contents",
  },
  // Position
  position: {
    absolute: "absolute",
    relative: "relative",
    fixed: "fixed",
    sticky: "sticky",
    static: "static",
  },
  // Flex Direction
  "flex-direction": {
    row: "flex-row",
    "row-reverse": "flex-row-reverse",
    column: "flex-col",
    "column-reverse": "flex-col-reverse",
  },
  flexDirection: {
    row: "flex-row",
    "row-reverse": "flex-row-reverse",
    column: "flex-col",
    "column-reverse": "flex-col-reverse",
  },
  // Flex Wrap
  "flex-wrap": {
    wrap: "flex-wrap",
    "wrap-reverse": "flex-wrap-reverse",
    nowrap: "flex-nowrap",
  },
  flexWrap: {
    wrap: "flex-wrap",
    "wrap-reverse": "flex-wrap-reverse",
    nowrap: "flex-nowrap",
  },
  // Justify Content
  "justify-content": {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
    start: "justify-start",
    end: "justify-end",
  },
  justifyContent: {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
    start: "justify-start",
    end: "justify-end",
  },
  // Align Items
  "align-items": {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    baseline: "items-baseline",
    stretch: "items-stretch",
    start: "items-start",
    end: "items-end",
  },
  alignItems: {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    baseline: "items-baseline",
    stretch: "items-stretch",
    start: "items-start",
    end: "items-end",
  },
  // Align Self
  "align-self": {
    auto: "self-auto",
    "flex-start": "self-start",
    "flex-end": "self-end",
    center: "self-center",
    stretch: "self-stretch",
    baseline: "self-baseline",
  },
  alignSelf: {
    auto: "self-auto",
    "flex-start": "self-start",
    "flex-end": "self-end",
    center: "self-center",
    stretch: "self-stretch",
    baseline: "self-baseline",
  },
  // Overflow
  overflow: {
    auto: "overflow-auto",
    hidden: "overflow-hidden",
    visible: "overflow-visible",
    scroll: "overflow-scroll",
    clip: "overflow-clip",
  },
  "overflow-x": {
    auto: "overflow-x-auto",
    hidden: "overflow-x-hidden",
    visible: "overflow-x-visible",
    scroll: "overflow-x-scroll",
    clip: "overflow-x-clip",
  },
  overflowX: {
    auto: "overflow-x-auto",
    hidden: "overflow-x-hidden",
    visible: "overflow-x-visible",
    scroll: "overflow-x-scroll",
    clip: "overflow-x-clip",
  },
  "overflow-y": {
    auto: "overflow-y-auto",
    hidden: "overflow-y-hidden",
    visible: "overflow-y-visible",
    scroll: "overflow-y-scroll",
    clip: "overflow-y-clip",
  },
  overflowY: {
    auto: "overflow-y-auto",
    hidden: "overflow-y-hidden",
    visible: "overflow-y-visible",
    scroll: "overflow-y-scroll",
    clip: "overflow-y-clip",
  },
  // Text Align
  "text-align": {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
    start: "text-start",
    end: "text-end",
  },
  textAlign: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
    start: "text-start",
    end: "text-end",
  },
  // Font Style
  "font-style": {
    italic: "italic",
    normal: "not-italic",
  },
  fontStyle: {
    italic: "italic",
    normal: "not-italic",
  },
  // Text Decoration
  "text-decoration": {
    underline: "underline",
    "line-through": "line-through",
    none: "no-underline",
    overline: "overline",
  },
  textDecoration: {
    underline: "underline",
    "line-through": "line-through",
    none: "no-underline",
    overline: "overline",
  },
  // Text Transform
  "text-transform": {
    uppercase: "uppercase",
    lowercase: "lowercase",
    capitalize: "capitalize",
    none: "normal-case",
  },
  textTransform: {
    uppercase: "uppercase",
    lowercase: "lowercase",
    capitalize: "capitalize",
    none: "normal-case",
  },
  // White Space
  "white-space": {
    normal: "whitespace-normal",
    nowrap: "whitespace-nowrap",
    pre: "whitespace-pre",
    "pre-line": "whitespace-pre-line",
    "pre-wrap": "whitespace-pre-wrap",
    "break-spaces": "whitespace-break-spaces",
  },
  whiteSpace: {
    normal: "whitespace-normal",
    nowrap: "whitespace-nowrap",
    pre: "whitespace-pre",
    "pre-line": "whitespace-pre-line",
    "pre-wrap": "whitespace-pre-wrap",
    "break-spaces": "whitespace-break-spaces",
  },
  // Word Break
  "word-break": {
    normal: "break-normal",
    "break-all": "break-all",
    "keep-all": "break-keep",
  },
  wordBreak: {
    normal: "break-normal",
    "break-all": "break-all",
    "keep-all": "break-keep",
  },
  // Visibility
  visibility: {
    visible: "visible",
    hidden: "invisible",
    collapse: "collapse",
  },
  // Pointer Events
  "pointer-events": {
    none: "pointer-events-none",
    auto: "pointer-events-auto",
  },
  pointerEvents: {
    none: "pointer-events-none",
    auto: "pointer-events-auto",
  },
  // Cursor
  cursor: {
    auto: "cursor-auto",
    default: "cursor-default",
    pointer: "cursor-pointer",
    wait: "cursor-wait",
    text: "cursor-text",
    move: "cursor-move",
    help: "cursor-help",
    "not-allowed": "cursor-not-allowed",
    none: "cursor-none",
    grab: "cursor-grab",
    grabbing: "cursor-grabbing",
  },
  // Box Sizing
  "box-sizing": {
    "border-box": "box-border",
    "content-box": "box-content",
  },
  boxSizing: {
    "border-box": "box-border",
    "content-box": "box-content",
  },
  // Object Fit
  "object-fit": {
    contain: "object-contain",
    cover: "object-cover",
    fill: "object-fill",
    none: "object-none",
    "scale-down": "object-scale-down",
  },
  objectFit: {
    contain: "object-contain",
    cover: "object-cover",
    fill: "object-fill",
    none: "object-none",
    "scale-down": "object-scale-down",
  },
  // Flex Shrink / Grow
  "flex-shrink": {
    "0": "flex-shrink-0",
    "1": "flex-shrink",
  },
  flexShrink: {
    "0": "flex-shrink-0",
    "1": "flex-shrink",
  },
  "flex-grow": {
    "0": "flex-grow-0",
    "1": "flex-grow",
  },
  flexGrow: {
    "0": "flex-grow-0",
    "1": "flex-grow",
  },
};

/**
 * CSS 속성 → Tailwind 클래스 접두사 매핑
 * 값이 arbitrary value로 변환될 때 사용
 */
const CSS_PROPERTY_TO_TAILWIND_PREFIX: Record<string, string> = {
  // Sizing
  width: "w",
  "min-width": "min-w",
  "max-width": "max-w",
  minWidth: "min-w",
  maxWidth: "max-w",
  height: "h",
  "min-height": "min-h",
  "max-height": "max-h",
  minHeight: "min-h",
  maxHeight: "max-h",
  // Spacing
  padding: "p",
  "padding-top": "pt",
  "padding-right": "pr",
  "padding-bottom": "pb",
  "padding-left": "pl",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  margin: "m",
  "margin-top": "mt",
  "margin-right": "mr",
  "margin-bottom": "mb",
  "margin-left": "ml",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  gap: "gap",
  "row-gap": "gap-y",
  "column-gap": "gap-x",
  rowGap: "gap-y",
  columnGap: "gap-x",
  // Position
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  inset: "inset",
  // Border
  "border-radius": "rounded",
  borderRadius: "rounded",
  "border-width": "border",
  borderWidth: "border",
  "border-top-width": "border-t",
  "border-right-width": "border-r",
  "border-bottom-width": "border-b",
  "border-left-width": "border-l",
  borderTopWidth: "border-t",
  borderRightWidth: "border-r",
  borderBottomWidth: "border-b",
  borderLeftWidth: "border-l",
  "border-top-left-radius": "rounded-tl",
  "border-top-right-radius": "rounded-tr",
  "border-bottom-left-radius": "rounded-bl",
  "border-bottom-right-radius": "rounded-br",
  borderTopLeftRadius: "rounded-tl",
  borderTopRightRadius: "rounded-tr",
  borderBottomLeftRadius: "rounded-bl",
  borderBottomRightRadius: "rounded-br",
  // Typography
  "font-size": "text",
  fontSize: "text",
  "line-height": "leading",
  lineHeight: "leading",
  "letter-spacing": "tracking",
  letterSpacing: "tracking",
  // Effects
  opacity: "opacity",
  "z-index": "z",
  zIndex: "z",
  // Flex
  flex: "flex",
  "flex-basis": "basis",
  flexBasis: "basis",
  order: "order",
};

/**
 * Tailwind CSS 전략
 * CSS 속성을 Tailwind 유틸리티 클래스로 변환
 */
class TailwindStrategy implements StyleStrategy {
  readonly name = "tailwind" as const;

  private factory: ts.NodeFactory;
  private astTree: FinalAstTree;
  private cnImportPath?: string;
  private inlineCn: boolean;

  /** 노드별 Tailwind 클래스 캐시 */
  private classCache: Map<string, string> = new Map();
  /** 동적 스타일 클래스 맵 (nodeId → prop → value → classes) */
  private dynamicClassMaps: Map<string, Map<string, Map<string, string>>> =
    new Map();
  /** 노드별 생성된 변수명 저장 (nodeId → propName → varName) */
  private nodeClassVarNames: Map<string, Map<string, string>> = new Map();
  /** 변수명 중복 추적용 Map (baseName → 사용 횟수) */
  private usedNames: Map<string, number> = new Map();
  /** 컴포넌트 이름 (루트 노드용) */
  private componentName: string | undefined;

  constructor(
    factory: ts.NodeFactory,
    astTree: FinalAstTree,
    options?: { cnImportPath?: string; inlineCn?: boolean }
  ) {
    this.factory = factory;
    this.astTree = astTree;
    this.cnImportPath = options?.cnImportPath;
    // 기본값: inlineCn = true (의존성 없이 동작)
    this.inlineCn = options?.inlineCn ?? true;

    // 모든 노드의 스타일을 미리 변환
    this._preprocessStyles();
  }

  /**
   * Tailwind import 문 생성
   * inlineCn이 true면 import 없음 (cn 함수를 인라인으로 생성)
   * inlineCn이 false면 import { cn } from 'cnImportPath'
   */
  generateImports(): ts.ImportDeclaration[] {
    // 인라인 cn 사용 시 import 없음
    if (this.inlineCn) {
      return [];
    }

    // 외부 cn import
    return [
      this.factory.createImportDeclaration(
        undefined,
        this.factory.createImportClause(
          false,
          undefined,
          this.factory.createNamedImports([
            this.factory.createImportSpecifier(
              false,
              undefined,
              this.factory.createIdentifier("cn")
            ),
          ])
        ),
        this.factory.createStringLiteral(this.cnImportPath || "@/lib/utils")
      ),
    ];
  }

  /**
   * 스타일 선언부 생성
   * - inlineCn이 true면 cn 함수를 인라인으로 생성
   * - 노드별 동적 스타일용 클래스 맵 생성 (Emotion과 동일한 패턴)
   */
  generateDeclarations(
    _astTree: FinalAstTree,
    componentName: string
  ): ts.Statement[] {
    this.componentName = componentName;
    const statements: ts.Statement[] = [];

    // 인라인 cn 함수 생성
    if (this.inlineCn) {
      statements.push(this._createInlineCnFunction());
    }

    // 노드별로 클래스 맵 변수 생성 (Emotion의 _createRecordObjects와 동일한 패턴)
    traverseBFS(this.astTree, (node) => {
      const propMaps = this.dynamicClassMaps.get(node.id);
      if (!propMaps || propMaps.size === 0) {
        return;
      }

      // 노드별 변수명 맵 초기화
      if (!this.nodeClassVarNames.has(node.id)) {
        this.nodeClassVarNames.set(node.id, new Map());
      }
      const nodeVarNames = this.nodeClassVarNames.get(node.id)!;

      for (const [propName, valueMap] of propMaps.entries()) {
        const properties: ts.PropertyAssignment[] = [];

        // 모든 가능한 variant 값 가져오기 (타입 안전성을 위해)
        const propDef = this.astTree.props[propName];
        const allOptions = (propDef as any)?.variantOptions || [];

        // 모든 옵션에 대해 클래스 할당 (없으면 빈 문자열)
        if (allOptions.length > 0) {
          for (const option of allOptions) {
            const classes = valueMap.get(option) || "";
            properties.push(
              this.factory.createPropertyAssignment(
                this.factory.createStringLiteral(option),
                this.factory.createStringLiteral(classes)
              )
            );
          }
        } else {
          // variantOptions가 없는 경우 기존 값 사용
          for (const [value, classes] of valueMap.entries()) {
            properties.push(
              this.factory.createPropertyAssignment(
                this.factory.createStringLiteral(value),
                this.factory.createStringLiteral(classes)
              )
            );
          }
        }

        // 노드별 고유 변수명 생성 (예: ButtonSizeClasses, LabelSizeClasses)
        const nodeName = this._getNodeBaseName(node);
        const baseName = `${normalizeName(nodeName)}${capitalize(propName)}Classes`;
        const varName = this._generateUniqueVarName(baseName);

        // 변수명 저장
        nodeVarNames.set(propName, varName);

        const objectLiteral = this.factory.createObjectLiteralExpression(
          properties,
          true
        );

        statements.push(
          this.factory.createVariableStatement(
            undefined,
            this.factory.createVariableDeclarationList(
              [
                this.factory.createVariableDeclaration(
                  varName,
                  undefined,
                  undefined,
                  objectLiteral
                ),
              ],
              ts.NodeFlags.Const
            )
          )
        );
      }
    });

    return statements;
  }

  /**
   * 노드의 기본 이름 가져오기 (Emotion의 _getNodeBaseName과 동일)
   */
  private _getNodeBaseName(node: FinalAstTree): string {
    // 루트 노드: componentName 우선 사용
    if (!node.parent) {
      if (this.componentName) {
        return this.componentName;
      }
      if (node.metaData.document) {
        return node.metaData.document.name;
      }
    }

    // 노드 이름이 숫자만 있으면 semanticRole 사용
    const isNumericOnly = /^[0-9]+$/.test(node.name);
    if (isNumericOnly && node.semanticRole) {
      if (node.semanticRole === "container" && node.parent) {
        const parentName = this._getNodeBaseName(node.parent);
        return `${parentName}Child`;
      }
      return node.semanticRole;
    }

    return node.name;
  }

  /**
   * 중복을 피하는 고유한 변수명 생성
   */
  private _generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * className 속성 생성
   */
  createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    const baseClasses = this.classCache.get(node.id) || "";
    const dynamicInfo = this.getDynamicStyleInfo(node);

    // 스타일이 없는 경우
    if (!baseClasses && !dynamicInfo) {
      return null;
    }

    // className 표현식 생성 (노드별 변수명 사용)
    const classExpression = this._buildClassNameExpression(
      node,
      baseClasses,
      dynamicInfo
    );

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("className"),
      this.factory.createJsxExpression(undefined, classExpression)
    );
  }

  /**
   * 동적 스타일 정보 조회
   */
  getDynamicStyleInfo(node: FinalAstTree): DynamicStyleInfo | null {
    const dynamicStyles = node.style.dynamic || [];
    if (dynamicStyles.length === 0) {
      return null;
    }

    const propToVariants = new Map<string, string[]>();
    const variantStyles = new Map<string, string>();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue;

      if (!propToVariants.has(extracted.prop)) {
        propToVariants.set(extracted.prop, []);
      }
      propToVariants.get(extracted.prop)!.push(extracted.value);

      const key = `${extracted.prop}:${extracted.value}`;
      const classes = this._cssObjectToTailwind(dynamicStyle.style);
      variantStyles.set(key, classes);
    }

    return { propToVariants, variantStyles };
  }

  /**
   * 모든 노드의 스타일을 미리 변환
   */
  private _preprocessStyles(): void {
    traverseBFS(this.astTree, (node) => {
      // Base 스타일 변환
      if (node.style.base && Object.keys(node.style.base).length > 0) {
        const classes = this._cssObjectToTailwind(node.style.base);
        this.classCache.set(node.id, classes);
      }

      // Dynamic 스타일 변환
      if (node.style.dynamic && node.style.dynamic.length > 0) {
        const propMap = new Map<string, Map<string, string>>();

        for (const dynamic of node.style.dynamic) {
          const extracted = this._extractPropAndValue(dynamic.condition);
          if (!extracted) continue;

          if (!propMap.has(extracted.prop)) {
            propMap.set(extracted.prop, new Map());
          }

          const classes = this._cssObjectToTailwind(dynamic.style);
          // 같은 prop+value 조합에 여러 스타일이 있을 수 있음 - 덮어쓰기 대신 병합
          const existingClasses =
            propMap.get(extracted.prop)!.get(extracted.value) || "";
          const mergedClasses = (existingClasses + " " + classes).trim();
          propMap.get(extracted.prop)!.set(extracted.value, mergedClasses);
        }

        if (propMap.size > 0) {
          this.dynamicClassMaps.set(node.id, propMap);
        }
      }
    });
  }

  /**
   * CSS 객체를 Tailwind 클래스 문자열로 변환
   */
  private _cssObjectToTailwind(style: Record<string, any>): string {
    const classes: string[] = [];

    for (const [key, value] of Object.entries(style)) {
      const tailwindClass = this._cssPropertyToTailwind(key, value);
      if (tailwindClass) {
        classes.push(tailwindClass);
      }
    }

    return classes.join(" ");
  }

  /**
   * 단일 CSS 속성+값을 Tailwind 클래스로 변환
   */
  private _cssPropertyToTailwind(property: string, value: any): string {
    const valueStr = String(value).trim();

    // 1. 정확히 일치하는 매핑이 있는 경우 (display: flex → flex)
    const exactMap = CSS_TO_TAILWIND_MAP[property];
    if (exactMap && exactMap[valueStr]) {
      return exactMap[valueStr];
    }

    // 2. 특수 값 처리 (100%, auto, 0 등)
    const specialClass = this._handleSpecialValues(property, valueStr);
    if (specialClass) {
      return specialClass;
    }

    // 3. Tailwind 접두사가 있는 속성은 arbitrary value로 변환
    const prefix = CSS_PROPERTY_TO_TAILWIND_PREFIX[property];
    if (prefix) {
      return `${prefix}-[${this._escapeArbitraryValue(valueStr)}]`;
    }

    // 4. 색상 관련 속성
    if (property === "color" || property === "fill") {
      return `[${this._camelToKebab(property)}:${this._escapeArbitraryValue(valueStr)}]`;
    }
    if (property === "backgroundColor" || property === "background-color") {
      return `[background-color:${this._escapeArbitraryValue(valueStr)}]`;
    }
    if (property === "borderColor" || property === "border-color") {
      return `[border-color:${this._escapeArbitraryValue(valueStr)}]`;
    }

    // 5. background shorthand 처리
    if (property === "background") {
      // rgba/hsla/hex 단순 색상 값은 직접 처리 (공백 포함된 rgba 분리 방지)
      if (/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))$/i.test(valueStr)) {
        return `bg-[${this._escapeArbitraryValue(valueStr)}]`;
      }
      // CSS 변수는 arbitrary property로 처리
      if (valueStr.startsWith("var(")) {
        return `[background-color:${this._escapeArbitraryValue(valueStr)}]`;
      }
      // 복잡한 background shorthand
      return this._parseBackgroundShorthand(valueStr).join(" ");
    }

    // 6. 그 외는 arbitrary property로 변환 [property:value]
    const cssKey = this._camelToKebab(property);
    return `[${cssKey}:${this._escapeArbitraryValue(valueStr)}]`;
  }

  /**
   * 특수 값 처리 (100%, auto, 0 등 Tailwind에서 전용 클래스가 있는 값)
   */
  private _handleSpecialValues(property: string, value: string): string | null {
    const prefix = CSS_PROPERTY_TO_TAILWIND_PREFIX[property];
    if (!prefix) return null;

    // width/height 특수 값
    if (property === "width" || property === "minWidth" || property === "maxWidth" ||
        property === "min-width" || property === "max-width") {
      if (value === "100%") return `${prefix}-full`;
      if (value === "auto") return `${prefix}-auto`;
      if (value === "min-content") return `${prefix}-min`;
      if (value === "max-content") return `${prefix}-max`;
      if (value === "fit-content") return `${prefix}-fit`;
      if (value === "100vw") return `${prefix}-screen`;
    }

    if (property === "height" || property === "minHeight" || property === "maxHeight" ||
        property === "min-height" || property === "max-height") {
      if (value === "100%") return `${prefix}-full`;
      if (value === "auto") return `${prefix}-auto`;
      if (value === "min-content") return `${prefix}-min`;
      if (value === "max-content") return `${prefix}-max`;
      if (value === "fit-content") return `${prefix}-fit`;
      if (value === "100vh") return `${prefix}-screen`;
    }

    // 0 값
    if (value === "0" || value === "0px") {
      if (["top", "right", "bottom", "left", "inset"].includes(property)) {
        return `${prefix}-0`;
      }
      if (prefix === "p" || prefix === "m" || prefix === "gap" ||
          prefix.startsWith("p") || prefix.startsWith("m") || prefix.startsWith("gap")) {
        return `${prefix}-0`;
      }
      if (prefix === "rounded") {
        return "rounded-none";
      }
    }

    // 1px 값 (특히 top-px 같은 경우)
    if (value === "1px" && ["top", "right", "bottom", "left"].includes(property)) {
      return `${prefix}-px`;
    }

    return null;
  }

  /**
   * background shorthand를 개별 Tailwind 클래스로 분리
   */
  private _parseBackgroundShorthand(value: string): string[] {
    const classes: string[] = [];

    // url() 추출
    const urlMatch = value.match(/url\([^)]+\)/);
    if (urlMatch) {
      classes.push(`bg-[${urlMatch[0]}]`);
      value = value.replace(urlMatch[0], "").trim();
    }

    // var() 추출 (CSS 변수)
    const varMatch = value.match(/var\([^)]+\)/);
    if (varMatch) {
      classes.push(`[background-color:${this._escapeArbitraryValue(varMatch[0])}]`);
      value = value.replace(varMatch[0], "").trim();
    }

    // 쉼표 제거 (multiple backgrounds 구분자)
    value = value.replace(/,\s*/g, " ").trim();

    // "/" 기준으로 position과 size 분리
    const slashIndex = value.indexOf("/");
    let positionPart = value;
    let sizePart = "";

    if (slashIndex !== -1) {
      positionPart = value.substring(0, slashIndex).trim();
      sizePart = value.substring(slashIndex + 1).trim();
    }

    // position 파트에서 색상과 위치 분리
    const positionTokens = positionPart.split(/\s+/).filter(Boolean);
    for (const token of positionTokens) {
      if (this._isColor(token)) {
        classes.push(`bg-[${token}]`);
      } else if (token.includes("%") || token === "center") {
        classes.push(`bg-[position:${token}]`);
      }
    }

    // size 파트 처리
    if (sizePart) {
      const sizeTokens = sizePart.split(/\s+/).filter(Boolean);
      for (const token of sizeTokens) {
        const bgClass = {
          cover: "bg-cover",
          contain: "bg-contain",
          "no-repeat": "bg-no-repeat",
          repeat: "bg-repeat",
          "repeat-x": "bg-repeat-x",
          "repeat-y": "bg-repeat-y",
        }[token];
        if (bgClass) classes.push(bgClass);
      }
    }

    return classes;
  }

  /**
   * 값이 CSS 색상인지 확인
   */
  private _isColor(value: string): boolean {
    return (
      /^#[0-9a-fA-F]{3,8}$/.test(value) ||
      /^rgba?\(/.test(value) ||
      /^hsla?\(/.test(value) ||
      /^(transparent|currentColor|inherit|initial|unset)$/i.test(value) ||
      /^(black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|lightgray|darkgray|lightgrey|darkgrey)$/i.test(value)
    );
  }

  /**
   * Arbitrary value 이스케이프
   * Tailwind에서 _는 공백으로 변환되므로, 원래 언더스코어는 \_로 이스케이프
   */
  private _escapeArbitraryValue(value: any): string {
    return String(value)
      .replace(/\/\*[\s\S]*?\*\//g, "") // CSS 주석 제거
      .trim()
      .replace(/_/g, "\\_") // 기존 언더스코어 이스케이프
      .replace(/\s+/g, "_") // 공백을 언더스코어로
      .replace(/['"]/g, ""); // 따옴표 제거
  }

  /**
   * className 표현식 빌드 (노드별 변수명 사용)
   */
  private _buildClassNameExpression(
    node: FinalAstTree,
    baseClasses: string,
    dynamicInfo: DynamicStyleInfo | null
  ): ts.Expression {
    const args: ts.Expression[] = [];

    // Base 클래스
    if (baseClasses) {
      args.push(this.factory.createStringLiteral(baseClasses));
    }

    // 동적 클래스 (노드별 변수명 사용)
    if (dynamicInfo) {
      const nodeVarNames = this.nodeClassVarNames.get(node.id);

      for (const [
        propName,
        _variants,
      ] of dynamicInfo.propToVariants.entries()) {
        // 노드별 변수명 조회 (예: ButtonSizeClasses, LabelSizeClasses)
        const varName =
          nodeVarNames?.get(propName) ||
          `${this._sanitizeName(propName)}Classes`;

        // Boolean prop 처리: propName ? "True" : "False" 로 접근
        // (JavaScript에서 boolean을 object key로 사용하면 "true"/"false" 문자열로 변환되어
        //  Figma의 "True"/"False" 키와 일치하지 않기 때문)
        const propDef = this.astTree.props[propName];
        const isBooleanProp = propDef?.type === "BOOLEAN";

        let indexExpression: ts.Expression;
        if (isBooleanProp) {
          // propName ? "True" : "False"
          indexExpression = this.factory.createConditionalExpression(
            this.factory.createIdentifier(propName),
            this.factory.createToken(ts.SyntaxKind.QuestionToken),
            this.factory.createStringLiteral("True"),
            this.factory.createToken(ts.SyntaxKind.ColonToken),
            this.factory.createStringLiteral("False")
          );
        } else {
          indexExpression = this.factory.createIdentifier(propName);
        }

        const elementAccess = this.factory.createElementAccessExpression(
          this.factory.createIdentifier(varName),
          indexExpression
        );

        args.push(elementAccess);
      }
    }

    // cn() 호출 또는 단일 문자열
    if (args.length === 0) {
      return this.factory.createStringLiteral("");
    }

    if (args.length === 1 && ts.isStringLiteral(args[0])) {
      return args[0];
    }

    return this.factory.createCallExpression(
      this.factory.createIdentifier("cn"),
      undefined,
      args
    );
  }

  /**
   * camelCase를 kebab-case로 변환
   */
  private _camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }

  /**
   * 인라인 cn 함수 생성
   * const cn = (...classes: (string | undefined | null | false)[]) =>
   *   classes.filter(Boolean).join(" ");
   */
  private _createInlineCnFunction(): ts.VariableStatement {
    // 파라미터: ...classes: (string | undefined | null | false)[]
    const parameter = this.factory.createParameterDeclaration(
      undefined,
      this.factory.createToken(ts.SyntaxKind.DotDotDotToken),
      this.factory.createIdentifier("classes"),
      undefined,
      this.factory.createArrayTypeNode(
        this.factory.createUnionTypeNode([
          this.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
          this.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
          this.factory.createLiteralTypeNode(this.factory.createNull()),
          this.factory.createLiteralTypeNode(this.factory.createFalse()),
        ])
      ),
      undefined
    );

    // 함수 본문: classes.filter(Boolean).join(" ")
    const body = this.factory.createCallExpression(
      this.factory.createPropertyAccessExpression(
        this.factory.createCallExpression(
          this.factory.createPropertyAccessExpression(
            this.factory.createIdentifier("classes"),
            this.factory.createIdentifier("filter")
          ),
          undefined,
          [this.factory.createIdentifier("Boolean")]
        ),
        this.factory.createIdentifier("join")
      ),
      undefined,
      [this.factory.createStringLiteral(" ")]
    );

    // 화살표 함수: (...classes) => classes.filter(Boolean).join(" ")
    const arrowFunction = this.factory.createArrowFunction(
      undefined,
      undefined,
      [parameter],
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    );

    // const cn = ...
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("cn"),
            undefined,
            undefined,
            arrowFunction
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * 이름 정규화 (변수명으로 사용 가능하게)
   */
  private _sanitizeName(name: string): string {
    return name
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9_$]/g, "")
      .replace(/^[0-9]/, "_$&");
  }

  /**
   * 조건에서 prop과 값 추출
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
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
}

export default TailwindStrategy;
