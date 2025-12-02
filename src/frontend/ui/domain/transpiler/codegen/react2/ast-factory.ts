import * as ts from "typescript";
import { UnifiedNode, VariantValueMap } from "../types";

const f = ts.factory; // AST Factory Shortcut

/**
 * [Helper] kebab-case to camelCase (CSS 속성 변환용)
 * 예: background-color -> backgroundColor
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * [Main] UnifiedNode -> TypeScript SourceFile 변환
 */
export function createComponentSourceFile(root: UnifiedNode): ts.SourceFile {
  // 1. Variant 목록 수집 (Interface 정의용)
  // 실제로는 root에서 전체 variant 목록을 파악하거나 외부에서 주입받아야 함
  const allVariants = Array.from(root.visibleInVariants);

  // 2. Props Interface 정의
  const propsInterface = f.createInterfaceDeclaration(
    [f.createToken(ts.SyntaxKind.ExportKeyword)],
    f.createIdentifier(`${root.name.replace(/\s+/g, "")}Props`),
    undefined,
    undefined,
    [
      f.createPropertySignature(
        undefined,
        f.createIdentifier("variant"),
        f.createToken(ts.SyntaxKind.QuestionToken), // Optional '?'
        f.createUnionTypeNode(
          allVariants.map((v) =>
            f.createLiteralTypeNode(f.createStringLiteral(v))
          )
        )
      ),
      // 필요한 경우 onClick 등의 추가 Prop 정의 가능
    ]
  );

  // 3. Component Function 본문 생성
  const jsxTree = generateJsxTree(root);

  const componentFunc = f.createFunctionDeclaration(
    [f.createToken(ts.SyntaxKind.ExportKeyword)],
    undefined,
    f.createIdentifier(root.name.replace(/\s+/g, "")),
    undefined,
    [
      f.createParameterDeclaration(
        undefined,
        undefined,
        f.createIdentifier("props"),
        undefined,
        f.createTypeReferenceNode(
          f.createIdentifier(`${root.name.replace(/\s+/g, "")}Props`),
          undefined
        ),
        undefined
      ),
    ],
    undefined,
    f.createBlock(
      [
        // const { variant = 'Default' } = props;
        f.createVariableStatement(
          undefined,
          f.createVariableDeclarationList(
            [
              f.createVariableDeclaration(
                f.createObjectBindingPattern([
                  f.createBindingElement(
                    undefined,
                    undefined,
                    f.createIdentifier("variant"),
                    f.createStringLiteral(allVariants[0] || "Default") // Fallback Value
                  ),
                ]),
                undefined,
                undefined,
                f.createIdentifier("props")
              ),
            ],
            ts.NodeFlags.Const
          )
        ),
        f.createReturnStatement(jsxTree),
      ],
      true
    )
  );

  // 4. Source File 생성
  return f.createSourceFile(
    [
      // import React from 'react';
      f.createImportDeclaration(
        undefined, // [수정됨] modifiers (예: export, declare 등. 여기선 없음)
        f.createImportClause(
          false, // isTypeOnly (import type ... 아님)
          f.createIdentifier("React"), // name (default import)
          undefined // namedBindings ( { Component } 같은 것 없음)
        ),
        f.createStringLiteral("react"), // moduleSpecifier (경로)
        undefined // attributes (assert { type: ... } 없음)
      ),
      propsInterface,
      componentFunc,
    ],
    f.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None
  );
}

/**
 * [Recursive] UnifiedNode -> TS JSX Element
 */
