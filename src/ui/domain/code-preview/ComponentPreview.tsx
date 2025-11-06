import { useState, useEffect, useRef } from "react";
import { compileReactComponent } from "../../utils/component-compiler";
import * as React from "react";

interface ComponentPreviewProps {
  code: string;
  onError?: (error: Error) => void;
}

// Props 인터페이스 추출 헬퍼
function extractPropsFromCode(code: string): Record<string, any> {
  const props: Record<string, any> = {};

  // interface에서 prop 정의 추출
  const interfaceMatch = code.match(/interface\s+\w+Props\s*{([^}]+)}/);
  if (!interfaceMatch) return props;

  const propsContent = interfaceMatch[1];
  const propLines = propsContent
    .split("\n")
    .filter((line) => line.includes(":"));

  propLines.forEach((line) => {
    const match = line.match(/(\w+)\??\s*:\s*(.+?);/);
    if (match) {
      const [, name, type] = match;

      // 기본값 설정
      if (type.includes("string") || type.includes('"')) {
        props[name] = "";
      } else if (type.includes("number")) {
        props[name] = 0;
      } else if (type.includes("boolean")) {
        props[name] = false;
      } else if (type.includes("ReactNode") || type.includes("component")) {
        props[name] = null;
      }
    }
  });

  return props;
}

/**
 * 생성된 React 컴포넌트 코드를 실시간으로 렌더링하는 프리뷰 컴포넌트
 */
export default function ComponentPreview({
  code,
  onError,
}: ComponentPreviewProps) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [componentProps, setComponentProps] = useState<Record<string, any>>({});
  const [showPropsPanel, setShowPropsPanel] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  console.log("code", code);

  useEffect(() => {
    if (!code || code.trim() === "") {
      setComponent(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // 약간의 디바운스 (너무 빠른 업데이트 방지)
    const timer = setTimeout(() => {
      try {
        const CompiledComponent = compileReactComponent(code);
        setComponent(() => CompiledComponent);

        // Props 추출 및 초기값 설정
        const extractedProps = extractPropsFromCode(code);
        setComponentProps(extractedProps);

        setError(null);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "알 수 없는 오류";
        setError(errorMessage);
        setComponent(null);
        onError?.(err as Error);
        console.error("Preview compilation error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [code, onError]);

  // 에러 상태
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-2xl">
          <div className="text-red-600 font-semibold text-lg mb-2">
            ⚠️ 컴포넌트 렌더링 오류
          </div>
          <pre className="text-sm text-red-800 bg-red-100 p-3 rounded overflow-auto">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">컴포넌트 컴파일 중...</div>
      </div>
    );
  }

  // 컴포넌트 없음
  if (!Component) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">
          코드를 생성하면 여기에 프리뷰가 나타납니다
        </div>
      </div>
    );
  }

  // Prop 값 변경 핸들러
  const handlePropChange = (propName: string, value: any) => {
    setComponentProps((prev) => ({
      ...prev,
      [propName]: value,
    }));
  };

  // 컴포넌트 렌더링
  return (
    <div className="w-full h-full flex bg-gray-50">
      {/* 프리뷰 영역 */}
      <div
        ref={previewRef}
        className="flex-1 flex items-center justify-center p-8 overflow-auto"
      >
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4 border-b pb-2">
            <div className="text-sm text-gray-500">Live Preview</div>
            <button
              onClick={() => setShowPropsPanel(!showPropsPanel)}
              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
            >
              {showPropsPanel ? "Hide Props" : "Edit Props"}
            </button>
          </div>
          <ErrorBoundary>
            <Component {...componentProps} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Props 편집 패널 */}
      {showPropsPanel && (
        <div className="w-80 bg-white border-l p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4">Component Props</h3>

          {Object.keys(componentProps).length === 0 ? (
            <div className="text-sm text-gray-400">No props defined</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(componentProps).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">
                    {key}
                  </label>

                  {typeof value === "boolean" ? (
                    <button
                      onClick={() => handlePropChange(key, !value)}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        value
                          ? "bg-green-50 border-green-300"
                          : "bg-gray-50 border-gray-300"
                      }`}
                    >
                      {value ? "true" : "false"}
                    </button>
                  ) : typeof value === "number" ? (
                    <input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        handlePropChange(key, Number(e.target.value))
                      }
                      className="w-full px-3 py-2 border rounded"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value || ""}
                      onChange={(e) => handlePropChange(key, e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                      placeholder={`Enter ${key}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 에러 바운더리 컴포넌트
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-600 p-4 bg-red-50 rounded">
          <div className="font-semibold mb-2">런타임 에러 발생</div>
          <pre className="text-sm overflow-auto">
            {this.state.error?.message || "알 수 없는 에러"}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
