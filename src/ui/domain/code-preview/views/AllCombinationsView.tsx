import * as React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { VariantCombination } from "../../../utils/variantCombinations";

interface AllCombinationsViewProps {
  Component: React.ComponentType<any> | null;
  combinations: VariantCombination[];
}

/**
 * 모든 조합 뷰
 */
export function AllCombinationsView({
  Component,
  combinations,
}: AllCombinationsViewProps) {
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

