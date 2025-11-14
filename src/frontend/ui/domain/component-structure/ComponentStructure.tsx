import { useMemo } from "react";
import StructureCanvas from "./components/StructureCanvas";
import BindingPanel from "./components/BindingPanel";

import { useElementBindings } from "./hooks/useElementBindings";
import { useSelectedElement } from "./hooks/useSelectedElement";

import { ElementBindingsMap } from "./types";
import {
  PropDefinition,
  StateDefinition,
} from "@backend/managers/MetadataManager";
import {
  ComponentStructureData,
  LayoutTreeNode,
  StructureElement as BackendStructureElement,
} from "@backend/managers/ComponentStructureManager";

interface ComponentStructureProps {
  structure: ComponentStructureData | null;
  props: PropDefinition[];
  states: StateDefinition[];
  initialBindings: ElementBindingsMap;
  layoutTree: LayoutTreeNode | null;
}

/**
 * Component Structure 메인 컴포넌트
 * 책임: 레이아웃 조합만
 */
function ComponentStructure({
  structure,
  props,
  states,
  initialBindings,
  layoutTree,
}: ComponentStructureProps) {
  const {
    bindings,
    connectProp,
    setVisibility,
    saveBindings,
    resetBindings,
    hasUnsavedChanges,
  } = useElementBindings(initialBindings, props, states);
  const { selectedElementId, selectElement } = useSelectedElement();

  // 선택된 요소 찾기
  const selectedElement = useMemo(() => {
    if (!structure || !selectedElementId) return null;

    const findElement = (
      element: BackendStructureElement,
    ): BackendStructureElement | null => {
      if (element.id === selectedElementId) return element;
      if (element.children) {
        for (const child of element.children) {
          const found = findElement(child);
          if (found) return found;
        }
      }
      return null;
    };

    return findElement(structure.root);
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
          Root Element: {structure.root.name}
        </p>
      </div>

      <div className="flex" style={{ height: "600px" }}>
        {/* 좌측: 와이어프레임 */}
        <div className="flex-1 border-r">
          <StructureCanvas
            structure={structure}
            layoutTree={layoutTree}
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
            states={states}
            onConnectProp={connectProp}
            onSetVisibility={setVisibility}
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
