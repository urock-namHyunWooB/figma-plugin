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
    node: SceneNode,
  ): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = {};

    if (node.type === "INSTANCE") {
      const instance = node as InstanceNode;
      info.isInstance = true;

      if (instance.componentProperties) {
        info.componentProperties = instance.componentProperties;
      }

      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        info.mainComponentName = mainComponent.name;
        info.mainComponentId = mainComponent.id;

        const parent = mainComponent.parent;

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

          info.availableVariants = variantOptions;
        }
      }
    }

    return info;
  }

  /**
   * 노드 트리 구조 추출 (재귀)
   */
  private extractNodeTree(node: SceneNode, depth: number = 0): any {
    const nodeInfo: any = {
      id: node.id,
      name: node.name,
      type: node.type,
    };

    // 기본 속성
    if ("visible" in node) {
      nodeInfo.visible = node.visible;
    }

    // 크기 정보
    if ("width" in node && "height" in node) {
      nodeInfo.width = Math.round(node.width * 100) / 100;
      nodeInfo.height = Math.round(node.height * 100) / 100;
    }

    // 위치 정보 (상대 위치)
    if ("x" in node && "y" in node) {
      nodeInfo.x = Math.round(node.x * 100) / 100;
      nodeInfo.y = Math.round(node.y * 100) / 100;
    }

    // 텍스트 노드
    if (node.type === "TEXT") {
      nodeInfo.characters = node.characters;
      nodeInfo.fontSize = node.fontSize;
      nodeInfo.fontName = node.fontName;
    }

    // Auto Layout 정보
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      nodeInfo.layoutMode = node.layoutMode;
      nodeInfo.itemSpacing = node.itemSpacing;
      nodeInfo.paddingLeft = node.paddingLeft;
      nodeInfo.paddingRight = node.paddingRight;
      nodeInfo.paddingTop = node.paddingTop;
      nodeInfo.paddingBottom = node.paddingBottom;
    }

    // Fill 정보
    if ("fills" in node && Array.isArray(node.fills)) {
      const fills = node.fills as Paint[];
      if (fills.length > 0) {
        nodeInfo.fills = fills.map((fill) => {
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

    // Stroke 정보
    if ("strokes" in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as Paint[];
      if (strokes.length > 0 && strokes[0].visible !== false) {
        nodeInfo.hasStrokes = true;
        if ("strokeWeight" in node && typeof node.strokeWeight === "number") {
          nodeInfo.strokeWeight = node.strokeWeight;
        }
      }
    }

    // Corner Radius
    if ("cornerRadius" in node && node.cornerRadius !== 0) {
      nodeInfo.cornerRadius = node.cornerRadius;
    }

    // Constraints
    if ("constraints" in node) {
      nodeInfo.constraints = node.constraints;
    }

    if ("children" in node) {
      nodeInfo.children = node.children.map((child) =>
        this.extractNodeTree(child, depth + 1),
      );
    }

    return nodeInfo;
  }

  /**
   * Component에서 스타일 정보 추출 (헬퍼 함수)
   */
  private extractComponentStyles(component: ComponentNode): any {
    const styles: any = {};

    // 크기 정보
    if ("width" in component && "height" in component) {
      styles.width = Math.round(component.width * 100) / 100;
      styles.height = Math.round(component.height * 100) / 100;
    }

    // Fill 정보
    if ("fills" in component && Array.isArray(component.fills)) {
      const fills = component.fills as Paint[];
      if (fills.length > 0) {
        styles.fills = fills.map((fill) => {
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

    // Stroke 정보
    if ("strokes" in component && Array.isArray(component.strokes)) {
      const strokes = component.strokes as Paint[];
      if (strokes.length > 0) {
        styles.strokes = strokes.map((stroke) => {
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
      "strokeWeight" in component &&
      typeof component.strokeWeight === "number" &&
      component.strokeWeight > 0
    ) {
      styles.strokeWeight = component.strokeWeight;
    }

    // Corner Radius
    if ("cornerRadius" in component && component.cornerRadius !== 0) {
      styles.cornerRadius = component.cornerRadius;
    }

    // Effects
    if ("effects" in component && component.effects.length > 0) {
      styles.effects = component.effects.map((effect) => ({
        type: effect.type,
        visible: effect.visible,
      }));
    }

    // Opacity
    if ("opacity" in component && component.opacity !== 1) {
      styles.opacity = Math.round(component.opacity * 100) / 100;
    }

    // Layout (Auto Layout) 정보
    if ("layoutMode" in component && component.layoutMode !== "NONE") {
      styles.layoutMode = component.layoutMode;
      styles.primaryAxisSizingMode = component.primaryAxisSizingMode;
      styles.counterAxisSizingMode = component.counterAxisSizingMode;
      styles.paddingLeft = component.paddingLeft;
      styles.paddingRight = component.paddingRight;
      styles.paddingTop = component.paddingTop;
      styles.paddingBottom = component.paddingBottom;
      styles.itemSpacing = component.itemSpacing;
    }

    return styles;
  }

  /**
   * 프로퍼티별 스타일 매핑 분석
   */
  private analyzePropertyStyleMapping(
    variants: Array<{
      variantProperties: Record<string, string | boolean> | null;
      styles: any;
    }>,
    propertyDefinitions: ComponentPropertyDefinitions,
  ): Record<string, any> {
    const propertyStyleMap: Record<string, any> = {};

    // 각 프로퍼티별로 분석
    Object.keys(propertyDefinitions).forEach((propName) => {
      const propDef = propertyDefinitions[propName];

      // VARIANT 타입만 분석 (BOOLEAN은 단순 on/off이므로 별도 처리)
      if (propDef.type === "VARIANT" && propDef.variantOptions) {
        propertyStyleMap[propName] = {};

        propDef.variantOptions.forEach((optionValue) => {
          // 이 옵션 값을 가진 variants 찾기
          const matchingVariants = variants.filter(
            (v) =>
              v.variantProperties &&
              v.variantProperties[propName] === optionValue,
          );

          if (matchingVariants.length > 0) {
            // 이 옵션에서 공통적으로 나타나는 스타일 찾기
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles),
            );

            if (Object.keys(commonStyles).length > 0) {
              propertyStyleMap[propName][optionValue] = commonStyles;
            }
          }
        });
      } else if (propDef.type === "BOOLEAN") {
        // BOOLEAN 타입 처리
        propertyStyleMap[propName] = {
          true: {},
          false: {},
        };

        [true, false].forEach((boolValue) => {
          const matchingVariants = variants.filter(
            (v) =>
              v.variantProperties &&
              v.variantProperties[propName] === boolValue,
          );

          if (matchingVariants.length > 0) {
            const commonStyles = this.findCommonStyles(
              matchingVariants.map((v) => v.styles),
            );

            if (Object.keys(commonStyles).length > 0) {
              propertyStyleMap[propName][boolValue.toString()] = commonStyles;
            }
          }
        });
      }
    });

    return propertyStyleMap;
  }

  /**
   * 여러 스타일 객체에서 공통 스타일 찾기
   */
  private findCommonStyles(stylesArray: any[]): any {
    if (stylesArray.length === 0) return {};

    const commonStyles: any = {};
    const firstStyle = stylesArray[0];

    // 첫 번째 스타일의 각 속성을 체크
    Object.keys(firstStyle).forEach((key) => {
      // 모든 스타일에서 이 속성이 동일한 값을 가지는지 확인
      const allSame = stylesArray.every((style) => {
        return JSON.stringify(style[key]) === JSON.stringify(firstStyle[key]);
      });

      if (allSame) {
        commonStyles[key] = firstStyle[key];
      }
    });

    return commonStyles;
  }

  /**
   * ComponentSet 정보 추출
   */
  private getComponentSetInfo(node: SceneNode): Record<string, unknown> {
    const info: Record<string, unknown> = {};

    if (node.type === "COMPONENT_SET") {
      const componentSet = node as ComponentSetNode;

      // ComponentPropertyDefinitions 추출
      if (componentSet.componentPropertyDefinitions) {
        info.componentPropertyDefinitions =
          componentSet.componentPropertyDefinitions;
      }

      // 저장된 Component Property Config 추출
      const savedConfig = node.getPluginData("dev-component-property");
      if (savedConfig) {
        try {
          info.componentPropertyConfig = JSON.parse(savedConfig);
        } catch (error) {
          console.error("Failed to parse component property config:", error);
        }
      }

      // 컴포넌트 구조 추출 (defaultVariant 기준)
      if (componentSet.defaultVariant) {
        info.componentStructure = this.extractNodeTree(
          componentSet.defaultVariant,
        );
      }

      // 프로퍼티별 스타일 매핑 분석
      if (componentSet.componentPropertyDefinitions) {
        const variants: Array<{
          variantProperties: Record<string, string | boolean> | null;
          styles: any;
        }> = [];

        componentSet.children.forEach((child) => {
          if (child.type === "COMPONENT") {
            const component = child as ComponentNode;
            const styles = this.extractComponentStyles(component);

            variants.push({
              variantProperties: component.variantProperties,
              styles: styles,
            });
          }
        });

        if (variants.length > 0) {
          const styleMapping = this.analyzePropertyStyleMapping(
            variants,
            componentSet.componentPropertyDefinitions,
          );

          if (Object.keys(styleMapping).length > 0) {
            info.stylesByProperty = styleMapping;
          }
        }
      }
    }

    return info;
  }

  /**
   * 노드의 모든 속성 추출 (public API)
   */
  async extractNodeProperties(
    node: SceneNode,
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
      ...this.getComponentSetInfo(node),
    };

    // 플러그인 메타데이터 읽기
    const metadataType = node.getPluginData("metadata-type");
    if (metadataType) {
      properties.metadataType = metadataType;
    }

    return properties;
  }
}
