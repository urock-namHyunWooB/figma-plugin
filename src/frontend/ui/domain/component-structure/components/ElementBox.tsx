import type { StructureElement } from "../types";

interface ElementBoxProps {
  element: StructureElement;
  scale: number;
  isSelected: boolean;
  bindingCount: number;
  onClick: () => void;
}

/**
 * 타입에 따라 실제 HTML 태그로 매핑
 */
function getTagName(type: string): string {
  const tagMap: Record<string, string> = {
    FRAME: "div",
    TEXT: "span",
    INSTANCE: "div",
    RECTANGLE: "div",
    VECTOR: "div",
    BUTTON: "button",
    INPUT: "input",
    IMAGE: "img",
    GROUP: "div",
    COMPONENT: "div",
  };
  return tagMap[type] || "div";
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
      BUTTON: "#3B82F6",
      INPUT: "#10B981",
    };
    return colors[type] || "#6B7280";
  };

  const borderColor = isSelected ? "#3B82F6" : getTypeColor(element.type);
  const bgColor = isSelected ? "#DBEAFE" : "#FFFFFF";

  const Tag = getTagName(element.type) as keyof JSX.IntrinsicElements;

  // Padding outline 스타일
  const paddingOutlineStyle: React.CSSProperties = {
    position: "absolute",
    left: x + (element.padding?.left || 0) * scale,
    top: y + (element.padding?.top || 0) * scale,
    width:
      width -
      ((element.padding?.left || 0) + (element.padding?.right || 0)) * scale,
    height:
      height -
      ((element.padding?.top || 0) + (element.padding?.bottom || 0)) * scale,
    outline: "1px dashed #10b981",
    outlineOffset: "-1px",
    pointerEvents: "none",
    borderRadius: "3px",
  };

  // Margin outline 스타일
  const marginOutlineStyle: React.CSSProperties = {
    position: "absolute",
    left: x - (element.margin?.left || 0) * scale,
    top: y - (element.margin?.top || 0) * scale,
    width:
      width +
      ((element.margin?.left || 0) + (element.margin?.right || 0)) * scale,
    height:
      height +
      ((element.margin?.top || 0) + (element.margin?.bottom || 0)) * scale,
    outline: "1px dashed #f59e0b",
    outlineOffset: "-1px",
    pointerEvents: "none",
  };

  const elementStyle: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width,
    height,
    backgroundColor: bgColor,
    border: `2px solid ${borderColor}`,
    borderRadius: "4px",
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <>
      {/* Margin outline (outside) */}
      {element.margin &&
        (element.margin.top > 0 ||
          element.margin.bottom > 0 ||
          element.margin.left > 0 ||
          element.margin.right > 0) && <div style={marginOutlineStyle} />}

      {/* Main element */}
      <Tag
        id={element.id}
        style={elementStyle}
        onClick={onClick}
        data-element-type={element.type}
        data-element-name={element.name}
      />

      {/* Padding outline (inside) */}
      {element.padding &&
        (element.padding.top > 0 ||
          element.padding.bottom > 0 ||
          element.padding.left > 0 ||
          element.padding.right > 0) && <div style={paddingOutlineStyle} />}
    </>
  );
}

export default ElementBox;
