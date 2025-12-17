import * as Babel from "@babel/standalone";
import * as React from "react";

// emotion을 동적으로 import (설치되지 않았을 수 있음)
let emotionModule: any = null;
let emotionCss: any = null;
let emotionJsx: any = null;
let emotionCx: any = null;

async function loadEmotion() {
  if (emotionModule) return emotionModule;
  
  // 생성된 코드는 @emotion/css를 사용하므로, @emotion/css를 먼저 로드
  try {
    const emotionCssModule = await import("@emotion/css");
    emotionCss = emotionCssModule.css; // 클래스 이름 문자열을 반환하는 함수
    emotionCx = emotionCssModule.cx;
    
    // @emotion/react도 로드 시도 (jsx runtime용)
    try {
      emotionModule = await import("@emotion/react");
      emotionJsx = emotionModule.jsx;
    } catch (e) {
      // @emotion/react가 없어도 @emotion/css만으로 작동 가능
      emotionJsx = null;
    }
    
    return emotionCssModule;
  } catch (e) {
    // @emotion/css가 없으면 @emotion/react 시도
    try {
      emotionModule = await import("@emotion/react");
      emotionCss = emotionModule.css;
      emotionJsx = emotionModule.jsx;
      // @emotion/react에는 cx가 없을 수 있으므로 fallback
      emotionCx = (...args: any[]) => args.filter(Boolean).join(" ");
      return emotionModule;
    } catch (e2) {
      // emotion이 설치되지 않은 경우 fallback
      emotionCss = (styles: any) => styles;
      emotionCx = (...args: any[]) => args.filter(Boolean).join(" ");
      emotionJsx = null;
      return null;
    }
  }
}

// 미리 로드
loadEmotion();

/**
 * 생성된 React 컴포넌트 코드(문자열)를 실행 가능한 컴포넌트로 변환
 */
