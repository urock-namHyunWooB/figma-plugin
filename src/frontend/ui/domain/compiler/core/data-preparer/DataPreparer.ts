import type { FigmaNodeData, StyleTree } from "@compiler/types/baseType";
import type { IDataPreparer, DataPreparerPolicy } from "@compiler/types/architecture";
import type { PropsDef } from "@compiler/manager/PropsExtractor";
import { toCamelCase } from "@compiler/utils/normalizeString";
import PreparedDesignData from "./PreparedDesignData";

/**
 * DataPreparer
 *
 * Figma 원본 데이터를 준비된 형태로 변환합니다.
 *
 * 주요 기능:
 * 1. 원본 데이터 깊은 복사
 * 2. HashMap 기반 O(1) 조회 구조 구축
 * 3. Props 추출 및 정규화
 */
class DataPreparer implements IDataPreparer {
  /**
   * FigmaNodeData를 PreparedDesignData로 변환
   */
  public prepare(
    data: FigmaNodeData,
    policy?: DataPreparerPolicy
  ): PreparedDesignData {
    // 원본 변질 방지를 위해 깊은 복사
    const spec: FigmaNodeData = JSON.parse(JSON.stringify(data));

    const document = spec.info.document;
    const styleTree = spec.styleTree;

    // HashMap 구축
    const nodeMap = this.buildNodeMap(document);
    const styleMap = this.buildStyleMap(styleTree);

    // Props 추출
    let props = this.extractProps(document, policy);

    // _overrideableProps 처리 (의존 컴포넌트 컴파일 시)
    // DependencyManager._collectAllOverrideableProps()에서 수집된 오버라이드 가능한 props
    if ((spec as any)._overrideableProps) {
      props = this.mergeOverrideableProps(
        props,
        (spec as any)._overrideableProps
      );
    }

    // 의존성 Map 구축
    const dependencies = this.buildDependenciesMap(spec.dependencies);

    // 이미지 URL Map 구축
    const imageUrls = this.buildImageUrlsMap(spec.imageUrls);

    // Vector SVG Map 구축
    const vectorSvgs = this.buildVectorSvgsMap(spec.vectorSvgs);

    return new PreparedDesignData(
      spec,
      document,
      styleTree,
      nodeMap,
      styleMap,
      props,
      dependencies,
      imageUrls,
      vectorSvgs
    );
  }

