import ts from "typescript";
import type { PropIR, VariantStyleIR } from "../../../types";
import type { StyleTreeNode } from "../../../types/styles";
import type { StyleTree } from "../../../types/figma-api";
import { convertStyleToExpression } from "./style-converter";
import { VariantStyleMap } from "@frontend/ui/domain/transpiler/types/variant";

/**
 * Variant style 생성 관련 함수
 */

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

// Helper: StyleTree -> Object Literal Expression
function createStyleObject(
  factory: ts.NodeFactory,
  styleTree: StyleTreeNode | StyleTree | null | undefined
): ts.ObjectLiteralExpression {
  const styleObj = styleTreeToObject(styleTree);
  return convertStyleToExpression(
    factory,
    styleObj
  ) as ts.ObjectLiteralExpression;
}

/**
 * Variant style 상수 생성
 * baseStyle과 dimension별 스타일 맵을 생성
 */
export function createVariantStyleConstants(
  factory: ts.NodeFactory,
  propsIR: PropIR[],
  variantStyleMap: VariantStyleMap
): ts.VariableStatement[] {
  // [수정] .size 대신 Object.keys().length 사용
  if (!variantStyleMap || Object.keys(variantStyleMap).length === 0) return [];
  const statements: ts.VariableStatement[] = [];

  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");
  // [수정] .has() 대신 in 연산자 사용
  const hasStateStyle = ":state" in variantStyleMap;

  if (variantProps.length === 0 && !hasStateStyle) return statements;

  // 1. Base Style Calculation (기존 로직 유지)
  let baseStyleObj: Record<string, any> = {};

  if (variantProps.length > 0) {
    // [수정] Map.values() 대신 Object.values() 사용 및 SLOT 필터링
    // 모든 variant prop이 같은 baseStyle 공유한다고 가정하고, 첫 번째 유효한 객체를 찾음
    const firstValidVariantStyle = Object.values(variantStyleMap).find(
      (val) => val !== "SLOT" && typeof val === "object"
    ) as any; // 타입 정의 불일치 회피를 위해 any 사용

    if (firstValidVariantStyle?.baseStyle) {
      baseStyleObj = styleTreeToObject(firstValidVariantStyle.baseStyle);
    }

    // 각 variant prop의 defaultValue에 해당하는 delta를 baseStyle에 합침
    for (const variantProp of variantProps) {
      // [수정] .get() 대신 객체 프로퍼티 접근
      const variantStyle = variantStyleMap[variantProp.originalName];

      // [수정] SLOT 체크 추가
      if (!variantStyle || variantStyle === "SLOT") continue;

      // defaultValue 확인
      const defaultValue = variantProp.defaultValue;
      if (defaultValue === undefined || defaultValue === null) {
        continue;
      }

      // defaultValue를 문자열로 변환 (variantOptions는 문자열이므로)
      const defaultValueStr = String(defaultValue);

      // [수정] any 캐스팅으로 타입 에러 방지 (실제 런타임엔 variantStyles가 존재함)
      const styleAny = variantStyle as any;

      const deltaStyleTree = styleAny.variantStyles?.[defaultValueStr];
      if (deltaStyleTree) {
        const deltaStyleObj = styleTreeToObject(deltaStyleTree);
        // baseStyle에 delta 합치기
        baseStyleObj = { ...baseStyleObj, ...deltaStyleObj };
      }
    }
  }

  // [수정] const baseStyle = css({ ... });
  const baseStyleExpr = convertStyleToExpression(factory, baseStyleObj);
  const baseStyleConstant = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createIdentifier("baseStyle"),
          undefined,
          undefined,
          createCssCall(factory, baseStyleExpr as ts.ObjectLiteralExpression) // css()로 감싸기
        ),
      ],
      ts.NodeFlags.Const
    )
  );
  statements.push(baseStyleConstant);

  // 2. Dimension Styles (Size, etc.)
  for (const variantProp of variantProps) {
    // [수정] 객체 접근
    const variantStyle = variantStyleMap[variantProp.originalName];
    if (!variantStyle || variantStyle === "SLOT") continue;

    const mapName = `${variantProp.normalizedName}Styles`;
    const mapProperties: ts.PropertyAssignment[] = [];

    // [수정] 타입 캐스팅
    const styles = (variantStyle as any).variantStyles || {};

    for (const [optionValue, deltaStyleTree] of Object.entries(styles) as [
      string,
      any,
    ][]) {
      const key = factory.createStringLiteral(optionValue);
      // [수정] 값도 css({ ... }) 호출로 변환
      const styleExpr = createStyleObject(factory, deltaStyleTree);
      const cssCall = createCssCall(factory, styleExpr);

      mapProperties.push(factory.createPropertyAssignment(key, cssCall));
    }

    const styleMap = factory.createObjectLiteralExpression(mapProperties, true);
    statements.push(
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(mapName),
              undefined,
              undefined,
              styleMap
            ),
          ],
          ts.NodeFlags.Const
        )
      )
    );
  }

  // 3. State Styles (Pseudo-classes)
  // [수정] 객체 접근
  const stateVariantStyle = variantStyleMap[":state"];
  if (stateVariantStyle && stateVariantStyle !== "SLOT") {
    const stateKeyToPseudoClass: Record<string, string> = {
      hover: "&:hover",
      pressed: "&:active",
      disabled: "&:disabled",
      // focus 등 추가 가능
    };

    // [수정] 타입 캐스팅
    const styles = (stateVariantStyle as any).variantStyles || {};

    for (const [stateKey, deltaStyleTree] of Object.entries(styles) as [
      string,
      any,
    ][]) {
      if (stateKey === "default") continue; // Default는 baseStyle에 포함됨

      const styleConstantName = `${stateKey}Styles`;
      const styleExpr = createStyleObject(factory, deltaStyleTree);

      const pseudoClass = stateKeyToPseudoClass[stateKey];
      let finalExpr: ts.Expression = styleExpr;

      // [핵심 수정] Pseudo-class가 있다면 객체를 한 번 더 감쌈
      // 예: const hoverStyles = css({ "&:hover": { ...style } });
      if (pseudoClass) {
        finalExpr = factory.createObjectLiteralExpression(
          [
            factory.createPropertyAssignment(
              factory.createStringLiteral(pseudoClass),
              styleExpr
            ),
          ],
          true
        );
      }

      statements.push(
        factory.createVariableStatement(
          undefined,
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                factory.createIdentifier(styleConstantName),
                undefined,
                undefined,
                createCssCall(factory, finalExpr as ts.ObjectLiteralExpression)
              ),
            ],
            ts.NodeFlags.Const
          )
        )
      );
    }
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
