import ts, { factory, TypeAliasDeclaration } from "typescript";
import type { PropIR, UnifiedNode } from "../../../types";
import type { StyleTreeNode } from "../../../types/styles";
import type { StyleTree } from "../../../types/figma-api";
import { convertStyleToExpression } from "./style-converter";
import { VariantStyleMap } from "@frontend/ui/domain/transpiler/types/variant";

export default class VariantGenerator {
  private _ast: UnifiedNode;
  private _variantStyleMap: VariantStyleMap;

  public nodesTypeAliasDeclars: TypeAliasDeclaration[] = [];

  constructor(ast: UnifiedNode, variantStyleMap: VariantStyleMap) {
    this._ast = ast;
    this._variantStyleMap = variantStyleMap;
  }
  /**
   * variant 및 state 타입 종류 생성.
   */
  public createVariantType() {
    const nodes = Object.entries(this._variantStyleMap)
      .filter(([, styleData]) => styleData !== "SLOT")
      .map(([variantName, styleData]) => {
        // 내부 스타일 객체의 키들(예: "Small", "Large") 추출
        const variantOptions = Object.keys(styleData);

        // 각 옵션을 리터럴 타입 노드로 변환
        const literalTypes = variantOptions.map((option) =>
          factory.createLiteralTypeNode(factory.createStringLiteral(option))
        );

        // Union 타입 생성 ( "Small" | "Large" )
        const unionType = factory.createUnionTypeNode(literalTypes);

        // Type Alias 선언 생성 (export type Size = ...)
        return factory.createTypeAliasDeclaration(
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)], // export 붙이기
          factory.createIdentifier(variantName), // 객체의 Key("Size")를 타입 이름으로 사용
          undefined, // 제네릭 없음
          unionType
        );
      });

    this.nodesTypeAliasDeclars = nodes;

    return this;
  }

  public createGetVariantStyleFunction() {
    return this;
  }

  public createStyledComponent() {
    return this;
  }

  public getResults() {
    return [...this.nodesTypeAliasDeclars];
  }
}

/**
 * StyleTree를 평평한 스타일 객체로 변환
 * 루트 노드의 스타일만 반환 (코드 생성 시 루트 노드 스타일만 필요)
 */
function styleTreeToObject(
  styleTree: StyleTreeNode | StyleTree | null | undefined
): Record<string, any> {
  if (!styleTree) {
    return {};
  }
  // 루트 노드의 스타일만 반환
  if ("style" in styleTree) {
    return (styleTree as StyleTreeNode).style;
  }
  if ("cssStyle" in styleTree) {
    return (styleTree as StyleTree).cssStyle;
  }
  return {};
}

// Helper: css(...) 함수 호출 표현식 생성
function createCssCall(
  factory: ts.NodeFactory,
  objectLiteral: ts.ObjectLiteralExpression
): ts.CallExpression {
  return factory.createCallExpression(
    factory.createIdentifier("css"),
    undefined,
    [objectLiteral]
  );
}

// Helper: StyleTree -> Object Literal Expression (with children styles)
function createStyleObject(
  factory: ts.NodeFactory,
  styleTree: StyleTreeNode | StyleTree | null | undefined
): ts.ObjectLiteralExpression {
  const styleObj = styleTreeToObject(styleTree);

  // 1. 기본 스타일 변환
  const styleExpression = convertStyleToExpression(
    factory,
    styleObj
  ) as ts.ObjectLiteralExpression;

  // 2. 자식 스타일 처리 (Nested Selector)
  const properties = [...styleExpression.properties];

  if (
    styleTree &&
    "children" in styleTree &&
    Array.isArray(styleTree.children)
  ) {
    const children = styleTree.children as StyleTree[];
    for (const child of children) {
      if (!child.cssStyle || Object.keys(child.cssStyle).length === 0) continue;

      // 자식 스타일 객체 생성 (재귀적으로 자식의 자식도 처리됨)
      const childStyleExpr = createStyleObject(factory, child);

      // Nested Selector 생성: "& .node_1234"
      const selector = `& .node_${child.id.replace(/[^a-zA-Z0-9]/g, "_")}`;

      properties.push(
        factory.createPropertyAssignment(
          factory.createStringLiteral(selector),
          childStyleExpr
        )
      );
    }
  }

  return factory.createObjectLiteralExpression(properties, true);
}

/**
 * Variant 이름 정규화 (예: "Left Icon" -> "leftIcon", "Size" -> "size")
 */
function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Variant style 상수 생성
 */