  /**
   * document 트리를 순회하여 nodeMap 구축
   * O(n) 구축, O(1) 조회
   */
  private buildNodeMap(document: SceneNode): Map<string, SceneNode> {
    const nodeMap = new Map<string, SceneNode>();

    const traverse = (node: SceneNode) => {
      nodeMap.set(node.id, node);

      if ("children" in node && node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(document);
    return nodeMap;
  }

  /**
   * styleTree를 순회하여 styleMap 구축
   * O(n) 구축, O(1) 조회
   */
  private buildStyleMap(styleTree: StyleTree): Map<string, StyleTree> {
    const styleMap = new Map<string, StyleTree>();

    const traverse = (tree: StyleTree) => {
      styleMap.set(tree.id, tree);

      if ("children" in tree && tree.children) {
        for (const child of tree.children) {
          traverse(child);
        }
      }
    };

    traverse(styleTree);
    return styleMap;
  }

  /**
   * Props 추출 및 정규화
   *
   * - COMPONENT_SET: componentPropertyDefinitions 사용
   * - INSTANCE/COMPONENT: componentProperties를 definitions 형식으로 변환
   * - componentPropertyReferences에서 참조하는 props 자동 추출
   */
  private extractProps(document: SceneNode, policy?: DataPreparerPolicy): PropsDef {
    let propsDef: PropsDef = {};

    // COMPONENT_SET: componentPropertyDefinitions 사용
    if ("componentPropertyDefinitions" in document) {
      propsDef = (document as any).componentPropertyDefinitions || {};
    } else if ("componentProperties" in document) {
      // INSTANCE/COMPONENT: componentProperties를 definitions 형식으로 변환
      propsDef = this.convertComponentPropertiesToDefinitions(
        (document as any).componentProperties
      );
    }

    // componentPropertyReferences에서 참조하는 props 자동 추출
    const referencedProps = this.extractPropsFromPropertyReferences(document);
    propsDef = { ...propsDef, ...referencedProps };

    // prop 이름 정규화 (camelCase)
    propsDef = this.normalizePropsName(propsDef);

    // 커스텀 props 추출 (policy에서 제공된 경우)
    if (policy?.extractCustomProps) {
      const customProps = policy.extractCustomProps({
        info: { document } as any,
      } as FigmaNodeData);
      propsDef = { ...propsDef, ...customProps };
    }

    return propsDef;
  }

  /**
   * INSTANCE의 componentProperties를 componentPropertyDefinitions 형식으로 변환
   */
  private convertComponentPropertiesToDefinitions(
    componentProperties: Record<string, any>
  ): PropsDef {
    const propsDef: PropsDef = {};
    const typeCounters: Record<string, number> = {};

    for (const [key, value] of Object.entries(componentProperties)) {
      // VARIANT 타입은 INSTANCE에서 사용되지 않으므로 제외
      if (value.type === "VARIANT") {
        continue;
      }

      const propName = this.generatePropName(key, value.type, typeCounters);

      propsDef[propName] = {
        type: value.type,
        defaultValue: value.value,
        originalKey: key,
      };
    }

    return propsDef;
  }

  /**
   * document를 순회하여 componentPropertyReferences에서 props 추출
   */
  private extractPropsFromPropertyReferences(document: SceneNode): PropsDef {
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
   */
  private generatePropName(
    _originalKey: string,
    type: string,
    counters: Record<string, number>
  ): string {
    const baseNames: Record<string, string> = {
      TEXT: "text",
      BOOLEAN: "visible",
      INSTANCE_SWAP: "slot",
    };

    const baseName = baseNames[type] || "prop";
    counters[type] = (counters[type] || 0) + 1;

    return counters[type] === 1 ? baseName : `${baseName}${counters[type]}`;
  }

  /**
   * prop 이름을 camelCase로 정규화
   */
  private normalizePropsName(propsDef: PropsDef): PropsDef {
    const props: PropsDef = {};

    Object.entries(propsDef).forEach(([key, value]) => {
      const normalizedKey = toCamelCase(key);
      if (!normalizedKey) return;

      props[normalizedKey] = {
        ...value,
        originalKey: value.originalKey || key,
      };
    });

    return props;
  }

  /**
   * _overrideableProps를 PropsDef에 병합
   *
   * 의존 컴포넌트가 부모로부터 오버라이드 값을 받을 수 있도록
   * props interface에 추가합니다.
   *
   * - fills 오버라이드 (xxxBg) → string (CSS 색상)
   * - characters 오버라이드 (xxxText) → string | React.ReactNode
   */
  private mergeOverrideableProps(
    props: PropsDef,
    overrideableProps: Record<
      string,
      { nodeId: string; nodeName: string; type: string }
    >
  ): PropsDef {
    const mergedProps = { ...props };

    for (const [propName, info] of Object.entries(overrideableProps)) {
      // 이미 존재하면 건너뛰기
      if (mergedProps[propName]) continue;

      // fills → TEXT (색상 문자열), characters → TEXT (텍스트)
      mergedProps[propName] = {
        type: "TEXT",
        defaultValue: "",
        originalKey: propName,
      };
    }

    return mergedProps;
  }

  /**
   * dependencies를 Map으로 변환
   */
  private buildDependenciesMap(
    dependencies?: Record<string, FigmaNodeData>
  ): Map<string, FigmaNodeData> {
    const map = new Map<string, FigmaNodeData>();
    if (!dependencies) return map;

    for (const [key, value] of Object.entries(dependencies)) {
      map.set(key, value);
    }

    return map;
  }

  /**
   * imageUrls를 Map으로 변환
   */
  private buildImageUrlsMap(
    imageUrls?: Record<string, string>
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (!imageUrls) return map;

    for (const [key, value] of Object.entries(imageUrls)) {
      map.set(key, value);
    }

    return map;
  }

  /**
   * vectorSvgs를 Map으로 변환
   */
  private buildVectorSvgsMap(
    vectorSvgs?: Record<string, string>
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (!vectorSvgs) return map;

    for (const [key, value] of Object.entries(vectorSvgs)) {
      map.set(key, value);
    }

    return map;
  }
}

export default DataPreparer;
