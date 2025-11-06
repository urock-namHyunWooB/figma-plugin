import * as Babel from "@babel/standalone";
import * as React from "react";

/**
 * 생성된 React 컴포넌트 코드(문자열)를 실행 가능한 컴포넌트로 변환
 */
export function compileReactComponent(code: string): React.ComponentType<any> {
  try {
    // 1. 컴포넌트 이름 추출 (export default 뒤의 이름) - 먼저 추출
    const exportMatch = code.match(/export\s+default\s+(\w+)/);
    const componentName = exportMatch ? exportMatch[1] : "Component";

    // 2. import 문 제거
    let cleanedCode = code.replace(
      /import\s+.*?from\s+['"]react['"];?\s*/g,
      ""
    );

    // 3. export 문 제거
    cleanedCode = cleanedCode.replace(/export\s+default\s+\w+;?\s*$/m, "");

    // 4. Babel로 JSX → JavaScript 변환
    const transformed = Babel.transform(cleanedCode, {
      presets: [
        ["react", { runtime: "classic" }],
        ["typescript", { isTSX: true, allExtensions: true }],
      ],
      filename: "component.tsx",
    }).code;

    if (!transformed) {
      throw new Error("Babel transformation failed");
    }

    // 5. React를 window에 임시로 저장 (확실한 방법)
    const prevReact = (window as any).React;
    const prevUseState = (window as any).useState;

    try {
      (window as any).React = React;
      (window as any).useState = React.useState;

      // 6. eval로 코드 실행 (window.React를 사용)
      // 전체 코드를 실행하고 컴포넌트 함수를 반환
      // 마지막 표현식이 컴포넌트 이름이므로 바로 반환됨
      const Component = eval(`
        'use strict';
        var React = window.React;
        var useState = window.useState;
        
        ${transformed}
        
        ${componentName}
      `);

      return Component;
    } finally {
      // 7. 원래 값 복원
      if (prevReact !== undefined) {
        (window as any).React = prevReact;
      } else {
        delete (window as any).React;
      }
      if (prevUseState !== undefined) {
        (window as any).useState = prevUseState;
      } else {
        delete (window as any).useState;
      }
    }
  } catch (error) {
    console.error("Component compilation failed:", error);
    console.error("Original code:", code);
    throw new Error(
      `컴포넌트 컴파일 실패: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * 컴포넌트 코드가 유효한지 검증
 */
export function validateComponentCode(code: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    // 기본 검증: export default가 있는지
    if (!code.includes("export default")) {
      return {
        isValid: false,
        error: "export default 문이 없습니다",
      };
    }

    // function 키워드가 있는지
    if (!code.includes("function")) {
      return {
        isValid: false,
        error: "함수 선언이 없습니다",
      };
    }

    // Babel 변환 테스트
    Babel.transform(code, {
      presets: [["react", { runtime: "classic" }], "typescript"],
      filename: "test.tsx",
    });

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    };
  }
}
