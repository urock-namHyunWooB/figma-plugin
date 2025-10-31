import type { StructureElement } from "../types";

interface ElementBoxProps {
  element: StructureElement;
  scale: number;
  isSelected: boolean;
  bindingCount: number;
  onClick: () => void;
}

/**
 * 개별 요소 박스 컴포넌트
 */
function ElementBox({
  element,
  scale,
  isSelected,
  bindingCount,
  onClick,
}: ElementBoxProps) {
  const x = element.x * scale;
  const y = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;

  // 타입별 색상
  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      FRAME: "#8B5CF6",
      TEXT: "#3B82F6",
      INSTANCE: "#10B981",
      RECTANGLE: "#F59E0B",
      VECTOR: "#EF4444",
    };
    return colors[type] || "#6B7280";
  };

  const borderColor = isSelected ? "#3B82F6" : getTypeColor(element.type);
  const bgColor = isSelected ? "#DBEAFE" : "#FFFFFF";

  // 간단한 테스트 렌더링
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* 메인 박스 - 단순화 */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isSelected ? "#DBEAFE" : "#FFFFFF"}
        stroke={isSelected ? "#3B82F6" : "#6B7280"}
        strokeWidth={2}
        rx={4}
      />

      {/* <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fill="#000000"
        fontWeight="bold"
      >
        {element.name}
      </text> */}

      {/* <text x={x + 5} y={y + height - 5} fontSize={11} fill="#666666">
        {element.type}
      </text> */}
    </g>
  );
}

export default ElementBox;
