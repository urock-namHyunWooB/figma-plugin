import { useRef, useEffect, useState } from "react";
import type { ComponentStructureData, ElementBindingsMap } from "../types";
import ElementBox from "./ElementBox";
import { calculateScale } from "../utils/layoutCalculator";
import { hasBinding } from "../utils/bindingSerializer";

interface StructureCanvasProps {
  structure: ComponentStructureData;
  bindings: ElementBindingsMap;
  selectedElementId: string | null;
  onElementClick: (elementId: string) => void;
}

/**
 * 좌측 와이어프레임 렌더링 컴포넌트
 */
function StructureCanvas({
  structure,
  bindings,
  selectedElementId,
  onElementClick,
}: StructureCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const calculatedScale = calculateScale(
        structure.boundingBox.width,
        structure.boundingBox.height,
        rect.width,
        rect.height,
        40
      );
      // 최소 scale을 2로 설정하여 더 크게 표시
      const newScale = Math.max(calculatedScale, 2);
      setScale(newScale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [structure]);

  if (!structure || structure.elements.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No structure data available
      </div>
    );
  }

  const scaledWidth = structure.boundingBox.width * scale;
  const scaledHeight = structure.boundingBox.height * scale;

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-50 p-6 flex items-center justify-center"
    >
      <svg
        width={scaledWidth + 80}
        height={scaledHeight + 80}
        viewBox={`0 0 ${scaledWidth + 80} ${scaledHeight + 80}`}
        className="border-2 border-gray-300 bg-white rounded-lg shadow-md"
      >
        <g transform="translate(40, 40)">
          {structure.elements.map((element) => (
            <ElementBox
              key={element.id}
              element={element}
              scale={scale}
              isSelected={selectedElementId === element.id}
              bindingCount={hasBinding(element.id, bindings) ? 1 : 0}
              onClick={() => onElementClick(element.id)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default StructureCanvas;
