// Component Property 설정 인터페이스
export interface PropertyConfig {
  name: string;
  type: "BOOLEAN" | "TEXT" | "VARIANT" | "INSTANCE_SWAP";
  required: boolean;
  is_prop: boolean;
  initValue: string | boolean | null;
  variantOptions?: string[];
}

// Props 정의 인터페이스
export interface PropDefinition {
  id: string;
  name: string;
  type:
    | string
    | number
    | boolean
    | object
    | Array<string | number | boolean | object>;
  defaultValue?: any;
  required: boolean;
  description?: string;
  // variant property로부터 자동 생성된 prop (편집 불가)
  readonly?: boolean;
  variantOptions?: string[];
}

// Internal State 정의 인터페이스
export interface StateDefinition {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  initialValue: any;
  description?: string;
}

// Element Binding 인터페이스 (단순화)
export interface ElementBinding {
  elementId: string;
  elementName: string;
  elementType: string;
  connectedPropName: string | null;
  connectedTargetId: string | null; // 연결된 prop/state의 id
  visibleMode?: "always" | "hidden" | "expression";
  visibleExpression?: string;
}

export interface ElementBindingsMap {
  [elementId: string]: ElementBinding;
}

/**
 * 메타데이터 관리 클래스
 * 단일 책임: 노드의 플러그인 데이터 읽기/쓰기
 */
export class MetadataManager {
  private readonly METADATA_KEY = "metadata-type";
  private readonly COMPONENT_PROPERTY_KEY = "dev-component-property";
  private readonly PROPS_DEFINITION_KEY = "props-definition";
  private readonly INTERNAL_STATE_DEFINITION_KEY = "internal-state-definition";
  private readonly ELEMENT_BINDINGS_KEY = "element-bindings";
  private readonly ROOT_ELEMENT_KEY = "root-element";

