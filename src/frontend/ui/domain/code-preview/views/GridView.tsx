import * as React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { VariantCombination } from "../../../utils/variantCombinations";

interface GridViewProps {
  Component: React.ComponentType<any> | null;
  gridData: {
    rowVariant: any;
    colVariant: any;
    combinations: VariantCombination[][];
  };
}

/**
 * 그리드 뷰 - 2차원 조합 매트릭스
 */
export function GridView({ Component, gridData }: GridViewProps) {
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
