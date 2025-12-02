import ts from "typescript";
import type { PropIR, VariantStyleIR } from "../../../types";
import type { StyleTreeNode } from "../../../types/styles";
import { convertStyleToExpression } from "./style-converter";

/**
 * Variant style 생성 관련 함수
 */

/**
 * StyleTree를 평평한 스타일 객체로 변환
 * 루트 노드의 스타일만 반환 (코드 생성 시 루트 노드 스타일만 필요)
 */
function styleTreeToObject(
  styleTree: StyleTreeNode | null
): Record<string, any> {
  if (!styleTree) {
    return {};
  }
  // 루트 노드의 스타일만 반환
  return styleTree.style;
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
  styleTree: StyleTreeNode | null
): ts.ObjectLiteralExpression {
  const styleObj = styleTree ? styleTree.style : {};
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
  variantStyleMap?: Map<string, VariantStyleIR>
): ts.VariableStatement[] {
  if (!variantStyleMap) return [];
  const statements: ts.VariableStatement[] = [];

  // VARIANT 타입인 prop들을 찾아서 처리
  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");

  // :state 키가 있는지 확인 (ButtonPrettifierStrategy에서 생성)
  const hasStateStyle = variantStyleMap.has(":state");

  if (variantProps.length === 0 && !hasStateStyle) {
    return statements;
  }

  if (variantStyleMap.size === 0) {
    return statements;
  }

  // baseStyle 계산: 각 variant prop의 defaultValue에 해당하는 variantStyle을 합침
  // baseStyle은 variant prop의 defaultValue에 매칭된 variantStyle의 값을 합친 것이다
  // variantStyles는 delta이므로 baseStyle과 합쳐야 함
  let baseStyleObj: Record<string, any> = {};

  if (variantProps.length > 0) {
    // 먼저 공통 baseStyle 가져오기 (모든 variant prop이 같은 baseStyle 공유)
    const firstVariantStyle = Array.from(variantStyleMap.values())[0];
    if (firstVariantStyle?.baseStyle) {
      baseStyleObj = styleTreeToObject(firstVariantStyle.baseStyle);
    }

    // 각 variant prop의 defaultValue에 해당하는 delta를 baseStyle에 합침
    for (const variantProp of variantProps) {
      const variantStyle = variantStyleMap.get(variantProp.originalName);
      if (!variantStyle) continue;

      // defaultValue 확인
      const defaultValue = variantProp.defaultValue;
      if (defaultValue === undefined || defaultValue === null) {
        continue;
      }

      // defaultValue를 문자열로 변환 (variantOptions는 문자열이므로)
      const defaultValueStr = String(defaultValue);

      // variantStyles에서 defaultValue에 해당하는 delta 가져오기
      const deltaStyleTree = variantStyle.variantStyles[defaultValueStr];
      if (deltaStyleTree) {
        const deltaStyleObj = styleTreeToObject(deltaStyleTree);
        // baseStyle에 delta 합치기
        baseStyleObj = { ...baseStyleObj, ...deltaStyleObj };
      }
    }
  }

  // baseStyle 상수 생성 (항상 생성 - 빈 객체여도)
  const baseStyleExpression = convertStyleToExpression(factory, baseStyleObj);
  const baseStyleConstant = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createIdentifier("baseStyle"),
          undefined,
          undefined,
          baseStyleExpression
        ),
      ],
      ts.NodeFlags.Const
    )
  );
  statements.push(baseStyleConstant);

  // 각 dimension별 스타일 맵 생성 (VARIANT 타입 prop들)
  for (const variantProp of variantProps) {
    const variantStyle = variantStyleMap.get(variantProp.originalName);
    if (!variantStyle) continue;

    const propName = variantProp.normalizedName; // "size", "state" 등
    const mapName = `${propName}Styles`; // "sizeStyles", "stateStyles"

    // 각 옵션 값별 스타일 객체 생성
    const mapProperties: ts.PropertyAssignment[] = [];
    for (const [optionValue, deltaStyleTree] of Object.entries(
      variantStyle.variantStyles
    )) {
      const key = factory.createStringLiteral(optionValue);
      const deltaStyleObj = deltaStyleTree
        ? styleTreeToObject(deltaStyleTree)
        : {};
      const value = convertStyleToExpression(factory, deltaStyleObj);
      mapProperties.push(factory.createPropertyAssignment(key, value));
    }

    const styleMap = factory.createObjectLiteralExpression(mapProperties, true);

    const styleMapConstant = factory.createVariableStatement(
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
    );
    statements.push(styleMapConstant);
  }

  // :state 키가 있는 경우 각 상태별 스타일 상수 생성
  const stateVariantStyle = variantStyleMap.get(":state");
  if (stateVariantStyle) {
    // 각 상태별 스타일 상수 생성 (isDisabled, hover, pressed, default 등)
    for (const [stateKey, deltaStyleTree] of Object.entries(
      stateVariantStyle.variantStyles
    )) {
      // 상태 키를 스타일 상수 이름으로 변환: "isDisabled" → "isDisabledStyles", "hover" → "hoverStyles"
      const styleConstantName = `${stateKey}Styles`;
      const deltaStyleObj = deltaStyleTree
        ? styleTreeToObject(deltaStyleTree)
        : {};

      const styleConstant = factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(styleConstantName),
              undefined,
              undefined,
              convertStyleToExpression(factory, deltaStyleObj)
            ),
          ],
          ts.NodeFlags.Const
        )
      );
      statements.push(styleConstant);
    }
  }

  return statements;
}

