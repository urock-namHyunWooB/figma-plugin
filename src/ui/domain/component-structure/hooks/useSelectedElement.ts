import { useState, useCallback } from "react";

/**
 * 선택된 요소 관리 hook
 */
export function useSelectedElement() {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null
  );

  const selectElement = useCallback((elementId: string | null) => {
    setSelectedElementId(elementId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
  }, []);

  return {
    selectedElementId,
    selectElement,
    clearSelection,
    isSelected: (elementId: string) => selectedElementId === elementId,
  };
}

