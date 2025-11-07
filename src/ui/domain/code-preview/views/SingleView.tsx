import * as React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

interface SingleViewProps {
  Component: React.ComponentType<any> | null;
  componentProps: Record<string, any>;
}

/**
 * 단일 컴포넌트 뷰
 */
export function SingleView({ Component, componentProps }: SingleViewProps) {
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

