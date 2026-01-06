import { RenderTree } from "@compiler";
import SpecDataManager from "@compiler/manager/SpecDataManager";

import { toCamelCase } from "@compiler/utils/normalizeString";

export type PropsDef = Record<string, any>;

class RefineProps {
  private specDataManager: SpecDataManager;
  private renderTree: RenderTree;

  private propsDef: PropsDef = {};

  public get refinedProps() {
    return this.propsDef;
  }

  constructor(renderTree: RenderTree, specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;
    this.renderTree = renderTree;

    // COMPONENT_SET: componentPropertyDefinitions 사용
    // INSTANCE/COMPONENT: componentProperties 사용 (형식 변환 필요)
    let propsDef = specDataManager.getComponentPropertyDefinitions();

    if (!propsDef) {
      // INSTANCE의 componentProperties를 propsDef 형식으로 변환
      const componentProperties = specDataManager.getComponentProperties();
      if (componentProperties) {
        propsDef = this.convertComponentPropertiesToDefinitions(
          componentProperties
        );
      }
    }

    this.propsDef = propsDef || {};

    if (this.propsDef) {
      this.propsDef = this.addId(this.propsDef);
      this.propsDef = this.normalizePropsName(this.propsDef);
      // this.propsDef = this.refineLikeComponent(this.propsDef);
      // this.propsDef = this.refineStateProp(this.propsDef);
    }
  }

  /**
   * INSTANCE의 componentProperties를 componentPropertyDefinitions 형식으로 변환
   * 입력: { "Number#796:3": { type: "TEXT", value: "10" }, ... }
   * 출력: { "text": { type: "TEXT", defaultValue: "10" }, ... }
   *
   * VARIANT 타입은 INSTANCE에서 의미 없으므로 제외
   * TEXT 타입은 의미있는 이름으로 변환 (text, text2, text3, ...)
   */
  private convertComponentPropertiesToDefinitions(
    componentProperties: Record<string, any>
  ): PropsDef {
    const propsDef: PropsDef = {};
    const typeCounters: Record<string, number> = {};

    for (const [key, value] of Object.entries(componentProperties)) {
      // VARIANT 타입은 INSTANCE에서 사용되지 않으므로 제외
      // (COMPONENT_SET에서만 variant 선택에 의미가 있음)
      if (value.type === "VARIANT") {
        continue;
      }

      // 타입 기반 의미있는 prop 이름 생성
      const propName = this.generatePropName(key, value.type, typeCounters);

      propsDef[propName] = {
        type: value.type,
        defaultValue: value.value,
        // 원본 키 저장 (노드에서 참조 시 매핑용)
        originalKey: key,
      };
    }

    return propsDef;
  }

  /**
   * 타입 기반으로 의미있는 prop 이름 생성
   * TEXT → text, text2, text3...
   * BOOLEAN → visible, visible2...
   */
  private generatePropName(
    originalKey: string,
    type: string,
    counters: Record<string, number>
  ): string {
    // 타입별 기본 이름
    const baseNames: Record<string, string> = {
      TEXT: "text",
      BOOLEAN: "visible",
      INSTANCE_SWAP: "slot",
    };

    const baseName = baseNames[type] || "prop";
    counters[type] = (counters[type] || 0) + 1;

    // 첫 번째는 숫자 없이, 이후는 숫자 추가
    return counters[type] === 1 ? baseName : `${baseName}${counters[type]}`;
  }

  /**
   * prop 이름에서 특수문자 제거 (Number#796:3 → Number7963)
   * @deprecated generatePropName 사용 권장
   */
  private normalizePropertyName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, "");
  }

  private addId(propsDef: PropsDef) {
    const props = {} as PropsDef;

    return propsDef;
  }

  /**
   * prop 이름을 camelCase로 정규화
   * 예: "With label" → "withLabel"
   * 원본 키는 originalKey 필드에 저장 (TypeScript 타입 인덱싱용)
   */
  private normalizePropsName(propsDef: PropsDef) {
    const props = {} as PropsDef;

    Object.entries(propsDef).forEach(([key, value]) => {
      const normalizedKey = toCamelCase(key);
      // 빈 문자열이면 스킵 (특수문자만 있는 경우)
      if (!normalizedKey) return;
      
      props[normalizedKey] = {
        ...value,
        // 이미 originalKey가 있으면 보존, 없으면 현재 key 사용
        originalKey: value.originalKey || key,
      };
    });

    return props;
  }

  private refineLikeComponent(propsDef: PropsDef) {
    Object.entries(propsDef).forEach(([key, value]) => {
      if (
        ((value.type === "VARIANT" &&
          value.variantOptions?.[0].toLowerCase() === "false") ||
          value.variantOptions?.[0].toLowerCase() === "true") &&
        (value.variantOptions?.[1].toLowerCase() === "false" ||
          value.variantOptions?.[1].toLowerCase() === "true")
      ) {
        value.type = "Component";
        delete value.defaultValue;
        delete value.variantOptions;
      }
    });

    return propsDef;
  }

  private refineStateProp(propsDef: PropsDef) {
    Object.entries(propsDef).forEach(([key, value]) => {
      if (
        key.toLowerCase().includes("state") &&
        value.type === "VARIANT" &&
        (value.variantOptions.includes("Hover") ||
          value.variantOptions.includes("hover") ||
          value.variantOptions.includes("HOVER"))
      ) {
        delete propsDef[key];
      }
    });

    return propsDef;
  }
}

export default RefineProps;