function generateJsxTree(node: UnifiedNode): ts.Expression {
  // 1. Tag Name Decision
  let tagName = "div";
  if (node.type === "TEXT") tagName = "span";
  // 인스턴스인 경우 컴포넌트 이름 사용 (공백 제거)
  if (node.type === "INSTANCE") tagName = node.name.replace(/\s+/g, "");

  const attributes: ts.JsxAttributeLike[] = [];

  // ---------------------------------------------------------
  // [A] 스타일 속성 수집 및 재조립 (Style Regrouping)
  // Module 3에서 쪼개진 style.* 속성들을 다시 style={{...}} 객체로 뭉침
  // ---------------------------------------------------------
  const styleProps: Record<string, VariantValueMap<any>> = {};

  Object.keys(node.props).forEach((key) => {
    if (key.startsWith("style.")) {
      const cssPropName = toCamelCase(key.replace("style.", ""));
      styleProps[cssPropName] = node.props[key];
    }
  });

  if (Object.keys(styleProps).length > 0) {
    const styleProperties: ts.ObjectLiteralElementLike[] = [];

    Object.keys(styleProps).forEach((cssKey) => {
      const valueMap = styleProps[cssKey];
      // 값이 하나면 정적 값, 여러 개면 삼항 연산자(Ternary) 생성
      const expr = createConditionalExpression(valueMap);

      if (expr) {
        styleProperties.push(
          f.createPropertyAssignment(f.createIdentifier(cssKey), expr)
        );
      }
    });

    // style={{ ... }} 속성 추가
    attributes.push(
      f.createJsxAttribute(
        f.createIdentifier("style"),
        f.createJsxExpression(
          undefined,
          f.createObjectLiteralExpression(styleProperties, true) // Multi-line formatting
        )
      )
    );
  }

  // ---------------------------------------------------------
  // [B] 일반 Props 처리 (Text Content 등)
  // ---------------------------------------------------------
  let textExpr: ts.Expression | null = null;

  Object.keys(node.props).forEach((key) => {
    // style과 textContent는 이미 처리했거나 별도 처리하므로 패스
    if (key.startsWith("style.") || key === "textContent") return;

    const valueMap = node.props[key];
    const expr = createConditionalExpression(valueMap);

    if (expr) {
      attributes.push(
        f.createJsxAttribute(
          f.createIdentifier(key),
          f.createJsxExpression(undefined, expr)
        )
      );
    }
  });

  // Text Content 처리
  if (node.type === "TEXT" && node.props["textContent"]) {
    textExpr = createConditionalExpression(node.props["textContent"]);
  }

  // ---------------------------------------------------------
  // [C] Children Generation (Recursion)
  // ---------------------------------------------------------
  const childrenJsx: ts.JsxChild[] = [];

  if (textExpr) {
    childrenJsx.push(f.createJsxExpression(undefined, textExpr));
  } else {
    node.children.forEach((child) => {
      const childNode = generateJsxTree(child);

      // [Visibility Logic]
      // 이 자식이 모든 Variant에서 보이는 게 아니라면 조건부 렌더링 추가
      // (간소화 로직: visible set 크기로 판단. 실제로는 전체 variants와 비교 필요)
      // 여기서는 예시로 Set 크기가 1개일 때만 조건부라고 가정
      const isConditional = child.visibleInVariants.size < 2;

      if (isConditional) {
        // 조건식 생성: (variant === 'A' || variant === 'B')
        const conditions = Array.from(child.visibleInVariants).map((v) =>
          f.createBinaryExpression(
            f.createIdentifier("variant"),
            f.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            f.createStringLiteral(v)
          )
        );

        let conditionExpr: ts.Expression = conditions[0];
        // 여러 조건 OR로 연결
        for (let i = 1; i < conditions.length; i++) {
          conditionExpr = f.createBinaryExpression(
            conditionExpr,
            f.createToken(ts.SyntaxKind.BarBarToken),
            conditions[i]
          );
        }

        // { (conditions) && <Child /> }
        childrenJsx.push(
          f.createJsxExpression(
            undefined,
            f.createBinaryExpression(
              f.createParenthesizedExpression(conditionExpr),
              f.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
              childNode as ts.Expression
            )
          )
        );
      } else {
        childrenJsx.push(childNode as any);
      }
    });
  }

  // 4. Final JSX Element Return
  return f.createJsxElement(
    f.createJsxOpeningElement(
      f.createIdentifier(tagName),
      undefined,
      f.createJsxAttributes(attributes)
    ),
    childrenJsx,
    f.createJsxClosingElement(f.createIdentifier(tagName))
  );
}

/**
 * [Helper] Variant Map -> Nested Ternary Expression AST
 * Input: { "A": "red", "B": "blue" }
 * Output AST: variant === 'A' ? 'red' : 'blue'
 */
// src/generator/ast-factory.ts

/**
 * [Helper] Variant Map -> Nested Ternary Expression AST
 * Input: { "A": "red", "B": "blue" }
 * Output AST: variant === 'A' ? 'red' : 'blue'
 */
function createConditionalExpression(
  map: VariantValueMap<any>
): ts.Expression | null {
  const variants = Object.keys(map);
  const values = Object.values(map);

  if (values.length === 0) return null;

  // 1. 모든 값이 같은지 확인 (Robust Check)
  // JSON.stringify로 비교하되, 파싱은 하지 않고 원본(values[0])을 사용합니다.
  const firstValueString = JSON.stringify(values[0]);
  const isAllSame = values.every((v) => JSON.stringify(v) === firstValueString);

  if (isAllSame) {
    // 모든 값이 같으면 정적 값(첫 번째 값)을 그대로 반환
    return createLiteral(values[0]);
  }

  // 2. 값이 다르면 중첩 삼항 연산자 생성
  let expr: ts.Expression = f.createNull();

  // 뒤에서부터 조립 (Nested structure)
  for (let i = variants.length - 1; i >= 0; i--) {
    const v = variants[i];
    const val = map[v];
    const valNode = createLiteral(val);

    if (i === variants.length - 1) {
      expr = valNode; // 마지막 값은 else 케이스로 사용 (Default)
    } else {
      expr = f.createConditionalExpression(
        f.createBinaryExpression(
          f.createIdentifier("variant"),
          f.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          f.createStringLiteral(v)
        ),
        f.createToken(ts.SyntaxKind.QuestionToken),
        valNode,
        f.createToken(ts.SyntaxKind.ColonToken),
        expr
      );
    }
  }
  return expr;
}

// 단순 값을 AST 리터럴 노드로 변환 (undefined/null 방어 로직 추가)
function createLiteral(val: any): ts.Expression {
  if (val === undefined || val === null) {
    return f.createNull();
  }
  if (typeof val === "string") return f.createStringLiteral(val);
  if (typeof val === "number") return f.createNumericLiteral(val);
  if (typeof val === "boolean") return val ? f.createTrue() : f.createFalse();

  // 객체나 배열인 경우 (예: padding object) 처리 필요 시 추가 확장 가능
  // 여기서는 안전하게 null 처리
  return f.createNull();
}
