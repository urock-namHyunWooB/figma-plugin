import * as React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { VariantCombination } from "../../../utils/variantCombinations";

interface ListViewProps {
  Component: React.ComponentType<any> | null;
  combinations: VariantCombination[];
}

/**
 * 리스트 뷰 - 대표 variant 조합들
 */
export function ListView({ Component, combinations }: ListViewProps) {
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
