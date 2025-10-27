// This plugin displays information about selected layers in Figma

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { width: 600, height: 500 });

// 노드의 상세 정보를 추출하는 함수
async function getNodeProperties(node: SceneNode) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseInfo: Record<string, any> = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: node.locked,
  };

  // 플러그인 메타데이터 읽기
  const metadataType = node.getPluginData("metadata-type");
  if (metadataType) {
    baseInfo.metadataType = metadataType;
  }

  // 위치와 크기 정보
  if ("x" in node) {
    baseInfo.x = Math.round(node.x * 100) / 100;
    baseInfo.y = Math.round(node.y * 100) / 100;
  }
  if ("width" in node && "height" in node) {
    baseInfo.width = Math.round(node.width * 100) / 100;
    baseInfo.height = Math.round(node.height * 100) / 100;
  }

  // 회전 정보
  if ("rotation" in node && node.rotation !== 0) {
    baseInfo.rotation = Math.round(node.rotation * 100) / 100;
  }

  // 투명도
  if ("opacity" in node && node.opacity !== 1) {
    baseInfo.opacity = Math.round(node.opacity * 100) / 100;
  }

  // 블렌드 모드
  if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") {
    baseInfo.blendMode = node.blendMode;
  }

  // Fill 정보 (색상)
  if ("fills" in node && Array.isArray(node.fills)) {
    const fills = node.fills as Paint[];
    if (fills.length > 0) {
      baseInfo.fills = fills.map((fill) => {
        if (fill.type === "SOLID") {
          return {
            type: fill.type,
            color: {
              r: Math.round(fill.color.r * 255),
              g: Math.round(fill.color.g * 255),
              b: Math.round(fill.color.b * 255),
            },
            opacity: fill.opacity || 1,
          };
        }
        return { type: fill.type };
      });
    }
  }

  // Stroke 정보 (테두리)
  if ("strokes" in node && Array.isArray(node.strokes)) {
    const strokes = node.strokes as Paint[];
    if (strokes.length > 0) {
      baseInfo.strokes = strokes.map((stroke) => {
        if (stroke.type === "SOLID") {
          return {
            type: stroke.type,
            color: {
              r: Math.round(stroke.color.r * 255),
              g: Math.round(stroke.color.g * 255),
              b: Math.round(stroke.color.b * 255),
            },
          };
        }
        return { type: stroke.type };
      });
    }
  }

  // Stroke 두께
  if (
    "strokeWeight" in node &&
    typeof node.strokeWeight === "number" &&
    node.strokeWeight > 0
  ) {
    baseInfo.strokeWeight = node.strokeWeight;
  }

  // 텍스트 노드 전용 정보
  if (node.type === "TEXT") {
    baseInfo.characters = node.characters;
    baseInfo.fontSize = node.fontSize;
    baseInfo.fontName = node.fontName;
    baseInfo.textAlignHorizontal = node.textAlignHorizontal;
    baseInfo.textAlignVertical = node.textAlignVertical;
  }

  // 프레임/그룹 전용 정보
  if ("children" in node) {
    baseInfo.childrenCount = node.children.length;
  }

  // Auto Layout 정보
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    baseInfo.layoutMode = node.layoutMode;
    baseInfo.primaryAxisSizingMode = node.primaryAxisSizingMode;
    baseInfo.counterAxisSizingMode = node.counterAxisSizingMode;
    baseInfo.paddingLeft = node.paddingLeft;
    baseInfo.paddingRight = node.paddingRight;
    baseInfo.paddingTop = node.paddingTop;
    baseInfo.paddingBottom = node.paddingBottom;
    baseInfo.itemSpacing = node.itemSpacing;
  }

  // Corner Radius (둥근 모서리)
  if ("cornerRadius" in node && node.cornerRadius !== 0) {
    baseInfo.cornerRadius = node.cornerRadius;
  }

  // Effects (그림자, 블러 등)
  if ("effects" in node && node.effects.length > 0) {
    baseInfo.effects = node.effects.map((effect) => ({
      type: effect.type,
      visible: effect.visible,
    }));
  }

  // Component Instance 정보 (Variant 포함)
  if (node.type === "INSTANCE") {
    const instance = node as InstanceNode;
    baseInfo.isInstance = true;

    // 현재 variant properties
    if (instance.componentProperties) {
      baseInfo.componentProperties = instance.componentProperties;
      console.log("Component Properties:", instance.componentProperties);
    }

    // Main Component 정보
    const mainComponent = await instance.getMainComponentAsync();
    if (mainComponent) {
      baseInfo.mainComponentName = mainComponent.name;
      baseInfo.mainComponentId = mainComponent.id;

      // Component Set (Variant의 부모)
      const parent = mainComponent.parent;
      console.log("Parent type:", parent?.type);

      if (parent && parent.type === "COMPONENT_SET") {
        baseInfo.componentSetName = parent.name;

        // Component Set의 property definitions 직접 사용
        const componentSet = parent as ComponentSetNode;
        const variantOptions: Record<string, string[]> = {};

        // Component Set의 componentPropertyDefinitions에서 variant 옵션 가져오기
        if (componentSet.componentPropertyDefinitions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (Object as any)
            .entries(componentSet.componentPropertyDefinitions)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .forEach(([key, definition]: [string, any]) => {
              if (definition.type === "VARIANT" && definition.variantOptions) {
                variantOptions[key] = definition.variantOptions;
              }
            });
        }

        console.log("Available Variants:", variantOptions);
        baseInfo.availableVariants = variantOptions;
      }
    }
  }

  return baseInfo;
}

// 선택 정보를 UI로 전송하는 함수
async function sendSelectionInfo() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "selection-info",
      data: [],
    });
    return;
  }

  const selectionInfo = await Promise.all(
    selection.map((node) => getNodeProperties(node))
  );

  figma.ui.postMessage({
    type: "selection-info",
    data: selectionInfo,
  });
}

// 플러그인 시작 시 선택 정보 전송
sendSelectionInfo();

// 선택이 변경될 때마다 정보 전송
figma.on("selectionchange", () => {
  sendSelectionInfo();
});

// UI로부터 메시지 수신
figma.ui.onmessage = async (msg: {
  type: string;
  nodeId?: string;
  propertyName?: string;
  value?: string;
  metadataType?: string;
}) => {
  if (msg.type === "cancel") {
    figma.closePlugin();
  }

  if (msg.type === "change-variant") {
    // Variant 변경
    const node = (await figma.getNodeByIdAsync(msg.nodeId!)) as InstanceNode;
    if (node && node.type === "INSTANCE" && msg.propertyName && msg.value) {
      try {
        node.setProperties({
          [msg.propertyName]: msg.value,
        });
        figma.notify(`Variant 변경됨: ${msg.propertyName} = ${msg.value}`);
        // 변경 후 정보 업데이트
        await sendSelectionInfo();
      } catch (error) {
        figma.notify("Variant 변경 실패: " + error);
      }
    }
  }

  if (msg.type === "set-metadata") {
    // 메타데이터 설정
    const node = await figma.getNodeByIdAsync(msg.nodeId!);
    if (node && msg.metadataType) {
      node.setPluginData("metadata-type", msg.metadataType);
      figma.notify(`메타데이터 설정됨: ${msg.metadataType}`);
      // 변경 후 정보 업데이트
      await sendSelectionInfo();
    }
  }
};
