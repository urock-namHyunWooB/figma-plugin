/**
 * TailwindStyleStrategy
 *
 * DesignTree용 Tailwind CSS 전략 구현
 * CSS 속성을 Tailwind 유틸리티 클래스로 변환합니다.
 *
 * 생성 예시:
 * ```typescript
 * const cn = (...classes) => classes.filter(Boolean).join(" ");
 *
 * const buttonSizeClasses = {
 *   Large: "p-4 text-lg",
 *   Medium: "p-3 text-base",
 * };
 * ```
 */

import ts from "typescript";
import type {
  DesignTree,
  DesignNode,
  PropDefinition,
  StyleDefinition,
} from "@code-generator/types/architecture";
import type { ConditionNode } from "@code-generator/types/customType";
import type { IStyleStrategy, DynamicStyleInfo } from "./IStyleStrategy";
import { normalizeName, capitalize } from "@code-generator/utils/stringUtils";

/**
 * 조건에서 추출된 prop 정보
 */
interface ExtractedCondition {
  propName: string;
  propValue: string;
}

/**
 * CSS 속성+값 → Tailwind 클래스 매핑 테이블
 */
const CSS_TO_TAILWIND_MAP: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    block: "block",
    "inline-block": "inline-block",
    inline: "inline",
    none: "hidden",
  },
  position: {
    absolute: "absolute",
    relative: "relative",
    fixed: "fixed",
    sticky: "sticky",
    static: "static",
  },
  flexDirection: {
    row: "flex-row",
    column: "flex-col",
  },
  justifyContent: {
    "flex-start": "justify-start",
    "flex-end": "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
  },
  alignItems: {
    "flex-start": "items-start",
    "flex-end": "items-end",
    center: "items-center",
    stretch: "items-stretch",
  },
  overflow: {
    auto: "overflow-auto",
    hidden: "overflow-hidden",
    visible: "overflow-visible",
    scroll: "overflow-scroll",
  },
  textAlign: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify",
  },
};

/**
 * CSS 속성 → Tailwind 클래스 접두사 매핑
 */
const CSS_PROPERTY_TO_PREFIX: Record<string, string> = {
  width: "w",
  minWidth: "min-w",
  maxWidth: "max-w",
  height: "h",
  minHeight: "min-h",
  maxHeight: "max-h",
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  gap: "gap",
  borderRadius: "rounded",
  fontSize: "text",
  lineHeight: "leading",
  opacity: "opacity",
  zIndex: "z",
};

/**
 * Tailwind 전략 옵션
 */
export interface TailwindStrategyOptions {
  /** cn/clsx 함수 import 경로 */
  cnImportPath?: string;
  /** cn 함수를 인라인으로 생성할지 여부 */
  inlineCn?: boolean;
}

class TailwindStyleStrategy implements IStyleStrategy {
  readonly name = "tailwind" as const;

  private factory: ts.NodeFactory;
  private options: TailwindStrategyOptions;

  /** 노드별 Tailwind 클래스 캐시 */
  private classCache: Map<string, string> = new Map();
  /** 동적 클래스 맵 (nodeId → prop → value → classes) */
  private dynamicClassMaps: Map<string, Map<string, Map<string, string>>> = new Map();
  /** 노드별 생성된 변수명 (nodeId → propName → varName) */
  private nodeClassVarNames: Map<string, Map<string, string>> = new Map();
  /** 변수명 중복 추적 */
  private usedNames: Map<string, number> = new Map();
  /** 컴포넌트 이름 */
  private componentName: string | undefined;

  constructor(factory: ts.NodeFactory, options?: TailwindStrategyOptions) {
    this.factory = factory;
    this.options = {
      inlineCn: true,
      ...options,
    };
  }

