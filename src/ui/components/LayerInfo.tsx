interface LayerInfoProps {
  layer: any;
  onVariantChange: (
    nodeId: string,
    propertyName: string,
    value: string
  ) => void;
}

export default function LayerInfo({ layer, onVariantChange }: LayerInfoProps) {
  const properties: Array<{ label: string; value: any; isHtml?: boolean }> = [];

  // 기본 정보
  properties.push({ label: "타입", value: layer.type });
  properties.push({ label: "ID", value: layer.id });

  // 메타데이터 정보
  if (layer.metadataType) {
    const metadataLabel = layer.metadataType === "slot" ? "Slot" : "Default";
    properties.push({
      label: "메타데이터",
      value: (
        <span className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs">
          {metadataLabel}
        </span>
      ),
      isHtml: true,
    });
  }

  // 위치와 크기
  if (layer.x !== undefined) {
    properties.push({ label: "위치", value: `(${layer.x}, ${layer.y})` });
  }
  if (layer.width !== undefined) {
    properties.push({
      label: "크기",
      value: `${layer.width} × ${layer.height}`,
    });
  }

  // 회전
  if (layer.rotation !== undefined) {
    properties.push({ label: "회전", value: `${layer.rotation}°` });
  }

  // 투명도
  if (layer.opacity !== undefined) {
    properties.push({
      label: "투명도",
      value: `${Math.round(layer.opacity * 100)}%`,
    });
  }

  // 표시 여부
  if (!layer.visible) {
    properties.push({ label: "표시", value: "숨김" });
  }

  // 잠금 여부
  if (layer.locked) {
    properties.push({ label: "잠금", value: "예" });
  }

  // Fill (색상)
  if (layer.fills && layer.fills.length > 0) {
    const fillsDisplay = layer.fills.map((fill: any) => {
      if (fill.type === "SOLID" && fill.color) {
        const hex = `#${[fill.color.r, fill.color.g, fill.color.b]
          .map((c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("")}`;
        return (
          <span
            key={`fill-${index}`}
            className="inline-flex items-center gap-2"
          >
            <span
              className="w-4 h-4 rounded border border-gray-300"
              style={{ backgroundColor: hex }}
            />
            {hex}
          </span>
        );
      }
      return fill.type;
    });
    properties.push({ label: "Fill", value: fillsDisplay, isHtml: true });
  }

  // Stroke (테두리)
  if (layer.strokes && layer.strokes.length > 0) {
    const strokesDisplay = layer.strokes.map((stroke: any) => {
      if (stroke.type === "SOLID" && stroke.color) {
        const hex = `#${[stroke.color.r, stroke.color.g, stroke.color.b]
          .map((c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("")}`;
        return (
          <span key={hex} className="inline-flex items-center gap-2">
            <span
              className="w-4 h-4 rounded border border-gray-300"
              style={{ backgroundColor: hex }}
            />
            {hex}
          </span>
        );
      }
      return stroke.type;
    });
    properties.push({ label: "Stroke", value: strokesDisplay, isHtml: true });
  }

  // Stroke 두께
  if (layer.strokeWeight !== undefined) {
    properties.push({ label: "Stroke 두께", value: `${layer.strokeWeight}px` });
  }

  // Corner Radius
  if (layer.cornerRadius !== undefined) {
    properties.push({
      label: "Corner Radius",
      value: `${layer.cornerRadius}px`,
    });
  }

  // 텍스트 관련
  if (layer.characters !== undefined) {
    properties.push({ label: "텍스트", value: `"${layer.characters}"` });
  }
  if (layer.fontSize !== undefined) {
    const fontSizeValue =
      typeof layer.fontSize === "number" ? `${layer.fontSize}px` : "Mixed";
    properties.push({ label: "폰트 크기", value: fontSizeValue });
  }
  if (layer.fontName !== undefined) {
    properties.push({
      label: "폰트",
      value: `${layer.fontName.family} ${layer.fontName.style}`,
    });
  }
  if (layer.textAlignHorizontal !== undefined) {
    properties.push({ label: "텍스트 정렬", value: layer.textAlignHorizontal });
  }

  // Auto Layout
  if (layer.layoutMode !== undefined) {
    properties.push({ label: "Layout Mode", value: layer.layoutMode });
    properties.push({ label: "Item Spacing", value: `${layer.itemSpacing}px` });
    properties.push({
      label: "Padding",
      value: `${layer.paddingTop} ${layer.paddingRight} ${layer.paddingBottom} ${layer.paddingLeft}`,
    });
  }

  // 자식 개수
  if (layer.childrenCount !== undefined) {
    properties.push({ label: "자식 개수", value: layer.childrenCount });
  }

  // Component Instance 정보
  if (layer.isInstance) {
    properties.push({
      label: "Component",
      value: layer.mainComponentName || "Unknown",
    });

    if (layer.componentSetName) {
      properties.push({
        label: "Component Set",
        value: layer.componentSetName,
      });
    }

    // Variant Properties (변경 가능)
    if (layer.componentProperties && layer.availableVariants) {
      Object.entries(layer.componentProperties).forEach(
        ([propName, propValue]: [string, any]) => {
          if (propValue.type === "VARIANT") {
            const currentValue = propValue.value;
            const availableOptions = layer.availableVariants[propName] || [];

            properties.push({
              label: `Variant: ${propName}`,
              value: (
                <select
                  value={currentValue}
                  onChange={(e) =>
                    onVariantChange(layer.id, propName, e.target.value)
                  }
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableOptions.map((option: string) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ),
              isHtml: true,
            });
          }
        }
      );
    }
  }

  // Effects
  if (layer.effects && layer.effects.length > 0) {
    properties.push({
      label: "Effects",
      value: layer.effects.map((e: any) => e.type).join(", "),
    });
  }

  // Blend Mode
  if (layer.blendMode !== undefined) {
    properties.push({ label: "Blend Mode", value: layer.blendMode });
  }

  return (
    <div className="bg-gray-100 rounded-lg p-3 space-y-1 animate-fadeIn">
      <div className="font-semibold text-sm mb-2">{layer.name}</div>
      {properties.map((prop, index) => (
        <div key={index} className="text-xs text-gray-700 leading-relaxed">
          <strong className="text-gray-900">{prop.label}:</strong>{" "}
          {prop.isHtml ? prop.value : <span>{prop.value}</span>}
        </div>
      ))}
    </div>
  );
}
