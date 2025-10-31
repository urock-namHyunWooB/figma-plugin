import { useMemo } from "react";
import StructureCanvas from "./components/StructureCanvas";
import BindingPanel from "./components/BindingPanel";
import { useComponentStructure } from "./hooks/useComponentStructure";
import { useElementBindings } from "./hooks/useElementBindings";
import { useSelectedElement } from "./hooks/useSelectedElement";
import { usePropsAndStates } from "./hooks/usePropsAndStates";
import type { ComponentStructureData, StructureElement } from "./types";

/**
 * Component Structure 메인 컴포넌트
 * 책임: 레이아웃 조합만
 */
function ComponentStructure({
  structure,
}: {
  structure: ComponentStructureData | null;
}) {
  const {
    bindings,
    connectProp,
    saveBindings,
    resetBindings,
    hasUnsavedChanges,
  } = useElementBindings();
  const { selectedElementId, selectElement } = useSelectedElement();
  const { props } = usePropsAndStates();

  console.log(structure);

  // 선택된 요소 찾기
  const selectedElement = useMemo(() => {
    if (!structure || !selectedElementId) return null;

    const findElement = (
      elements: StructureElement[]
    ): StructureElement | null => {
      for (const element of elements) {
        if (element.id === selectedElementId) return element;
        if (element.children) {
          const found = findElement(element.children);
          if (found) return found;
        }
      }
      return null;
    };

    return findElement(structure.elements);
  }, [structure, selectedElementId]);

  if (!structure) {
    return (
      <div className="mb-4 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Component Structure</h2>
        <p className="text-gray-400 text-center py-8">
          Select a COMPONENT_SET to view structure
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b bg-gray-50">
        <h2 className="text-lg font-semibold">Component Structure</h2>
        <p className="text-sm text-gray-600 mt-1">
          Base Variant: {structure.baseVariantName}
        </p>
      </div>

      <div className="flex" style={{ height: "600px" }}>
        {/* 좌측: 와이어프레임 */}
        <div className="flex-1 border-r">
          <StructureCanvas
            structure={structure}
            bindings={bindings}
            selectedElementId={selectedElementId}
            onElementClick={selectElement}
          />
        </div>

        {/* 우측: 바인딩 패널 */}
        <div className="w-96">
          <BindingPanel
            selectedElement={selectedElement}
            bindings={bindings}
            props={props}
            onConnectProp={connectProp}
            onSave={saveBindings}
            onReset={resetBindings}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>
      </div>
    </div>
  );
}

export default ComponentStructure;