export function createVariantStyleConstants(
  factory: ts.NodeFactory,
  ast: UnifiedNode,
  variantStyleMap: VariantStyleMap
): ts.VariableStatement[] {
  const statements: ts.VariableStatement[] = [];

  for (const [key, variantStyles] of Object.entries(variantStyleMap)) {
    // 1. SLOT은 스타일 상수를 생성하지 않음
    if (variantStyles === "SLOT") continue;

    // 2. :state 처리 (개별 상수로 분리)
    if (key === ":state") {
      for (const [stateName, styleTree] of Object.entries(variantStyles)) {
        // default는 baseStyle로 처리되므로 제외
        if (stateName === "default") continue;
        if (!styleTree) continue;

        // 예: const hoverStyles = css(...)
        const variableName = `${toCamelCase(stateName)}Styles`;

        statements.push(
          factory.createVariableStatement(
            undefined, // export modifier 없음 (파일 내부 const)
            factory.createVariableDeclarationList(
              [
                factory.createVariableDeclaration(
                  factory.createIdentifier(variableName),
                  undefined,
                  undefined,
                  createCssCall(factory, createStyleObject(factory, styleTree))
                ),
              ],
              ts.NodeFlags.Const
            )
          )
        );
      }
      continue;
    }

    // 3. 일반 Variant 처리 (객체로 묶음)
    // 예: const sizeStyles = { Medium: css(...), Large: css(...) }
    const propName = toCamelCase(key);
    const variableName = `${propName}Styles`;

    const properties: ts.ObjectLiteralElementLike[] = [];

    for (const [variantValue, styleTree] of Object.entries(variantStyles)) {
      if (!styleTree) continue;

      properties.push(
        factory.createPropertyAssignment(
          factory.createStringLiteral(variantValue), // Key: "Medium"
          createCssCall(factory, createStyleObject(factory, styleTree)) // Value: css(...)
        )
      );
    }

    statements.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(variableName),
              undefined,
              undefined,
              factory.createObjectLiteralExpression(properties, true)
            ),
          ],
          ts.NodeFlags.Const
        )
      )
    );
  }

  return statements;
}

/**
 * className 속성 생성
 * className={cx(baseStyle, sizeStyles[size], hoverStyles, ...)} 형태
 */
export function createClassNameAttribute(
  factory: ts.NodeFactory,
  propsIR: PropIR[],
  // [수정] 타입 변경 Map<string, VariantStyleIR> -> VariantStyleMap
  variantStyleMap: VariantStyleMap
): ts.JsxAttribute | null {
  // 인자 목록 (cx 함수에 들어갈 아규먼트들)
  const cxArgs: ts.Expression[] = [];

  // 1. baseStyle (항상 포함)
  cxArgs.push(factory.createIdentifier("baseStyle"));

  // 2. Variant Props (sizeStyles[size])
  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");
  for (const variantProp of variantProps) {
    // [수정] .has() -> in 연산자
    if (!(variantProp.originalName in variantStyleMap)) continue;
    // [수정] SLOT 체크
    if (variantStyleMap[variantProp.originalName] === "SLOT") continue;

    const propName = variantProp.normalizedName;
    const mapName = `${propName}Styles`;

    // sizeStyles[props.size] (props.size가 아니라 destructuring된 변수 사용 시 propName)
    const access = factory.createElementAccessExpression(
      factory.createIdentifier(mapName),
      factory.createIdentifier(propName)
    );
    cxArgs.push(access);
  }

  // 3. State Styles (hoverStyles, etc.)
  // [수정] 객체 접근
  const stateVariantStyle = variantStyleMap[":state"];
  if (stateVariantStyle && stateVariantStyle !== "SLOT") {
    const styles = (stateVariantStyle as any).variantStyles || {};
    for (const stateKey of Object.keys(styles)) {
      if (stateKey === "default") continue;

      // 이미 상수로 만들어진 스타일 이름 (예: hoverStyles)
      const styleName = `${stateKey}Styles`;

      // Pseudo-class 스타일은 조건 없이 추가해도 됨
      // (왜냐하면 css({ "&:hover": ... }) 로 정의했기 때문에 hover 될 때만 적용됨)
      // 만약 'disabled' 처럼 Prop에 의해 제어된다면: props.disabled && disabledStyles 처리 필요

      // 여기서는 사용자의 기존 로직(Pseudo-class 매핑)을 따르므로 그냥 추가
      cxArgs.push(factory.createIdentifier(styleName));
    }
  }

  // cx(...) 호출 생성
  const cxCall = factory.createCallExpression(
    factory.createIdentifier("cx"),
    undefined,
    cxArgs
  );

  return factory.createJsxAttribute(
    factory.createIdentifier("className"),
    factory.createJsxExpression(undefined, cxCall)
  );
}
