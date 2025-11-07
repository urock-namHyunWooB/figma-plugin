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
      {/* padding overlay (inside) */}
      {element.padding && (
        <g>
          {/* top padding */}
          {element.padding.top > 0 && (
            <rect
              x={x}
              y={y}
              width={width}
              height={element.padding.top * scale}
              fill="#10b981"
              opacity={0.12}
            />
          )}
          {/* bottom padding */}
          {element.padding.bottom > 0 && (
            <rect
              x={x}
              y={y + height - element.padding.bottom * scale}
              width={width}
              height={element.padding.bottom * scale}
              fill="#10b981"
              opacity={0.12}
            />
          )}
          {/* left padding */}
          {element.padding.left > 0 && (
            <rect
              x={x}
              y={y + element.padding.top * scale}
              width={element.padding.left * scale}
              height={
                height - (element.padding.top + element.padding.bottom) * scale
              }
              fill="#10b981"
              opacity={0.12}
            />
          )}
          {/* right padding */}
          {element.padding.right > 0 && (
            <rect
              x={x + width - element.padding.right * scale}
              y={y + element.padding.top * scale}
              width={element.padding.right * scale}
              height={
                height - (element.padding.top + element.padding.bottom) * scale
              }
              fill="#10b981"
              opacity={0.12}
            />
          )}

          {/* inner content frame outline */}
          <rect
            x={x + (element.padding.left || 0) * scale}
            y={y + (element.padding.top || 0) * scale}
            width={
              width - ((element.padding.left || 0) + (element.padding.right || 0)) * scale
            }
            height={
              height - ((element.padding.top || 0) + (element.padding.bottom || 0)) * scale
            }
            fill="none"
            stroke="#10b981"
            strokeDasharray="6 4"
            strokeWidth={1}
            rx={3}
          />
        </g>
      )}

      {/* main element box */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bgColor}
        stroke={isSelected ? "#3B82F6" : "#6B7280"}
        strokeWidth={2}
        rx={4}
      />

      {/* margin overlay (outside, only draw to left/top depending on layout-derived margin) */}
      {element.margin && (
        <g>
          {element.margin.top > 0 && (
            <rect
              x={x}
              y={y - element.margin.top * scale}
              width={width}
              height={element.margin.top * scale}
              fill="#f59e0b"
              opacity={0.12}
            />
          )}
          {element.margin.left > 0 && (
            <rect
              x={x - element.margin.left * scale}
              y={y}
              width={element.margin.left * scale}
              height={height}
              fill="#f59e0b"
              opacity={0.12}
            />
          )}
        </g>
      )}

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
