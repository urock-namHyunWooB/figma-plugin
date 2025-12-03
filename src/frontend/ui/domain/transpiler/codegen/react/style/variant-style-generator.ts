import ts, { factory, TypeAliasDeclaration } from "typescript";
import type { PropIR, UnifiedNode } from "../../../types";
import type { StyleTreeNode } from "../../../types/styles";
import type { StyleTree } from "../../../types/figma-api";
import { convertStyleToExpression } from "./style-converter";
import { VariantStyleMap } from "@frontend/ui/domain/transpiler/types/variant";

export default class VariantGenerator {
  private _ast: UnifiedNode;
  private _variantStyleMap: VariantStyleMap;

  public nodesTypeAliasDeclares: TypeAliasDeclaration[] = [];
  public nodesVariantFunctionDeclares: ts.FunctionDeclaration[] = [];
  public nodeStyledComponentDeclare: ts.VariableStatement | null = null;

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

    this.nodesTypeAliasDeclares = nodes;

    return this;
  }

  public createGetVariantStyleFunction() {
    const nodes = Object.entries(this._variantStyleMap)
      .filter(
        ([variantName, styleData]) =>
          styleData !== "SLOT" && variantName !== ":state"
      )
      .map(([variantName, styleData]) => {
        // 1. 함수 이름 생성: get{VariantName}Styles
        const camelName = toCamelCase(variantName);
        const pascalName =
          camelName.charAt(0).toUpperCase() + camelName.slice(1);

        const functionName = `get${pascalName}Styles`;
        const paramName = camelName;

        // 2. Switch Case 생성
        const cases: ts.CaseClause[] = [];

        // styleData: { "Medium": StyleTree, "Large": StyleTree }
        for (const [optionName, styleTree] of Object.entries(styleData)) {
          if (!styleTree) continue;

          // return css(...)
          const returnStmt = factory.createReturnStatement(
            createCssCall(factory, createStyleObject(factory, styleTree))
          );

          // case "Medium": return ...
          cases.push(
            factory.createCaseClause(factory.createStringLiteral(optionName), [
              returnStmt,
            ])
          );
        }

        // default: return css``;
        const defaultClause = factory.createDefaultClause([
          factory.createReturnStatement(
            createCssCall(
              factory,
              factory.createObjectLiteralExpression([], false)
            )
          ),
        ]);

        // 3. 함수 선언 생성
        // export function getSizeStyles(size: Size) {
        //   switch(size) { ... }
        // }
        return factory.createFunctionDeclaration(
          [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          undefined,
          factory.createIdentifier(functionName),
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier(paramName),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier(variantName)
              ),
              undefined
            ),
          ],
          undefined,
          factory.createBlock(
            [
              factory.createSwitchStatement(
                factory.createIdentifier(paramName),
                factory.createCaseBlock([...cases, defaultClause])
              ),
            ],
            true
          )
        );
      });

    this.nodesVariantFunctionDeclares = nodes;

    return this;
  }

  public createStyledComponent() {
    // 1. AST에서 공통 base 스타일 추출
    const baseStyle = this.extractCommonBaseStyle();

    // 2. 컴포넌트 이름 생성
    const componentName = "Component";
    const styledComponentName = `Styled${toPascalCase(componentName)}`;

    // 3. Variant props 수집 (SLOT 제외, :state 제외)
    const variantProps = Object.entries(this._variantStyleMap)
      .filter(([key, value]) => value !== "SLOT" && key !== ":state")
      .map(([variantName]) => ({
        propName: `${toCamelCase(variantName)}Variant`,
        typeName: variantName,
      }));

    // 4. Generic 타입 파라미터 생성: { sizeVariant: Size; stateVariant: State; }
    const typeProperties = variantProps.map(({ propName, typeName }) =>
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier(propName),
        undefined,
        factory.createTypeReferenceNode(factory.createIdentifier(typeName))
      )
    );

    const genericType = factory.createTypeLiteralNode(typeProperties);

    // 5. Base 스타일을 CSS 문자열로 변환
    const baseCssString = objectToCssString(baseStyle);

    // 6. Variant interpolation 생성
    // ${({ sizeVariant }) => getSizeStyles(sizeVariant)}
    const interpolations = variantProps.map(({ propName, typeName }) => {
      const camelName = toCamelCase(typeName);
      const pascalName = camelName.charAt(0).toUpperCase() + camelName.slice(1);
      const functionName = `get${pascalName}Styles`;

      // Arrow function: ({ propName }) => getFunctionName(propName)
      return factory.createArrowFunction(
        undefined,
        undefined,
        [
          factory.createParameterDeclaration(
            undefined,
            undefined,
            factory.createObjectBindingPattern([
              factory.createBindingElement(
                undefined,
                undefined,
                factory.createIdentifier(propName),
                undefined
              ),
            ]),
            undefined,
            undefined,
            undefined
          ),
        ],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createCallExpression(
          factory.createIdentifier(functionName),
          undefined,
          [factory.createIdentifier(propName)]
        )
      );
    });

    // 7. Template Literal 생성
    let templateExpression: ts.TemplateLiteral;

    if (interpolations.length === 0) {
      // interpolation이 없으면 NoSubstitutionTemplateLiteral
      templateExpression = factory.createNoSubstitutionTemplateLiteral(
        baseCssString,
        baseCssString
      );
    } else {
      // interpolation이 있으면 TemplateExpression
      const spans: ts.TemplateSpan[] = interpolations.map((arrowFn, index) => {
        const isLast = index === interpolations.length - 1;
        const templatePart = isLast
          ? factory.createTemplateTail("\n", "\n")
          : factory.createTemplateMiddle("\n  ", "\n  ");

        return factory.createTemplateSpan(arrowFn, templatePart);
      });

      templateExpression = factory.createTemplateExpression(
        factory.createTemplateHead(
          baseCssString + "\n\n  /* Dynamic Styles */\n  ",
          baseCssString + "\n\n  /* Dynamic Styles */\n  "
        ),
        spans
      );
    }

    // 8. Tagged Template Expression 생성: styled.button<{...}>`...`
    const styledAccess = factory.createPropertyAccessExpression(
      factory.createIdentifier("styled"),
      factory.createIdentifier("button") // TODO: HTML 태그 결정 로직 추가
    );

    const taggedTemplate = factory.createTaggedTemplateExpression(
      factory.createExpressionWithTypeArguments(styledAccess, [genericType]),
      undefined,
      templateExpression
    );

    // 9. const StyledButton = styled.button<{...}>`...`
    this.nodeStyledComponentDeclare = factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier(styledComponentName),
            undefined,
            undefined,
            taggedTemplate
          ),
        ],
        ts.NodeFlags.Const
      )
    );

    return this;
  }

  /**
   * AST의 모든 variant 조합에서 공통인 스타일만 추출 (교집합)
   */
  private extractCommonBaseStyle(): Record<string, string> {
    const styleMap = this._ast.props["style"] as
      | Record<string, Record<string, string>>
      | undefined;

    if (!styleMap) {
      return {};
    }

    const allStyles = Object.values(styleMap);
    if (allStyles.length === 0) {
      return {};
    }

    // 첫 번째 스타일을 기준으로 시작
    const firstStyle = allStyles[0];
    const commonStyle: Record<string, string> = {};

    // 첫 번째 스타일의 각 속성에 대해
    for (const [key, value] of Object.entries(firstStyle)) {
      // 모든 variant에서 동일한 값을 가지는지 확인
      const isCommon = allStyles.every((style) => style[key] === value);

      if (isCommon) {
        commonStyle[key] = value;
      }
    }

    return commonStyle;
  }

  public getResults() {
    const results: ts.Statement[] = [
      ...this.nodesTypeAliasDeclares,
      ...this.nodesVariantFunctionDeclares,
    ];

    if (this.nodeStyledComponentDeclare) {
      results.push(this.nodeStyledComponentDeclare);
    }

    return results;
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
 * PascalCase 변환 (예: "left icon" -> "LeftIcon", "size" -> "Size")
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/**
 * 스타일 객체를 CSS 문자열로 변환
 * { display: "flex", "flex-direction": "row" } -> "display: flex;\n  flex-direction: row;"
 */
function objectToCssString(styleObj: Record<string, string>): string {
  const lines = Object.entries(styleObj).map(([key, value]) => {
    // camelCase를 kebab-case로 변환
    const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    return `${kebabKey}: ${value};`;
  });

  return lines.length > 0 ? "\n  " + lines.join("\n  ") + "\n" : "";
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