export async function compileReactComponent(
  code: string
): Promise<React.ComponentType<any>> {
  // emotion이 로드되었는지 확인하고 필요하면 대기
  await loadEmotion();

  try {
    // 1. 컴포넌트 이름 추출
    // export default ComponentName 형식 또는 export function ComponentName 형식 지원
    // 또는 function ComponentName ... export default ComponentName 형식 지원
    let componentName = "Component";
    
    // export default function ComponentName 형식을 먼저 체크 (function 키워드가 있으면 function을 캡처하지 않도록)
    const exportDefaultFunctionMatch = code.match(/export\s+default\s+function\s+(\w+)\s*\(/);
    const exportDefaultMatch = code.match(/export\s+default\s+(\w+)/);
    const exportFunctionMatch = code.match(/export\s+function\s+(\w+)\s*\(/);
    const functionMatch = code.match(/function\s+(\w+)\s*\(/);

    if (exportDefaultFunctionMatch) {
      componentName = exportDefaultFunctionMatch[1];
    } else if (exportDefaultMatch) {
      componentName = exportDefaultMatch[1];
    } else if (exportFunctionMatch) {
      componentName = exportFunctionMatch[1];
    } else if (functionMatch) {
      // function ComponentName 형식에서 이름 추출
      componentName = functionMatch[1];
    }

    // 2. import 문 제거
    // react import 제거
    let cleanedCode = code.replace(
      /import\s+.*?from\s+['"]react['"];?\s*/g,
      ""
    );
    // @emotion/react import 제거
    cleanedCode = cleanedCode.replace(
      /import\s+.*?from\s+['"]@emotion\/react['"];?\s*/g,
      ""
    );
    // @emotion/css import 제거
    cleanedCode = cleanedCode.replace(
      /import\s+.*?from\s+['"]@emotion\/css['"];?\s*/g,
      ""
    );
    // 모든 import 문 제거 (남아있는 경우)
    cleanedCode = cleanedCode.replace(
      /import\s+.*?from\s+['"][^'"]+['"];?\s*/g,
      ""
    );

    // 3. export 문 제거/변환
    // export default function ComponentName 형식을 function ComponentName으로 변환 (먼저 처리)
    cleanedCode = cleanedCode.replace(
      /export\s+default\s+function\s+(\w+)/g,
      "function $1"
    );
    // export default ComponentName 형식 제거 (별도의 export default 문)
    cleanedCode = cleanedCode.replace(/export\s+default\s+\w+\s*;?\s*$/gm, "");
    // export function ComponentName 형식을 function ComponentName으로 변환
    cleanedCode = cleanedCode.replace(
      /export\s+function\s+(\w+)/g,
      "function $1"
    );
    // export interface를 interface로 변환
    cleanedCode = cleanedCode.replace(
      /export\s+interface\s+(\w+)/g,
      "interface $1"
    );
    // export const를 const로 변환
    cleanedCode = cleanedCode.replace(/export\s+const\s+(\w+)/g, "const $1");
    // 기타 export 문 제거 (남아있는 경우, 단 default function은 이미 처리했으므로 제외)
    cleanedCode = cleanedCode.replace(/export\s+(?!default\s+function)/g, "");

    // 4. Babel로 JSX → JavaScript 변환
    // emotion을 사용하려면 jsx runtime을 사용해야 하지만,
    // @babel/standalone에서는 emotion/babel-plugin을 동적으로 로드할 수 없음
    // 따라서 classic runtime을 사용하고, emotion의 jsx를 수동으로 적용
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

    // 4-1. emotion이 있으면 React.createElement를 emotion의 jsx로 교체
    // Babel이 JSX를 React.createElement로 변환하므로, 이를 emotion의 jsx로 교체
    let transformedWithEmotion = transformed;
    if (emotionModule && emotionJsx) {
      // React.createElement를 emotion의 jsx로 교체
      // 단, css prop이 있는 경우에만 emotion의 jsx를 사용
      // 하지만 모든 JSX를 emotion의 jsx로 교체하는 것이 더 안전
      transformedWithEmotion = transformed.replace(
        /React\.createElement/g,
        "window.jsx"
      );
    }

    // 5. React와 emotion의 css 함수를 window에 임시로 저장
    const prevReact = (window as any).React;
    const prevUseState = (window as any).useState;
    const prevCss = (window as any).css;
    const prevCx = (window as any).cx;
    const prevEmotionReact = (window as any).__EMOTION_REACT__;

    try {
      // emotion 모듈이 로드되었는지 확인
      const emotion = emotionModule;
      const cssFunction = emotionCss || ((styles: any) => styles);
      const cxFunction = emotionCx || ((...args: any[]) => args.filter(Boolean).join(" "));
      const jsxFunction = emotionJsx;

      (window as any).React = React;
      (window as any).useState = React.useState;
      (window as any).css = cssFunction;
      (window as any).cx = cxFunction;

      // emotion이 있으면 emotion의 jsx를 사용, 없으면 React.createElement 사용
      if (emotion && jsxFunction) {
        // emotion의 jsx runtime 사용
        (window as any).jsx = jsxFunction;
        (window as any).jsxs = emotion.jsxs || jsxFunction;
      } else {
        // emotion이 없으면 React.createElement 사용
        (window as any).React.createElement = React.createElement;
      }

      // emotion이 내부적으로 사용하는 캐시 객체 설정
      if (emotion) {
        // emotion이 자체적으로 캐시를 관리하므로 별도 설정 불필요
        // 단, emotion이 제대로 작동하려면 emotion의 jsx를 사용해야 함
      } else {
        // emotion이 없을 때를 위한 fallback 캐시
        (window as any).__EMOTION_REACT__ = {
          cache: {
            inserted: {},
            registered: {},
            sheet: {
              insert: (rule: string) => {
                const styleId = "emotion-style";
                let styleElement = document.getElementById(
                  styleId
                ) as HTMLStyleElement;
                if (!styleElement) {
                  styleElement = document.createElement("style");
                  styleElement.id = styleId;
                  document.head.appendChild(styleElement);
                }
                if (styleElement.sheet) {
                  try {
                    (styleElement.sheet as CSSStyleSheet).insertRule(rule, 0);
                  } catch (e) {
                    // 규칙 추가 실패 시 무시
                  }
                }
              },
            },
          },
        };
      }

      // 6. eval로 코드 실행 (window.React, window.css를 사용)
      // 전체 코드를 실행하고 컴포넌트 함수를 반환
      // 함수 선언은 hoisting되므로 실행 후 컴포넌트 이름으로 접근 가능
      const evalCode = `
        'use strict';
        var React = window.React;
        var useState = window.useState;
        var css = window.css;
        var cx = window.cx;
        ${emotionModule && emotionJsx ? "var jsx = window.jsx; var jsxs = window.jsxs;" : ""}
        
        ${transformedWithEmotion || transformed}
        
        typeof ${componentName} !== 'undefined' ? ${componentName} : null
      `;

      const Component = eval(evalCode);

      if (!Component || typeof Component !== "function") {
        throw new Error(
          `컴포넌트 '${componentName}'을 찾을 수 없거나 함수가 아닙니다. 실제 타입: ${typeof Component}`
        );
      }

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
      if (prevCss !== undefined) {
        (window as any).css = prevCss;
      } else {
        delete (window as any).css;
      }
      if (prevCx !== undefined) {
        (window as any).cx = prevCx;
      } else {
        delete (window as any).cx;
      }
      if (prevEmotionReact !== undefined) {
        (window as any).__EMOTION_REACT__ = prevEmotionReact;
      } else {
        delete (window as any).__EMOTION_REACT__;
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
    // 기본 검증: export default 또는 export function이 있는지
    const hasExportDefault = code.includes("export default");
    const hasExportFunction = /export\s+function\s+\w+\s*\(/.test(code);

    if (!hasExportDefault && !hasExportFunction) {
      return {
        isValid: false,
        error: "export default 또는 export function 문이 없습니다",
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
