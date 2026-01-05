import { FigmaNodeData } from "@compiler/types/baseType";

/**
 * 배열 슬롯 아이템의 prop 정의
 */
export interface ArraySlotItemProp {
  name: string; // prop 이름 (예: "size", "selected", "label")
  type: string; // prop 타입 (예: "VARIANT", "TEXT", "BOOLEAN")
  values?: string[]; // 가능한 값들 (VARIANT인 경우)
  defaultValue?: string; // 기본값
}

/**
 * 감지된 INSTANCE 정보
 */
export interface DetectedInstance {
  id: string;
  name: string;
  componentId: string;
  componentProperties?: Record<string, any>;
}

/**
 * 배열 슬롯 정보
 */
export interface ArraySlot {
  parentId: string; // 배열 슬롯의 부모 노드 ID
  parentName: string; // 부모 노드 이름
  slotName: string; // 슬롯 이름 (예: "items", "options")
  componentSetId?: string; // 참조하는 ComponentSet ID
  componentId?: string; // 참조하는 Component ID (ComponentSet이 없는 경우)
  instances: DetectedInstance[]; // 감지된 INSTANCE들
  itemProps: ArraySlotItemProp[]; // 배열 아이템의 prop 정의
}

/**
 * 배열 슬롯 감지기
 *
 * 감지 조건:
 * 1. 같은 부모 아래에
 * 2. 2개 이상의 INSTANCE가
 * 3. 같은 "원본 컴포넌트"를 참조하고 (componentSetId 또는 componentId)
 * 4. componentPropertyReferences.visible이 없으면
 * → 배열/슬롯으로 처리
 */
class ArraySlotDetector {
  private data: FigmaNodeData;
  private components: Record<string, any>;

  constructor(data: FigmaNodeData) {
    this.data = data;
    this.components = data.info.components || {};
  }

  /**
   * 배열 슬롯을 감지하여 반환
   */
  public detect(): ArraySlot[] {
    const slots: ArraySlot[] = [];
    const document = this.data.info.document;

    // 모든 노드를 순회하면서 배열 슬롯 감지
    this.traverseAndDetect(document, slots);

    return slots;
  }

  /**
   * 노드를 순회하면서 배열 슬롯 감지
   */
  private traverseAndDetect(node: any, slots: ArraySlot[]): void {
    if (!node.children || node.children.length === 0) {
      return;
    }

    // 현재 노드의 children에서 배열 슬롯 감지
    const detectedSlot = this.detectArraySlotInChildren(node);
    if (detectedSlot) {
      slots.push(detectedSlot);
    }

    // 자식 노드들도 재귀적으로 검사
    for (const child of node.children) {
      this.traverseAndDetect(child, slots);
    }
  }

  /**
   * 특정 노드의 children에서 배열 슬롯 감지
   */
  private detectArraySlotInChildren(parentNode: any): ArraySlot | null {
    const children = parentNode.children || [];

    // INSTANCE 타입인 children만 필터링
    const instances = children.filter(
      (child: any) => child.type === "INSTANCE"
    );

    if (instances.length < 2) {
      return null;
    }

    // componentSetId 또는 componentId로 그룹핑
    const groups = this.groupInstancesByComponent(instances);

    // 2개 이상의 INSTANCE가 같은 컴포넌트를 참조하는 그룹 찾기
    for (const [key, groupInstances] of Object.entries(groups)) {
      if (groupInstances.length < 2) {
        continue;
      }

      // componentPropertyReferences.visible이 있는 INSTANCE는 제외
      const validInstances = (groupInstances as any[]).filter(
        (instance: any) => !instance.componentPropertyReferences?.visible
      );

      if (validInstances.length < 2) {
        continue;
      }

      // 배열 슬롯으로 감지
      // key 형식: "componentSetId:1268:564" 또는 "componentId:247:56500"
      const colonIndex = key.indexOf(":");
      const type = key.substring(0, colonIndex);
      const id = key.substring(colonIndex + 1);
      const isComponentSet = type === "componentSetId";

      // 슬롯 이름 추론
      const slotName = this.inferSlotName(validInstances, parentNode.name);

      // 아이템 props 추출 (INSTANCE들의 componentProperties에서)
      const itemProps = this.extractItemPropsFromInstances(validInstances);

      return {
        parentId: parentNode.id,
        parentName: parentNode.name,
        slotName,
        componentSetId: isComponentSet ? id : undefined,
        componentId: !isComponentSet ? id : undefined,
        instances: validInstances.map((instance: any) => ({
          id: instance.id,
          name: instance.name,
          componentId: instance.componentId,
          componentProperties: instance.componentProperties,
        })),
        itemProps,
      };
    }

    return null;
  }

