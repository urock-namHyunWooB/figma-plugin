import React, { useState, useEffect, useMemo, ErrorInfo } from "react";
import { renderReactComponent } from "../domain/renderer/component-render";
import ErrorBoundary from "../components/ErrorBoundary";

interface UseComponentRendererOptions {
  /** Error Boundary 사용 여부 (기본값: true) */
  useErrorBoundary?: boolean;
  /** 커스텀 fallback UI */
  fallback?: React.ReactNode;
  /** 에러 발생 시 콜백 */
  onRenderError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface UseComponentRendererResult {
  /** 원본 컴포넌트 (Error Boundary 없음) */
  Component: React.ComponentType<any> | null;
  /** Error Boundary로 감싸진 안전한 컴포넌트 */
  SafeComponent: React.ComponentType<any> | null;
  /** 컴파일 에러 메시지 */
  error: string | null;
  /** 로딩 상태 */
  isLoading: boolean;
}

/**
 * 생성된 TSX 코드를 동적으로 실행 가능한 React 컴포넌트로 변환
 *
 * @example
 * const { SafeComponent, error, isLoading } = useComponentRenderer(code);
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error} />;
 * if (SafeComponent) return <SafeComponent {...props} />;
 */
export function useComponentRenderer(
  code: string | null,
  options: UseComponentRendererOptions = {}
): UseComponentRendererResult {
  const { useErrorBoundary = true, fallback, onRenderError } = options;

  const [Component, setComponent] = useState<React.ComponentType<any> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prevCode, setPrevCode] = useState<string | null>(null);

  // code가 변경되면 즉시 Component와 error를 null로 설정 (렌더링 중에 실행)
  // React batching으로 인해 useEffect만으로는 이전 Component가 남아있을 수 있음
  if (code !== prevCode) {
    setComponent(null);
    setError(null);
    setPrevCode(code);
  }

  useEffect(() => {
    if (!code) {
      return;
    }

    setIsLoading(true);

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

  // Error Boundary로 감싸진 안전한 컴포넌트 생성
  const SafeComponent = useMemo(() => {
    if (!Component || !useErrorBoundary) return Component;

    const WrappedComponent: React.FC<any> = (props) => (
      <ErrorBoundary fallback={fallback} onError={onRenderError}>
        <Component {...props} />
      </ErrorBoundary>
    );

    WrappedComponent.displayName = `SafeWrapped(${Component.displayName || Component.name || "Component"})`;

    return WrappedComponent;
  }, [Component, useErrorBoundary, fallback, onRenderError]);

  return { Component, SafeComponent, error, isLoading };
}

export default useComponentRenderer;
