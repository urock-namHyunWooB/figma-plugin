import { useRef, useEffect, useState, useMemo } from "react";

import ElementBox from "./ElementBox";
import { calculateScale } from "../utils/layoutCalculator";
import { hasBinding } from "../utils/bindingSerializer";
import { ElementBindingsMap } from "@backend/managers/MetadataManager";
import {
  ComponentStructureData,
  LayoutTreeNode,
  StructureElement as BackendStructureElement,
} from "@backend/managers/ComponentStructureManager";
import { StructureElement } from "../types";

interface StructureCanvasProps {
  structure: ComponentStructureData;
  layoutTree: LayoutTreeNode | null;
  bindings: ElementBindingsMap;
  selectedElementId: string | null;
  onElementClick: (elementId: string) => void;
}

/**
 * 좌측 와이어프레임 렌더링 컴포넌트
 */
function StructureCanvas({
  structure,
  layoutTree,
  bindings,
  selectedElementId,
  onElementClick,
}: StructureCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // 캔버스 크기 업데이트
  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        setCanvasSize({
          width: canvasRef.current.clientWidth,
          height: canvasRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Backend 구조와 LayoutTree를 Frontend StructureElement로 변환
  const elements = useMemo(() => {
    if (!layoutTree) return [];

    const convertToElements = (
      backendElement: BackendStructureElement,
      layoutNode: LayoutTreeNode,
      parentX: number = 0,
      parentY: number = 0,
    ): StructureElement[] => {
      const x = (layoutNode.x ?? 0) + parentX;
      const y = (layoutNode.y ?? 0) + parentY;

      const element: StructureElement = {
        id: backendElement.id,
        name: backendElement.name,
        type: backendElement.type,
        x,
        y,
        width: layoutNode.width,
        height: layoutNode.height,
        visible: layoutNode.visible ?? true,
        padding: layoutNode.padding,
        margin: layoutNode.margin,
        layout:
          layoutNode.layoutMode && layoutNode.layoutMode !== "GRID"
            ? {
                layoutMode: layoutNode.layoutMode as
                  | "NONE"
                  | "HORIZONTAL"
                  | "VERTICAL",
                itemSpacing: layoutNode.itemSpacing ?? 0,
                primaryAxisAlignItems: layoutNode.primaryAxisAlignItems,
                counterAxisAlignItems: layoutNode.counterAxisAlignItems,
                layoutGrow: layoutNode.layoutGrow,
                layoutAlign: layoutNode.layoutAlign,
              }
            : undefined,
      };

      const result: StructureElement[] = [element];

      // children 처리
      if (
        backendElement.children &&
        layoutNode.children &&
        backendElement.children.length === layoutNode.children.length
      ) {
        backendElement.children.forEach((childElement, index) => {
          const childLayoutNode = layoutNode.children[index];
          if (childLayoutNode) {
            const childElements = convertToElements(
              childElement,
              childLayoutNode,
              x,
              y,
            );
            result.push(...childElements);
          }
        });
      }

      return result;
    };

    return convertToElements(structure.root, layoutTree);
  }, [structure, layoutTree]);

  // 스케일 계산
  const scale = useMemo(() => {
    if (
      elements.length === 0 ||
      canvasSize.width === 0 ||
      canvasSize.height === 0
    ) {
      return 1;
    }

    // 모든 요소의 bounding box 계산
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      const marginLeft = element.margin?.left || 0;
      const marginTop = element.margin?.top || 0;
      minX = Math.min(minX, element.x - marginLeft);
      minY = Math.min(minY, element.y - marginTop);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });

    const componentWidth = maxX - minX;
    const componentHeight = maxY - minY;

    return calculateScale(
      componentWidth,
      componentHeight,
      canvasSize.width,
      canvasSize.height,
      40,
    );
  }, [elements, canvasSize]);

  // 컨테이너 offset 계산 (중앙 정렬)
  const containerOffset = useMemo(() => {
    if (elements.length === 0) {
      return { x: 0, y: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      const marginLeft = element.margin?.left || 0;
      const marginTop = element.margin?.top || 0;
      minX = Math.min(minX, element.x - marginLeft);
      minY = Math.min(minY, element.y - marginTop);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });

    const componentWidth = (maxX - minX) * scale;
    const componentHeight = (maxY - minY) * scale;

    return {
      x: (canvasSize.width - componentWidth) / 2 - minX * scale,
      y: (canvasSize.height - componentHeight) / 2 - minY * scale,
    };
  }, [elements, scale, canvasSize]);

  if (!layoutTree || elements.length === 0) {
    return (
      <div className="w-full h-full bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-400">No layout data available</p>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-gray-50 flex items-center justify-center overflow-hidden relative"
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `translate(${containerOffset.x}px, ${containerOffset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {elements.map((element) => (
          <ElementBox
            key={element.id}
            element={element}
            scale={1}
            isSelected={selectedElementId === element.id}
            bindingCount={hasBinding(element.id, bindings) ? 1 : 0}
            onClick={() => onElementClick(element.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default StructureCanvas;
