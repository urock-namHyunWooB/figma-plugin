import { useState, useEffect } from "react";
import { renderReactComponent } from "../domain/renderer/component-render";

interface UseComponentRendererResult {
  Component: React.ComponentType<any> | null;
  error: string | null;
  isLoading: boolean;
}

/**
 * 생성된 TSX 코드를 동적으로 실행 가능한 React 컴포넌트로 변환
 */
export function useComponentRenderer(
  code: string | null
): UseComponentRendererResult {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!code) {
      setComponent(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    renderReactComponent(code)
      .then((compiledComponent) => {
        setComponent(() => compiledComponent);
      })
      .catch((err) => {
        console.error("Component compilation error:", err);
        setError(err instanceof Error ? err.message : "알 수 없는 에러");
        setComponent(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [code]);

  return { Component, error, isLoading };
}

export default useComponentRenderer;
