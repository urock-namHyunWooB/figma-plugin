import SpecDataManager from "./SpecDataManager";
import { toCamelCase } from "@compiler/utils/normalizeString";

export type PropsDef = Record<string, any>;

/**
 * Figma 원본 데이터에서 Props 정의를 추출하는 클래스
 *
 * - componentPropertyDefinitions (COMPONENT_SET)
 * - componentProperties (INSTANCE/COMPONENT)
 * - componentPropertyReferences (dependencies)
 *
 * 에서 props를 추출하고 정규화합니다.
 */
class PropsExtractor {
  private specDataManager: SpecDataManager;
  private propsDef: PropsDef = {};

  public get refinedProps() {
    return this.propsDef;
  }

  constructor(specDataManager: SpecDataManager) {
    this.specDataManager = specDataManager;

    // COMPONENT_SET: componentPropertyDefinitions 사용
    // INSTANCE/COMPONENT: componentProperties 사용 (형식 변환 필요)
    let propsDef = specDataManager.getComponentPropertyDefinitions();

    if (!propsDef) {
      // INSTANCE의 componentProperties를 propsDef 형식으로 변환
      const componentProperties = specDataManager.getComponentProperties();
      if (componentProperties) {
        propsDef =
          this.convertComponentPropertiesToDefinitions(componentProperties);
      }
    }

    this.propsDef = propsDef || {};

    // componentPropertyReferences에서 참조하는 props 자동 추출
    // (componentPropertyDefinitions가 없는 dependencies 컴포넌트 지원)
    const referencedProps = this.extractPropsFromPropertyReferences(
      specDataManager.getDocument()
    );
    this.propsDef = { ...this.propsDef, ...referencedProps };

    if (this.propsDef) {
      this.propsDef = this.normalizePropsName(this.propsDef);
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
   * document를 순회하여 componentPropertyReferences에서 props 추출
   * componentPropertyDefinitions가 없는 COMPONENT (dependencies)에서 사용
   *
   * 예: TEXT 노드의 componentPropertyReferences.characters = "Text#1140:2"
   * → text prop 생성
   */
  private extractPropsFromPropertyReferences(document: any): PropsDef {
    const propsDef: PropsDef = {};
    const typeCounters: Record<string, number> = {};
    const processedRefs = new Set<string>();

    const traverse = (node: any) => {
      if (!node) return;

      const refs = node.componentPropertyReferences;
      if (refs) {
        // characters 참조 → TEXT prop
        if (refs.characters && !processedRefs.has(refs.characters)) {
          processedRefs.add(refs.characters);
          const propName = this.generatePropName(
            refs.characters,
            "TEXT",
            typeCounters
          );
          propsDef[propName] = {
            type: "TEXT",
            defaultValue: node.characters || node.name || "",
            originalKey: refs.characters,
          };
        }

        // visible 참조 → BOOLEAN prop
        if (refs.visible && !processedRefs.has(refs.visible)) {
          processedRefs.add(refs.visible);
          const propName = this.generatePropName(
            refs.visible,
            "BOOLEAN",
            typeCounters
          );
          propsDef[propName] = {
            type: "BOOLEAN",
            defaultValue: node.visible !== false,
            originalKey: refs.visible,
          };
        }
      }

      // children 순회
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(document);
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
}

export default PropsExtractor;