  /**
   * INSTANCE들을 componentSetId 또는 componentId로 그룹핑
   */
  private groupInstancesByComponent(
    instances: any[]
  ): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const instance of instances) {
      const componentId = instance.componentId;
      const component = this.components[componentId];

      // componentSetId가 있으면 우선 사용, 없으면 componentId 사용
      const key = component?.componentSetId
        ? `componentSetId:${component.componentSetId}`
        : `componentId:${componentId}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(instance);
    }

    return groups;
  }

  /**
   * 슬롯 이름 추론
   * 1. 부모 이름에서 힌트 추출 (예: "items-count ▾" → "items")
   * 2. INSTANCE 이름에서 힌트 추출 (예: "Option 1" → "options")
   * 3. 기본값: "items"
   */
  private inferSlotName(instances: any[], parentName: string): string {
    // 부모 이름에서 추론 (▾ 마커 제거)
    if (parentName.includes("▾")) {
      const cleaned = parentName.replace("▾", "").trim();
      // "-count" 같은 suffix 제거
      const baseName = cleaned.replace(/-count$/, "").trim();
      if (baseName) {
        return this.toCamelCase(baseName);
      }
    }

    // INSTANCE 이름에서 추론
    if (instances.length > 0) {
      const firstName = instances[0].name;
      // "Option 1" → "options", "Item" → "items"
      const baseName = firstName.replace(/\s*\d+$/, "").trim();
      if (baseName) {
        return this.toCamelCase(baseName) + "s";
      }
    }

    return "items";
  }

  /**
   * INSTANCE들의 componentProperties에서 아이템 props 추출
   * 모든 INSTANCE를 순회하면서 가능한 값들을 수집
   * + INSTANCE children의 TEXT 노드도 감지하여 text prop 추가
   */
  private extractItemPropsFromInstances(instances: any[]): ArraySlotItemProp[] {
    const propsMap: Map<string, ArraySlotItemProp> = new Map();

    // 1. componentProperties에서 props 추출
    for (const instance of instances) {
      if (!instance.componentProperties) continue;

      for (const [propName, propValue] of Object.entries(
        instance.componentProperties
      )) {
        const val = propValue as any;
        const normalizedName = this.toCamelCase(propName);

        if (!propsMap.has(normalizedName)) {
          propsMap.set(normalizedName, {
            name: normalizedName,
            type: val.type,
            values: [],
            defaultValue: val.value,
          });
        }

        // 가능한 값 수집 (중복 제거)
        const prop = propsMap.get(normalizedName)!;
        if (val.value && !prop.values?.includes(val.value)) {
          prop.values = prop.values || [];
          prop.values.push(val.value);
        }
      }
    }

    // 2. INSTANCE children의 TEXT 노드에서 text prop 추출
    const textProp = this.extractTextPropFromInstances(instances);
    if (textProp) {
      propsMap.set(textProp.name, textProp);
    }

    return Array.from(propsMap.values());
  }

  /**
   * INSTANCE children의 TEXT 노드에서 text prop 추출
   * 각 INSTANCE마다 TEXT 노드의 characters가 다르면 동적 텍스트로 간주
   */
  private extractTextPropFromInstances(
    instances: any[]
  ): ArraySlotItemProp | null {
    const textValues: string[] = [];

    for (const instance of instances) {
      if (!instance.children) continue;

      // 첫 번째 TEXT 노드 찾기
      const textNode = instance.children.find(
        (child: any) => child.type === "TEXT"
      );
      if (textNode?.characters) {
        textValues.push(textNode.characters);
      }
    }

    // TEXT 노드가 없거나 하나만 있으면 text prop 불필요
    if (textValues.length < 2) {
      return null;
    }

    // 모든 값이 동일하면 고정 텍스트이므로 prop 불필요
    const uniqueValues = [...new Set(textValues)];
    if (uniqueValues.length === 1) {
      return null;
    }

    // 다양한 값이 있으면 text prop으로 추가
    return {
      name: "text",
      type: "TEXT",
      values: uniqueValues,
      defaultValue: uniqueValues[0],
    };
  }

  /**
   * 아이템 props 추출 (레거시 - dependencies에서 추출)
   * @deprecated extractItemPropsFromInstances 사용 권장
   */
  private extractItemProps(
    componentSetId?: string,
    componentId?: string
  ): ArraySlotItemProp[] {
    const props: ArraySlotItemProp[] = [];

    // dependencies에서 찾기
    if (this.data.dependencies) {
      for (const [id, depData] of Object.entries(this.data.dependencies)) {
        const depInfo = depData.info;
        const depDocument = depInfo.document;

        // ComponentSet인 경우
        if (depDocument.componentPropertyDefinitions) {
          const definitions = depDocument.componentPropertyDefinitions;
          for (const [propName, propDef] of Object.entries(definitions)) {
            const def = propDef as any;
            props.push({
              name: this.toCamelCase(propName),
              type: def.type,
              values: def.variantOptions,
              defaultValue: def.defaultValue,
            });
          }
          return props;
        }
      }
    }

    return props;
  }

  /**
   * 노드에서 INSTANCE 찾기
   */
  private findInstances(node: any): any[] {
    const instances: any[] = [];

    if (node.type === "INSTANCE") {
      instances.push(node);
    }

    if (node.children) {
      for (const child of node.children) {
        instances.push(...this.findInstances(child));
      }
    }

    return instances;
  }

  /**
   * 문자열을 camelCase로 변환
   */
  private toCamelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
      .replace(/^(.)/, (char) => char.toLowerCase());
  }
}

export default ArraySlotDetector;

