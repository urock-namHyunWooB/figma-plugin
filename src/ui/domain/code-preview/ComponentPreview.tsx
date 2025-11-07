import { useState, useEffect, useRef } from "react";
import { compileReactComponent } from "../../utils/component-compiler";
import * as React from "react";
import {
  generateRepresentativeCombinations,
  generateGridCombinations,
  generateAllCombinations,
  type VariantCombination,
} from "../../utils/variantCombinations";

interface ComponentPreviewProps {
  code: string;
  propsDefinition?: Array<{
    name: string;
    type: string;
    defaultValue?: any;
    variantOptions?: string[];
    readonly?: boolean;
  }>;
  onError?: (error: Error) => void;
}

type ViewMode = "single" | "list" | "grid" | "all";

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
  propsDefinition = [],
  onError,
}: ComponentPreviewProps) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [componentProps, setComponentProps] = useState<Record<string, any>>({});
  const [showPropsPanel, setShowPropsPanel] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const previewRef = useRef<HTMLDivElement>(null);

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

  // variant 조합 생성
  const variantCombinations =
    generateRepresentativeCombinations(propsDefinition);
  const gridData = generateGridCombinations(propsDefinition);
  const allCombinations = generateAllCombinations(propsDefinition, 100);

  // 컴포넌트 렌더링
  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* 상단 컨트롤 바 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">View Mode:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode("single")}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === "single"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === "grid"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              disabled={!gridData}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("all")}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowPropsPanel(!showPropsPanel)}
          className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
        >
          {showPropsPanel ? "Hide Props" : "Edit Props"}
        </button>
      </div>

      {/* 컨텐츠 영역 */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={previewRef} className="flex-1 overflow-auto">
          {viewMode === "single" && (
            <SingleView
              Component={Component}
              componentProps={componentProps}
              onPropChange={handlePropChange}
            />
          )}

          {viewMode === "list" && (
            <ListView
              Component={Component}
              combinations={variantCombinations}
            />
          )}

          {viewMode === "grid" && gridData && (
            <GridView Component={Component} gridData={gridData} />
          )}

          {viewMode === "all" && (
            <AllCombinationsView
              Component={Component}
              combinations={allCombinations}
            />
          )}
        </div>

        {/* Props 편집 패널 */}
        {showPropsPanel && viewMode === "single" && (
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
    </div>
  );
}

/**
 * 단일 컴포넌트 뷰
 */
function SingleView({
  Component,
  componentProps,
  onPropChange,
}: {
  Component: React.ComponentType<any> | null;
  componentProps: Record<string, any>;
  onPropChange: (key: string, value: any) => void;
}) {
  if (!Component) return null;

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-xs text-gray-500 mb-4">Live Preview</div>
        <ErrorBoundary>
          <Component {...componentProps} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * 리스트 뷰 - 대표 variant 조합들
 */
function ListView({
  Component,
  combinations,
}: {
  Component: React.ComponentType<any> | null;
  combinations: VariantCombination[];
}) {
  if (!Component) return null;

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Variant Combinations ({combinations.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {combinations.map((combo, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow p-4 border border-gray-200"
          >
            <div className="text-xs font-medium text-gray-600 mb-3">
              {combo.label}
            </div>
            <ErrorBoundary>
              <Component {...combo.props} />
            </ErrorBoundary>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 그리드 뷰 - 2차원 조합 매트릭스
 */
function GridView({
  Component,
  gridData,
}: {
  Component: React.ComponentType<any> | null;
  gridData: {
    rowVariant: any;
    colVariant: any;
    combinations: VariantCombination[][];
  };
}) {
  if (!Component) return null;

  const { rowVariant, colVariant, combinations } = gridData;

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Grid View: {rowVariant.name} × {colVariant.name}
      </h3>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-50 p-2 text-xs font-semibold sticky left-0 z-10">
                {rowVariant.name} \ {colVariant.name}
              </th>
              {colVariant.variantOptions?.map((colOption: string) => (
                <th
                  key={colOption}
                  className="border border-gray-300 bg-gray-50 p-2 text-xs font-semibold min-w-[200px]"
                >
                  {colOption}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {combinations.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="border border-gray-300 bg-gray-50 p-2 text-xs font-semibold sticky left-0 z-10">
                  {rowVariant.variantOptions?.[rowIndex]}
                </td>
                {row.map((combo, colIndex) => (
                  <td
                    key={colIndex}
                    className="border border-gray-300 bg-white p-4"
                  >
                    <ErrorBoundary>
                      <Component {...combo.props} />
                    </ErrorBoundary>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 모든 조합 뷰
 */
function AllCombinationsView({
  Component,
  combinations,
}: {
  Component: React.ComponentType<any> | null;
  combinations: VariantCombination[];
}) {
  if (!Component) return null;

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        All Combinations ({combinations.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {combinations.map((combo, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow p-3 border border-gray-200"
          >
            <div className="text-[10px] font-medium text-gray-600 mb-2 break-words">
              {combo.label}
            </div>
            <ErrorBoundary>
              <Component {...combo.props} />
            </ErrorBoundary>
          </div>
        ))}
      </div>
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
