// Component Property 설정 인터페이스
export interface PropertyConfig {
  name: string;
  type: "BOOLEAN" | "TEXT" | "VARIANT";
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
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "component"
    | "function";
  defaultValue?: any;
  required: boolean;
  description?: string;
}

/**
 * 메타데이터 관리 클래스
 * 단일 책임: 노드의 플러그인 데이터 읽기/쓰기
 */
export class MetadataManager {
  private readonly METADATA_KEY = "metadata-type";
  private readonly COMPONENT_PROPERTY_KEY = "dev-component-property";
  private readonly PROPS_DEFINITION_KEY = "props-definition";

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
    config: PropertyConfig[]
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
    props: PropDefinition[]
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
}
