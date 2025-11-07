import { ViewMode } from "../types";

interface ControlBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showPropsPanel: boolean;
  onTogglePropsPanel: () => void;
  hasGridData: boolean;
}

/**
 * 프리뷰 상단 컨트롤 바
 */
export function ControlBar({
  viewMode,
  onViewModeChange,
  showPropsPanel,
  onTogglePropsPanel,
  hasGridData,
}: ControlBarProps) {
  return (
    <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">View Mode:</span>
        <div className="flex gap-1">
          <button
            onClick={() => onViewModeChange("single")}
            className={`px-3 py-1 text-xs rounded ${
              viewMode === "single"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Single
          </button>
          <button
            onClick={() => onViewModeChange("list")}
            className={`px-3 py-1 text-xs rounded ${
              viewMode === "list"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            List
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            className={`px-3 py-1 text-xs rounded ${
              viewMode === "grid"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            disabled={!hasGridData}
          >
            Grid
          </button>
          <button
            onClick={() => onViewModeChange("all")}
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
        onClick={onTogglePropsPanel}
        className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
      >
        {showPropsPanel ? "Hide Props" : "Edit Props"}
      </button>
    </div>
  );
}

