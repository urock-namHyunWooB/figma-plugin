import ts from "typescript";

/**
 * 조건부 렌더링 관련 함수
 */

/**
 * visibleExpression을 TypeScript Expression으로 변환
 * 함수 파라미터가 destructuring 형태이므로 prop도 변수명 직접 사용
 * "prop:title && state:isOpen" → title && isOpen
 */
export function parseVisibleExpression(
  factory: ts.NodeFactory,
  expression: string
): ts.Expression {
  // prop:xxx → xxx, state:xxx → xxx로 변환 (둘 다 변수명 직접 사용)
  let processed = expression;

  // prop:xxx → xxx (함수 파라미터가 destructuring이므로)
  processed = processed.replace(
    /prop:([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    (_, name) => {
      return name;
    }
  );

  // state:xxx → xxx (state는 변수명이므로 직접 사용)
  processed = processed.replace(
    /state:([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
    (_, name) => {
      return name;
    }
  );

  // 이제 processed는 "title && isOpen" 같은 형태
  // 이를 TypeScript Expression으로 파싱
  return parseExpressionString(factory, processed);
}

/**
 * 표현식 문자열을 TypeScript Expression으로 변환
 * 간단한 논리 연산자(&&, ||)와 식별자만 처리
 * 함수 파라미터가 destructuring이므로 props.xxx 형태는 사용하지 않음
 */
export function parseExpressionString(
  factory: ts.NodeFactory,
  expression: string
): ts.Expression {
  const trimmed = expression.trim();

  // 단순 식별자 (변수명 직접 사용)
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return factory.createIdentifier(trimmed);
  }

  // && 연산자 처리
  if (trimmed.includes("&&")) {
    const parts = trimmed.split("&&").map((p) => p.trim());
    if (parts.length >= 2) {
      let result = parseExpressionString(factory, parts[0]);
      for (let i = 1; i < parts.length; i++) {
        result = factory.createBinaryExpression(
          result,
          factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
          parseExpressionString(factory, parts[i])
        );
      }
      return result;
    }
  }

  // || 연산자 처리
  if (trimmed.includes("||")) {
    const parts = trimmed.split("||").map((p) => p.trim());
    if (parts.length >= 2) {
      let result = parseExpressionString(factory, parts[0]);
      for (let i = 1; i < parts.length; i++) {
        result = factory.createBinaryExpression(
          result,
          factory.createToken(ts.SyntaxKind.BarBarToken),
          parseExpressionString(factory, parts[i])
        );
      }
      return result;
    }
  }

  // 기본값: 식별자로 처리
  return factory.createIdentifier(trimmed);
}

/**
 * 조건부 렌더링으로 JSX 요소 감싸기
 * {condition && <element>}
 */
export function wrapWithConditionalRendering(
  factory: ts.NodeFactory,
  condition: ts.Expression,
  element: ts.JsxElement | ts.JsxSelfClosingElement
): ts.JsxExpression {
  const conditionalExpression = factory.createBinaryExpression(
    condition,
    factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
    element
  );

  return factory.createJsxExpression(undefined, conditionalExpression);
}