  /**
   * Tailwind import 문 생성
   */
  generateImports(): ts.ImportDeclaration[] {
    if (this.options.inlineCn) {
      return [];
    }

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
        this.factory.createStringLiteral(this.options.cnImportPath || "@/lib/utils")
      ),
    ];
  }

  /**
   * 스타일 선언부 생성
   */
  generateDeclarations(
    tree: DesignTree,
    componentName: string,
    props: PropDefinition[]
  ): ts.Statement[] {
    this.componentName = componentName;
    const statements: ts.Statement[] = [];

    // 스타일 미리 변환
    this.preprocessStyles(tree.root);

    // 인라인 cn 함수
    if (this.options.inlineCn) {
      statements.push(this.createInlineCnFunction());
    }

    // 동적 클래스 Record 객체 생성
    this.traverseTree(tree.root, (node) => {
      const propMaps = this.dynamicClassMaps.get(node.id);
      if (!propMaps || propMaps.size === 0) return;

      if (!this.nodeClassVarNames.has(node.id)) {
        this.nodeClassVarNames.set(node.id, new Map());
      }
      const nodeVarNames = this.nodeClassVarNames.get(node.id)!;

      for (const [origPropName, valueMap] of propMaps.entries()) {
        // 실제 prop name 사용 (case 일치 보장)
        const matchedProp = props.find((p) => p.name.toLowerCase() === origPropName.toLowerCase());
        const propName = matchedProp?.name || origPropName;

        const properties: ts.PropertyAssignment[] = [];

        for (const [value, classes] of valueMap.entries()) {
          properties.push(
            this.factory.createPropertyAssignment(
              this.factory.createStringLiteral(value),
              this.factory.createStringLiteral(classes)
            )
          );
        }

        const nodeName = this.getNodeBaseName(node, componentName);
        const baseName = `${normalizeName(nodeName)}${capitalize(propName)}Classes`;
        const varName = this.generateUniqueVarName(baseName);

        nodeVarNames.set(propName, varName);

        statements.push(
          this.factory.createVariableStatement(
            undefined,
            this.factory.createVariableDeclarationList(
              [
                this.factory.createVariableDeclaration(
                  varName,
                  undefined,
                  undefined,
                  this.factory.createObjectLiteralExpression(properties, true)
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
   * className={} 속성 생성
   */
  createStyleAttribute(
    node: DesignNode,
    props: PropDefinition[]
  ): ts.JsxAttribute | null {
    const baseClasses = this.classCache.get(node.id) || "";
    const dynamicInfo = this.getDynamicStyleInfo(node, props);

    if (!baseClasses && !dynamicInfo) {
      return null;
    }

    const classExpression = this.buildClassNameExpression(
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
  getDynamicStyleInfo(node: DesignNode, props?: PropDefinition[]): DynamicStyleInfo | null {
    const dynamicStyles = node.styles?.dynamic;
    if (!dynamicStyles || dynamicStyles.length === 0) {
      return null;
    }

    const propToVariants = new Map<string, string[]>();
    const variantStyles = new Map<string, string>();

    for (const { condition, style } of dynamicStyles) {
      const extracted = this.extractCondition(condition);
      if (!extracted) continue;

      // 실제 prop name 사용 (case 일치 보장)
      const matchedProp = props?.find((p) => p.name.toLowerCase() === extracted.propName.toLowerCase());
      const actualPropName = matchedProp?.name || extracted.propName;

      if (!propToVariants.has(actualPropName)) {
        propToVariants.set(actualPropName, []);
      }
      propToVariants.get(actualPropName)!.push(extracted.propValue);

      const key = `${actualPropName}:${extracted.propValue}`;
      const classes = this.cssObjectToTailwind(style);
      variantStyles.set(key, classes);
    }

    return { propToVariants, variantStyles };
  }

  /**
   * CSS 변수 이름 조회 (Tailwind는 사용하지 않음)
   */
  getCssVariableName(_node: DesignNode, _componentName: string): string {
    return "";
  }

  /**
   * 스타일 미리 변환
   */
  private preprocessStyles(root: DesignNode): void {
    this.traverseTree(root, (node) => {
      // Base 스타일 변환
      if (node.styles?.base && Object.keys(node.styles.base).length > 0) {
        const classes = this.cssObjectToTailwind(node.styles.base);
        this.classCache.set(node.id, classes);
      }

      // Dynamic 스타일 변환
      if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
        const propMap = new Map<string, Map<string, string>>();

        for (const { condition, style } of node.styles.dynamic) {
          const extracted = this.extractCondition(condition);
          if (!extracted) continue;

          if (!propMap.has(extracted.propName)) {
            propMap.set(extracted.propName, new Map());
          }

          const classes = this.cssObjectToTailwind(style);
          propMap.get(extracted.propName)!.set(extracted.propValue, classes);
        }

        if (propMap.size > 0) {
          this.dynamicClassMaps.set(node.id, propMap);
        }
      }
    });
  }

  /**
   * CSS 객체를 Tailwind 클래스로 변환
   */
  private cssObjectToTailwind(style: Record<string, string | number>): string {
    const classes: string[] = [];

    for (const [key, value] of Object.entries(style)) {
      const tailwindClass = this.cssPropertyToTailwind(key, String(value));
      if (tailwindClass) {
        classes.push(tailwindClass);
      }
    }

    return classes.join(" ");
  }

  /**
   * 단일 CSS 속성을 Tailwind 클래스로 변환
   */
  private cssPropertyToTailwind(property: string, value: string): string {
    const valueStr = value.trim();

    // kebab-case → camelCase 변환
    const camelProperty = this.kebabToCamel(property);

    // 정확히 일치하는 매핑
    const exactMap = CSS_TO_TAILWIND_MAP[camelProperty];
    if (exactMap && exactMap[valueStr]) {
      return exactMap[valueStr];
    }

    // 100% → w-full/h-full
    if (valueStr === "100%") {
      if (camelProperty === "width") return "w-full";
      if (camelProperty === "height") return "h-full";
    }

    // Tailwind 접두사가 있는 속성
    const prefix = CSS_PROPERTY_TO_PREFIX[camelProperty];
    if (prefix) {
      // borderRadius → rounded-[value]
      if (camelProperty === "borderRadius") {
        return `rounded-[${this.escapeArbitraryValue(valueStr)}]`;
      }
      return `${prefix}-[${this.escapeArbitraryValue(valueStr)}]`;
    }

    // 색상 관련
    if (camelProperty === "color" || camelProperty === "fill") {
      return `[${this.camelToKebab(camelProperty)}:${this.escapeArbitraryValue(valueStr)}]`;
    }
    if (camelProperty === "backgroundColor") {
      return `[background-color:${this.escapeArbitraryValue(valueStr)}]`;
    }
    // background shorthand with CSS variable → use background-color to avoid background-image interpretation
    if (camelProperty === "background" && valueStr.includes("var(")) {
      return `[background-color:${this.escapeArbitraryValue(valueStr)}]`;
    }

    // 기타: arbitrary property
    const cssKey = this.camelToKebab(camelProperty);
    return `[${cssKey}:${this.escapeArbitraryValue(valueStr)}]`;
  }

  /**
   * kebab-case를 camelCase로 변환
   */
  private kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  /**
   * className 표현식 빌드
   */
  private buildClassNameExpression(
    node: DesignNode,
    baseClasses: string,
    dynamicInfo: DynamicStyleInfo | null
  ): ts.Expression {
    const args: ts.Expression[] = [];

    if (baseClasses) {
      args.push(this.factory.createStringLiteral(baseClasses));
    }

    if (dynamicInfo) {
      const nodeVarNames = this.nodeClassVarNames.get(node.id);

      for (const [propName] of dynamicInfo.propToVariants.entries()) {
        const varName = nodeVarNames?.get(propName) ||
          `${normalizeName(propName)}Classes`;

        const elementAccess = this.factory.createElementAccessExpression(
          this.factory.createIdentifier(varName),
          this.factory.createIdentifier(propName)
        );

        args.push(elementAccess);
      }
    }

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
   * 인라인 cn 함수 생성
   */
  private createInlineCnFunction(): ts.VariableStatement {
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

    const arrowFunction = this.factory.createArrowFunction(
      undefined,
      undefined,
      [parameter],
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    );

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
   * ConditionNode에서 prop 이름과 값 추출
   */
  private extractCondition(condition: ConditionNode): ExtractedCondition | null {
    if (!condition) {
      return null;
    }

    // BinaryExpression: props.X === "value"
    if (condition.type === "BinaryExpression") {
      return this.extractFromBinaryExpression(condition as any);
    }

    // LogicalExpression: 복합 조건에서 첫 번째 BinaryExpression 추출
    if (condition.type === "LogicalExpression") {
      return this.extractFromLogicalExpression(condition as any);
    }

    return null;
  }

  /**
   * BinaryExpression에서 prop 추출
   */
  private extractFromBinaryExpression(binaryExpr: any): ExtractedCondition | null {
    // props.X === "value" 형태 처리
    if (
      binaryExpr.operator === "===" &&
      binaryExpr.left?.type === "MemberExpression" &&
      binaryExpr.left.object?.name === "props" &&
      binaryExpr.right?.type === "Literal"
    ) {
      const propName = binaryExpr.left.property?.name;
      const propValue = binaryExpr.right.value;

      if (propName && propValue !== undefined) {
        const camelPropName = propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          propName: camelPropName,
          propValue: String(propValue),
        };
      }
    }

    return null;
  }

  /**
   * LogicalExpression에서 첫 번째 BinaryExpression 추출 (재귀)
   */
  private extractFromLogicalExpression(logicalExpr: any): ExtractedCondition | null {
    // 왼쪽부터 탐색
    if (logicalExpr.left) {
      if (logicalExpr.left.type === "BinaryExpression") {
        return this.extractFromBinaryExpression(logicalExpr.left);
      }
      if (logicalExpr.left.type === "LogicalExpression") {
        return this.extractFromLogicalExpression(logicalExpr.left);
      }
    }

    // 왼쪽에서 못 찾으면 오른쪽 탐색
    if (logicalExpr.right) {
      if (logicalExpr.right.type === "BinaryExpression") {
        return this.extractFromBinaryExpression(logicalExpr.right);
      }
      if (logicalExpr.right.type === "LogicalExpression") {
        return this.extractFromLogicalExpression(logicalExpr.right);
      }
    }

    return null;
  }

  /**
   * 노드의 기본 이름 가져오기
   */
  private getNodeBaseName(node: DesignNode, componentName: string): string {
    if (node.semanticRole === "root") {
      return componentName;
    }

    const isNumericOnly = /^[0-9]+$/.test(node.name);
    if (isNumericOnly && node.semanticRole) {
      return node.semanticRole;
    }

    return node.name;
  }

  /**
   * 고유한 변수명 생성
   */
  private generateUniqueVarName(baseName: string): string {
    const count = this.usedNames.get(baseName) || 0;
    this.usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  }

  /**
   * 트리 순회
   */
  private traverseTree(
    node: DesignNode,
    callback: (node: DesignNode) => void
  ): void {
    callback(node);
    for (const child of node.children) {
      this.traverseTree(child, callback);
    }
  }

  /**
   * Arbitrary value 이스케이프
   */
  private escapeArbitraryValue(value: string): string {
    return value
      .trim()
      .replace(/\/\*.*?\*\//g, "") // Remove CSS comments
      .trim()
      .replace(/_/g, "\\_")
      .replace(/\s+/g, "_")
      .replace(/['"]/g, "");
  }

  /**
   * camelCase를 kebab-case로 변환
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }
}

export default TailwindStyleStrategy;
