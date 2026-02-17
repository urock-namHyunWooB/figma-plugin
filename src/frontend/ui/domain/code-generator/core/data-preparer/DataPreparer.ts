import type { FigmaNodeData, StyleTree } from "@code-generator/types/baseType";
import type { IDataPreparer, DataPreparerPolicy } from "@code-generator/types/architecture";
import type { PropsDef } from "@code-generator/manager/PropsExtractor";
import { toCamelCase } from "@code-generator/utils/normalizeString";
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
   * @param data - Figma에서 추출한 원본 노드 데이터
   * @param policy - 데이터 준비 정책 (커스텀 props 추출 함수 등)
   * @returns HashMap 기반 O(1) 조회 구조를 가진 PreparedDesignData
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
   * @param document - 루트 SceneNode
   * @returns 노드 ID를 키로 하는 SceneNode Map
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
   * @param styleTree - 루트 StyleTree
   * @returns 스타일 ID를 키로 하는 StyleTree Map
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
   * @param document - 루트 SceneNode
   * @param policy - 데이터 준비 정책
   * @returns 정규화된 Props 정의 객체
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

    // prop 이름 정규화 (camelCase) - componentPropertyDefinitions만 정규화
    propsDef = this.normalizePropsName(propsDef);

    // componentPropertyReferences에서 참조하는 props 자동 추출
    // (이미 componentPropertyDefinitions에 있는 prop은 제외)
    // 원본 ref 키를 그대로 유지 (이름 생성은 PropsProcessor에서)
    // 중복 체크: 정규화된 키 + 각 prop의 originalKey 모두 포함
    const existingPropKeys = new Set<string>();
    for (const [key, value] of Object.entries(propsDef)) {
      existingPropKeys.add(key);
      if (value.originalKey) {
        existingPropKeys.add(value.originalKey);
      }
    }
    const referencedProps = this.extractPropsFromPropertyReferences(document, existingPropKeys);
    propsDef = { ...propsDef, ...referencedProps };

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
   *
   * 원본 키를 그대로 사용합니다 (이름 생성은 PropsProcessor에서).
   * @param componentProperties - INSTANCE의 componentProperties
   * @returns componentPropertyDefinitions 형식으로 변환된 PropsDef
   */
  private convertComponentPropertiesToDefinitions(
    componentProperties: Record<string, any>
  ): PropsDef {
    const propsDef: PropsDef = {};

    for (const [key, value] of Object.entries(componentProperties)) {
      // VARIANT 타입은 INSTANCE에서 사용되지 않으므로 제외
      if (value.type === "VARIANT") {
        continue;
      }

      // 원본 키를 그대로 사용 (이름 생성은 PropsProcessor에서)
      propsDef[key] = {
        type: value.type,
        defaultValue: value.value,
        originalKey: key,
      };
    }

    return propsDef;
  }

  /**
   * document를 순회하여 componentPropertyReferences에서 props 추출
   *
   * 원본 ref 키를 그대로 prop 키로 사용합니다.
   * prop 이름 생성은 PropsProcessor에서 담당합니다.
   * @param document - 루트 SceneNode
   * @param existingPropKeys - 이미 componentPropertyDefinitions에 정의된 prop 키들 (중복 방지)
   * @returns 참조된 props 정의 객체
   */
  private extractPropsFromPropertyReferences(
    document: SceneNode,
    existingPropKeys: Set<string>
  ): PropsDef {
    const propsDef: PropsDef = {};
    const processedRefs = new Set<string>();

    const traverse = (node: any) => {
      if (!node) return;

      const refs = node.componentPropertyReferences;
      if (refs) {
        // characters 참조 → TEXT prop
        if (refs.characters && !processedRefs.has(refs.characters)) {
          // 이미 componentPropertyDefinitions에 있으면 건너뛰기
          if (!existingPropKeys.has(refs.characters)) {
            processedRefs.add(refs.characters);
            // 원본 ref 키를 그대로 사용 (이름 생성은 PropsProcessor에서)
            propsDef[refs.characters] = {
              type: "TEXT",
              defaultValue: node.characters || node.name || "",
              originalKey: refs.characters,
            };
          }
        }

        // visible 참조 → BOOLEAN prop
        if (refs.visible && !processedRefs.has(refs.visible)) {
          // 이미 componentPropertyDefinitions에 있으면 건너뛰기
          if (!existingPropKeys.has(refs.visible)) {
            processedRefs.add(refs.visible);
            // 원본 ref 키를 그대로 사용 (이름 생성은 PropsProcessor에서)
            propsDef[refs.visible] = {
              type: "BOOLEAN",
              defaultValue: node.visible !== false,
              originalKey: refs.visible,
            };
          }
        }
      }

      // children 순회 (INSTANCE 내부는 제외 - dependency의 내부 구조이므로)
      if (node.children && Array.isArray(node.children) && node.type !== "INSTANCE") {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(document);
    return propsDef;
  }

  /**
   * prop 이름을 camelCase로 정규화
   * @param propsDef - 정규화 전 Props 정의
   * @returns camelCase로 정규화된 Props 정의
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
   * @param props - 기존 Props 정의
   * @param overrideableProps - 오버라이드 가능한 props 정보
   * @returns 오버라이드 가능한 props가 병합된 Props 정의
   */
  private mergeOverrideableProps(
    props: PropsDef,
    overrideableProps: Record<
      string,
      { nodeId: string; nodeName: string; type: string; variantValue?: string; cssStyle?: Record<string, string> }
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
        nodeId: info.nodeId, // 원본 노드 ID 저장 (prop 바인딩용)
        nodeName: info.nodeName, // 노드 이름 저장 (fallback 매칭용)
        variantValue: info.variantValue, // 어느 variant에서 왔는지 (조건부 렌더링용)
        cssStyle: info.cssStyle, // 원본 노드의 CSS 스타일 (조건부 스타일 적용용)
      };
    }

    return mergedProps;
  }

  /**
   * dependencies를 Map으로 변환
   * @param dependencies - 의존성 컴포넌트 데이터 객체
   * @returns 컴포넌트 ID를 키로 하는 FigmaNodeData Map
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
   * @param imageUrls - 이미지 참조와 URL 매핑 객체
   * @returns 이미지 참조를 키로 하는 URL Map
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
   * @param vectorSvgs - 벡터 노드 ID와 SVG 문자열 매핑 객체
   * @returns 노드 ID를 키로 하는 SVG 문자열 Map
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