/**
 * Variant style 속성 생성
 * css={css({ ...baseStyle, ...defaultStyles, ...sizeStyles[size], { "&:hover": hoverStyles, "&:active": pressedStyles, "&:disabled": disabledStyles } })} 형태로 생성
 */
export function createVariantStyleAttribute(
  factory: ts.NodeFactory,
  propsIR: PropIR[],
  variantStyleMap: Map<string, VariantStyleIR>
): ts.JsxAttribute | null {
  // VARIANT 타입인 prop들을 찾기
  const variantProps = propsIR.filter((prop) => prop.type === "VARIANT");

  // :state 키가 있는지 확인
  const hasStateStyle = variantStyleMap.has(":state");
  const stateVariantStyle = hasStateStyle
    ? variantStyleMap.get(":state")
    : null;

  if (
    (variantProps.length === 0 && !hasStateStyle) ||
    variantStyleMap.size === 0
  ) {
    return null;
  }

  const spreadElements: ts.SpreadAssignment[] = [];

  // baseStyle 추가
  spreadElements.push(
    factory.createSpreadAssignment(factory.createIdentifier("baseStyle"))
  );

  // :state 스타일 처리 - default 스타일을 먼저 적용
  if (stateVariantStyle) {
    const defaultStyleExists = "default" in stateVariantStyle.variantStyles;
    if (defaultStyleExists) {
      const defaultStyleIdentifier = factory.createIdentifier("defaultStyles");
      spreadElements.push(
        factory.createSpreadAssignment(defaultStyleIdentifier)
      );
    }
  }

  // 각 variant prop별로 스타일 맵 참조 추가
  for (const variantProp of variantProps) {
    const variantStyle = variantStyleMap.get(variantProp.originalName);
    if (!variantStyle) continue;

    const propName = variantProp.normalizedName; // "size", "state" 등
    const mapName = `${propName}Styles`; // "sizeStyles", "stateStyles"
    const propIdentifier = factory.createIdentifier(propName);

    // sizeStyles[size] 형태의 표현식 생성
    const styleMapAccess = factory.createElementAccessExpression(
      factory.createIdentifier(mapName),
      propIdentifier
    );

    spreadElements.push(factory.createSpreadAssignment(styleMapAccess));
  }

  // :state 스타일 처리 - CSS 의사 클래스들을 하나의 객체로 합치기
  if (stateVariantStyle) {
    // 상태 키를 CSS 의사 클래스로 매핑
    const stateKeyToPseudoClass: Record<string, string> = {
      hover: "&:hover",
      pressed: "&:active",
      disabled: "&:disabled",
    };

    // CSS 의사 클래스 속성들을 모으기
    const pseudoClassProperties: ts.PropertyAssignment[] = [];

    for (const [stateKey] of Object.entries(stateVariantStyle.variantStyles)) {
      // default는 이미 위에서 처리했으므로 건너뛰기
      if (stateKey === "default") {
        continue;
      }

      const pseudoClass = stateKeyToPseudoClass[stateKey];
      // CSS 의사 클래스가 없는 경우 건너뛰기
      if (!pseudoClass) {
        continue;
      }

      const styleConstantName = `${stateKey}Styles`; // "hoverStyles", "pressedStyles", "disabledStyles" 등
      const styleIdentifier = factory.createIdentifier(styleConstantName);

      // CSS 의사 클래스를 키로 하는 속성 생성: "&:hover": hoverStyles
      const pseudoClassKey = factory.createStringLiteral(pseudoClass);
      const pseudoClassProperty = factory.createPropertyAssignment(
        pseudoClassKey,
        styleIdentifier
      );

      pseudoClassProperties.push(pseudoClassProperty);
    }

    // CSS 의사 클래스들이 있으면 하나의 객체로 합쳐서 spread
    if (pseudoClassProperties.length > 0) {
      const pseudoClassObject = factory.createObjectLiteralExpression(
        pseudoClassProperties,
        true
      );

      spreadElements.push(factory.createSpreadAssignment(pseudoClassObject));
    }
  }

  // 객체 리터럴로 감싸기
  const styleObject = factory.createObjectLiteralExpression(
    spreadElements,
    true
  );

  // css={css({...})} 형태로 생성
  const cssCall = factory.createCallExpression(
    factory.createIdentifier("css"),
    undefined,
    [styleObject]
  );

  return factory.createJsxAttribute(
    factory.createIdentifier("css"),
    factory.createJsxExpression(undefined, cssCall)
  );
}
