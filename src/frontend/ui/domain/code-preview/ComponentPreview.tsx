import { useState, useEffect, useRef } from "react";
import * as React from "react";
import { compileReactComponent } from "../../utils/component-compiler";
import {
  generateRepresentativeCombinations,
  generateGridCombinations,
  generateAllCombinations,
} from "../../utils/variantCombinations";
import { extractPropsFromCode } from "./utils/extractPropsFromCode";
import { ControlBar } from "./components/ControlBar";
import { PropsPanel } from "./components/PropsPanel";
import { SingleView } from "./views/SingleView";
import { ListView } from "./views/ListView";
import { GridView } from "./views/GridView";
import { AllCombinationsView } from "./views/AllCombinationsView";
import type { ComponentPreviewProps, ViewMode } from "./types";

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
      <ControlBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showPropsPanel={showPropsPanel}
        onTogglePropsPanel={() => setShowPropsPanel(!showPropsPanel)}
        hasGridData={!!gridData}
      />

      <div className="flex-1 flex overflow-hidden">
        <div ref={previewRef} className="flex-1 overflow-auto">
          {viewMode === "single" && (
            <SingleView Component={Component} componentProps={componentProps} />
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

        {showPropsPanel && viewMode === "single" && (
          <PropsPanel
            componentProps={componentProps}
            onPropChange={handlePropChange}
          />
        )}
      </div>
    </div>
  );
}