  /**
   * 노드에 메타데이터 설정
   */
  async setMetadata(nodeId: string, metadataType: string): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      return false;
    }

    node.setPluginData(this.METADATA_KEY, metadataType);
    return true;
  }

  /**
   * 노드의 메타데이터 읽기
   */
  getMetadata(node: SceneNode): string | null {
    return node.getPluginData(this.METADATA_KEY) || null;
  }

  /**
   * ComponentSet에 Property Config 저장
   */
  async saveComponentPropertyConfig(
    nodeId: string,
    config: PropertyConfig[],
  ): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      return false;
    }

    try {
      const configJson = JSON.stringify(config);
      node.setPluginData(this.COMPONENT_PROPERTY_KEY, configJson);
      return true;
    } catch (error) {
      console.error("Failed to save component property config:", error);
      return false;
    }
  }

  /**
   * 현재 선택된 ComponentSet에 Property Config 저장
   */
  async saveComponentPropertyConfigForCurrentSelection(
    config: PropertyConfig[],
  ): Promise<boolean> {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      return false;
    }
    return this.saveComponentPropertyConfig(selection[0].id, config);
  }

  /**
   * ComponentSet의 Property Config 불러오기
   */
  getComponentPropertyConfig(node: SceneNode): PropertyConfig[] | null {
    if (node.type !== "COMPONENT_SET") {
      return null;
    }

    try {
      const configJson = node.getPluginData(this.COMPONENT_PROPERTY_KEY);
      if (!configJson) {
        return null;
      }
      return JSON.parse(configJson) as PropertyConfig[];
    } catch (error) {
      console.error("Failed to load component property config:", error);
      return null;
    }
  }

  /**
   * ComponentSet에 Props Definition 저장
   */
  async savePropsDefinition(
    nodeId: string,
    props: PropDefinition[],
  ): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      return false;
    }

    try {
      const propsJson = JSON.stringify(props);
      node.setPluginData(this.PROPS_DEFINITION_KEY, propsJson);
      return true;
    } catch (error) {
      console.error("Failed to save props definition:", error);
      return false;
    }
  }

  /**
   * 현재 선택된 ComponentSet에 Props Definition 저장
   * readonly props는 자동으로 제외됨
   */
  async savePropsDefinitionForCurrentSelection(
    props: PropDefinition[],
  ): Promise<boolean> {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      return false;
    }
    // readonly props 제외 (variant props는 자동 생성되므로 저장하지 않음)
    const userDefinedProps = props.filter((prop) => !prop.readonly);
    return this.savePropsDefinition(selection[0].id, userDefinedProps);
  }

  /**
   * ComponentSet의 Props Definition 불러오기
   */
  getPropsDefinition(node: SceneNode): PropDefinition[] | null {
    if (node.type !== "COMPONENT_SET") {
      return null;
    }

    try {
      const propsJson = node.getPluginData(this.PROPS_DEFINITION_KEY);
      if (!propsJson) {
        return null;
      }
      return JSON.parse(propsJson) as PropDefinition[];
    } catch (error) {
      console.error("Failed to load props definition:", error);
      return null;
    }
  }

  /**
   * ComponentSet의 size와 type variant를 자동으로 prop으로 변환
   */
  private extractVariantProps(
    componentSet: ComponentSetNode,
  ): PropDefinition[] {
    const variantProps: PropDefinition[] = [];

    if (!componentSet.componentPropertyDefinitions) {
      return variantProps;
    }

    const defaultVariant = componentSet.defaultVariant;

    Object.entries(componentSet.componentPropertyDefinitions).forEach(
      ([key, definition]) => {
        let defaultValue =
          definition.defaultValue || definition.variantOptions?.[0];

        if (defaultVariant && defaultVariant.variantProperties) {
          const variantValue = defaultVariant.variantProperties[key];
          if (variantValue && typeof variantValue === "string") {
            defaultValue = variantValue;
          }
        }

        variantProps.push({
          id: `variant-${key.toLowerCase()}`,
          name: key,
          type: definition.type,
          defaultValue: defaultValue,
          required: false,
          description: `Variant property: ${key}`,
          readonly: true,
          variantOptions: definition.variantOptions,
        });
      },
    );

    return variantProps;
  }

  /**
   * Props Definition과 Variant Props를 합쳐서 반환
   */
  getCombinedPropsDefinition(node: SceneNode): PropDefinition[] {
    if (node.type !== "COMPONENT_SET") {
      return [];
    }

    const componentSet = node as ComponentSetNode;

    // 저장된 props 불러오기
    const savedProps = this.getPropsDefinition(node) || [];

    // variant props 추출
    const variantProps = this.extractVariantProps(componentSet);

    // variant props를 먼저, 그 다음 user-defined props
    return [...variantProps, ...savedProps];
  }

  /**
   * ComponentSet에 Internal State Definition 저장
   */
  async saveInternalStateDefinition(
    nodeId: string,
    states: StateDefinition[],
  ): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      return false;
    }

    try {
      const statesJson = JSON.stringify(states);
      node.setPluginData(this.INTERNAL_STATE_DEFINITION_KEY, statesJson);
      return true;
    } catch (error) {
      console.error("Failed to save internal state definition:", error);
      return false;
    }
  }

  /**
   * 현재 선택된 ComponentSet에 Internal State Definition 저장
   */
  async saveInternalStateDefinitionForCurrentSelection(
    states: StateDefinition[],
  ): Promise<boolean> {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      return false;
    }
    return this.saveInternalStateDefinition(selection[0].id, states);
  }

  /**
   * ComponentSet의 Internal State Definition 불러오기
   */
  getInternalStateDefinition(node: SceneNode): StateDefinition[] | null {
    if (node.type !== "COMPONENT_SET") {
      return null;
    }

    try {
      const statesJson = node.getPluginData(this.INTERNAL_STATE_DEFINITION_KEY);
      if (!statesJson) {
        return null;
      }
      return JSON.parse(statesJson) as StateDefinition[];
    } catch (error) {
      console.error("Failed to load internal state definition:", error);
      return null;
    }
  }

  /**
   * ComponentSet에 Element Bindings 저장
   */
  async saveElementBindings(
    nodeId: string,
    bindings: ElementBindingsMap,
  ): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      return false;
    }

    try {
      const bindingsJson = JSON.stringify(bindings);
      node.setPluginData(this.ELEMENT_BINDINGS_KEY, bindingsJson);
      return true;
    } catch (error) {
      console.error("Failed to save element bindings:", error);
      return false;
    }
  }

  /**
   * 현재 선택된 ComponentSet에 Element Bindings 저장
   */
  async saveElementBindingsForCurrentSelection(
    bindings: ElementBindingsMap,
  ): Promise<boolean> {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      return false;
    }
    return this.saveElementBindings(selection[0].id, bindings);
  }

  /**
   * ComponentSet의 Element Bindings 불러오기
   */
  getElementBindings(node: SceneNode): ElementBindingsMap | null {
    if (node.type !== "COMPONENT_SET") {
      return null;
    }

    try {
      const bindingsJson = node.getPluginData(this.ELEMENT_BINDINGS_KEY);
      if (!bindingsJson) {
        return null;
      }
      const bindings = JSON.parse(bindingsJson) as ElementBindingsMap;

      // 기존 데이터 호환성: connectedTargetId가 없으면 null로 설정
      const normalizedBindings: ElementBindingsMap = {};
      for (const [elementId, binding] of Object.entries(bindings)) {
        normalizedBindings[elementId] = {
          ...binding,
          connectedTargetId: binding.connectedTargetId ?? null,
        };
      }

      return normalizedBindings;
    } catch (error) {
      console.error("Failed to load element bindings:", error);
      return null;
    }
  }

  /**
   * ComponentSet에 Root Element 저장
   */
  async saveRootElement(nodeId: string, rootElement: string): Promise<boolean> {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "COMPONENT_SET") {
      return false;
    }

    try {
      node.setPluginData(this.ROOT_ELEMENT_KEY, rootElement);
      return true;
    } catch (error) {
      console.error("Failed to save root element:", error);
      return false;
    }
  }

  /**
   * 현재 선택된 ComponentSet에 Root Element 저장
   */
  async saveRootElementForCurrentSelection(
    rootElement: string,
  ): Promise<boolean> {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "COMPONENT_SET") {
      return false;
    }
    return this.saveRootElement(selection[0].id, rootElement);
  }

  /**
   * ComponentSet의 Root Element 불러오기
   */
  getRootElement(node: SceneNode): string | null {
    if (node.type !== "COMPONENT_SET") {
      return null;
    }

    try {
      const rootElement = node.getPluginData(this.ROOT_ELEMENT_KEY);
      if (!rootElement) {
        return null;
      }
      return rootElement;
    } catch (error) {
      console.error("Failed to load root element:", error);
      return null;
    }
  }
}
