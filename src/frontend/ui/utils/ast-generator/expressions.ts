/**
 * 표현식 관련 AST 생성
 */

import * as ts from "typescript";

/**
 * 바인딩 이름에서 실제 prop 이름 추출
 * "prop:name" 또는 "state:name" → "name"
 */
export function extractBindingName(bindingValue: string): string {
  const colonPos = bindingValue.indexOf(":");
  if (colonPos !== -1 && colonPos < bindingValue.length - 1) {
    return bindingValue.substring(colonPos + 1);
  }
  return bindingValue;
}

/**
 * Visible Expression 파싱
 * "prop:title && state:isOpen" → "title && isOpen"
 */
export function parseVisibleExpression(expression: string): string {
  return expression.replace(/prop:/g, "").replace(/state:/g, "");
}

/**
 * 표현식 문자열을 TypeScript Expression으로 변환
 * 간단한 경우만 처리 (나중에 개선 필요)
 */
export function parseExpressionString(expression: string): ts.Expression {
  // 간단한 식별자나 논리 연산자 처리
  // 복잡한 경우는 TypeScript Compiler API의 parser 사용 고려
  const trimmed = expression.trim();

  // 단순 식별자
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
    return ts.factory.createIdentifier(trimmed);
  }

  // && 연산자 처리 (간단한 경우만)
  if (trimmed.includes("&&")) {
    const parts = trimmed.split("&&").map((p) => p.trim());
    if (parts.length === 2) {
      return ts.factory.createBinaryExpression(
        parseExpressionString(parts[0]),
        ts.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
        parseExpressionString(parts[1]),
      );
    }
  }

  // || 연산자 처리
  if (trimmed.includes("||")) {
    const parts = trimmed.split("||").map((p) => p.trim());
    if (parts.length === 2) {
      return ts.factory.createBinaryExpression(
        parseExpressionString(parts[0]),
        ts.factory.createToken(ts.SyntaxKind.BarBarToken),
        parseExpressionString(parts[1]),
      );
    }
  }

  // 기본값: 식별자로 처리 (에러 가능성 있음)
  return ts.factory.createIdentifier(trimmed);
}
