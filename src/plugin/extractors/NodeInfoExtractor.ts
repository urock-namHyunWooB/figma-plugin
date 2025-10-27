/**
 * 노드 정보를 추출하는 클래스
 * 단일 책임: Figma 노드로부터 필요한 정보를 추출하고 변환
 */
export class NodeInfoExtractor {
  /**
   * 노드의 기본 정보 추출
   */
  private getBaseInfo(node: SceneNode): Record<string, unknown> {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      locked: node.locked,
    };
  }

  /**
   * 위치 및 크기 정보 추출
   */
  private getGeometryInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("x" in node) {
      info.x = Math.round(node.x * 100) / 100;
      info.y = Math.round(node.y * 100) / 100;
    }

    if ("width" in node && "height" in node) {
      info.width = Math.round(node.width * 100) / 100;
      info.height = Math.round(node.height * 100) / 100;
    }

    if ("rotation" in node && node.rotation !== 0) {
      info.rotation = Math.round(node.rotation * 100) / 100;
    }

    return info;
  }

  /**
   * 스타일 정보 추출 (투명도, 블렌드 모드)
   */
  private getStyleInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("opacity" in node && node.opacity !== 1) {
      info.opacity = Math.round(node.opacity * 100) / 100;
    }

    if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") {
      info.blendMode = node.blendMode;
    }

    return info;
  }

  /**
   * Fill 정보 추출
   */
  private getFillsInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills as Paint[];
      if (fills.length > 0) {
        info.fills = fills.map((fill) => {
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

    return info;
  }

  /**
   * Stroke 정보 추출
   */
  private getStrokeInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as Paint[];
      if (strokes.length > 0) {
        info.strokes = strokes.map((stroke) => {
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

    if (
      "strokeWeight" in node &&
      typeof node.strokeWeight === "number" &&
      node.strokeWeight > 0
    ) {
      info.strokeWeight = node.strokeWeight;
    }

    return info;
  }

  /**
   * 텍스트 노드 정보 추출
   */
  private getTextInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if (node.type === "TEXT") {
      info.characters = node.characters;
      info.fontSize = node.fontSize;
      info.fontName = node.fontName;
      info.textAlignHorizontal = node.textAlignHorizontal;
      info.textAlignVertical = node.textAlignVertical;
    }

    return info;
  }

  /**
   * 레이아웃 정보 추출 (Auto Layout)
   */
  private getLayoutInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("children" in node) {
      info.childrenCount = node.children.length;
    }

    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      info.layoutMode = node.layoutMode;
      info.primaryAxisSizingMode = node.primaryAxisSizingMode;
      info.counterAxisSizingMode = node.counterAxisSizingMode;
      info.paddingLeft = node.paddingLeft;
      info.paddingRight = node.paddingRight;
      info.paddingTop = node.paddingTop;
      info.paddingBottom = node.paddingBottom;
      info.itemSpacing = node.itemSpacing;
    }

    if ("cornerRadius" in node && node.cornerRadius !== 0) {
      info.cornerRadius = node.cornerRadius;
    }

    return info;
  }

  /**
   * Effects 정보 추출
   */
  private getEffectsInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if ("effects" in node && node.effects.length > 0) {
      info.effects = node.effects.map((effect) => ({
        type: effect.type,
        visible: effect.visible,
      }));
    }

    return info;
  }

  /**
   * Component Instance 정보 추출
   */
  private async getComponentInfo(
    node: SceneNode
  ): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = {};

    if (node.type === "INSTANCE") {
      const instance = node as InstanceNode;
      info.isInstance = true;

      if (instance.componentProperties) {
        info.componentProperties = instance.componentProperties;
        console.log("Component Properties:", instance.componentProperties);
      }

      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        info.mainComponentName = mainComponent.name;
        info.mainComponentId = mainComponent.id;

        const parent = mainComponent.parent;
        console.log("Parent type:", parent?.type);

        if (parent && parent.type === "COMPONENT_SET") {
          info.componentSetName = parent.name;

          const componentSet = parent as ComponentSetNode;
          const variantOptions: Record<string, string[]> = {};

          if (componentSet.componentPropertyDefinitions) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Object as any)
              .entries(componentSet.componentPropertyDefinitions)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .forEach(([key, definition]: [string, any]) => {
                if (
                  definition.type === "VARIANT" &&
                  definition.variantOptions
                ) {
                  variantOptions[key] = definition.variantOptions;
                }
              });
          }

          console.log("Available Variants:", variantOptions);
          info.availableVariants = variantOptions;
        }
      }
    }

    return info;
  }

  /**
   * 노드의 모든 속성 추출 (public API)
   */
  async extractNodeProperties(
    node: SceneNode
  ): Promise<Record<string, unknown>> {
    const properties = {
      ...this.getBaseInfo(node),
      ...this.getGeometryInfo(node),
      ...this.getStyleInfo(node),
      ...this.getFillsInfo(node),
      ...this.getStrokeInfo(node),
      ...this.getTextInfo(node),
      ...this.getLayoutInfo(node),
      ...this.getEffectsInfo(node),
      ...(await this.getComponentInfo(node)),
    };

    // 플러그인 메타데이터 읽기
    const metadataType = node.getPluginData("metadata-type");
    if (metadataType) {
      properties.metadataType = metadataType;
    }

    return properties;
  }
}
