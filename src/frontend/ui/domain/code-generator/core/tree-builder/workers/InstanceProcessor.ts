/**
 * Instance Processor
 *
 * INSTANCE 노드 처리 및 외부 참조 빌드를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - InstanceOverrideHandler: INSTANCE override 정보 추출 및 병합
 * - ExternalRefBuilder: 외부 컴포넌트 참조 정보 생성
 */

import type { PreparedDesignData } from "@code-generator/types/architecture";
import type {
  IInstanceOverrideHandler,
  IExternalRefBuilder,
  OverrideInfo as IOverrideInfo,
  ExternalRefInput,
  ExternalRefResult,
  BuildContext,
  ExternalRefData,
  FigmaFill,
  FigmaStroke,
  FigmaEffect,
  ComponentPropertyValue,
} from "./interfaces";
import { NodeProcessor } from "./NodeProcessor";
import { traverseTree } from "./utils/treeUtils";
import { toPascalCase } from "./utils/stringUtils";
import { toCamelCase } from "@code-generator/utils/normalizeString";
import { hasChildren, getComponentId } from "./utils/typeGuards";
import {
  extractColorFromFills,
  getOriginalId as getOriginalIdUtil,
  isInstanceChildId as isInstanceChildIdUtil,
} from "./utils/instanceUtils";

// ============================================================================
// Types
// ============================================================================

/** INSTANCE children에서 사용되는 노드 속성 */
interface InstanceChildNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  visible?: boolean;
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  effects?: FigmaEffect[];
  opacity?: number;
  cornerRadius?: number;
  componentProperties?: Record<string, ComponentPropertyValue>;
  children?: InstanceChildNode[];
}

// ============================================================================
// InstanceProcessor Class
// ============================================================================

/**
 * InstanceProcessor 클래스
 *
 * INSTANCE 노드의 override 정보를 처리하고
 * 외부 컴포넌트 참조 정보를 생성하는 통합 Processor
 */
export class InstanceProcessor implements IInstanceOverrideHandler, IExternalRefBuilder {
  // ==========================================================================
  // Static Pipeline Method
  // ==========================================================================

  static buildExternalRefs(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("InstanceProcessor.buildExternalRefs: internalTree is required.");
    }

    const instance = new InstanceProcessor();
    const nodeExternalRefs = new Map<string, ExternalRefData>();
    const rootId = ctx.internalTree.id;

    traverseTree(ctx.internalTree, (node) => {
      // Skip root node - root INSTANCE should render its children, not as external ref
      if (node.id === rootId) {
        return;
      }

      if (NodeProcessor.isComponentReference(node.type)) {
        const nodeSpec = ctx.data.getNodeById(node.id);
        const result = instance.buildExternalRef(
          {
            nodeId: node.id,
            nodeType: node.type,
            nodeName: node.name,
            nodeSpec,
          },
          ctx.data
        );

        if (result) {
          nodeExternalRefs.set(node.id, {
            componentSetId: result.componentSetId,
            componentName: result.componentName,
            props: result.props,
          });
        }
      }
    });

    return { ...ctx, nodeExternalRefs };
  }

  // ==========================================================================
  // InstanceOverrideHandler Methods
  // ==========================================================================

  /**
   * INSTANCE ID에서 원본 노드 ID 추출
   *
   * @example
   * getOriginalId("I704:56;704:29;692:1613") // "692:1613"
   * getOriginalId("123:456") // "123:456"
   */
  public getOriginalId(instanceId: string): string {
    return getOriginalIdUtil(instanceId);
  }

  /**
   * ID가 INSTANCE 자식 노드인지 확인
   */
  public isInstanceChildId(id: string): boolean {
    return isInstanceChildIdUtil(id);
  }

  /**
   * INSTANCE children에서 override 정보 추출
   *
   * @param instanceChildren - INSTANCE의 children 노드들
   * @param originalChildren - 원본 컴포넌트의 children 노드들
   * @returns Override 정보 목록
   */
  public extractOverrides(
    instanceChildren: SceneNode[],
    originalChildren: SceneNode[]
  ): IOverrideInfo[] {
    const overrides: IOverrideInfo[] = [];

    // 원본 children을 ID로 매핑
    const originalMap = new Map<string, InstanceChildNode>();
    const buildOriginalMap = (children: InstanceChildNode[]) => {
      for (const child of children) {
        originalMap.set(child.id, child);
        if (child.children) {
          buildOriginalMap(child.children);
        }
      }
    };
    buildOriginalMap(originalChildren as unknown as InstanceChildNode[]);

    // INSTANCE children 순회하며 override 추출
    const extractFromChildren = (children: InstanceChildNode[]) => {
      for (const child of children) {
        const originalId = this.getOriginalId(child.id);
        const original = originalMap.get(originalId);

        if (original) {
          const overrideInfo: IOverrideInfo = {
            originalId,
            instanceId: child.id,
            overrides: {},
          };

          // characters override
          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            overrideInfo.overrides.characters = child.characters;
          }

          // visible override
          if (
            child.visible !== undefined &&
            child.visible !== original.visible
          ) {
            overrideInfo.overrides.visible = child.visible;
          }

          // fills override
          if (
            child.fills !== undefined &&
            JSON.stringify(child.fills) !== JSON.stringify(original.fills)
          ) {
            overrideInfo.overrides.fills = child.fills;
          }

          // strokes override
          if (
            child.strokes !== undefined &&
            JSON.stringify(child.strokes) !== JSON.stringify(original.strokes)
          ) {
            overrideInfo.overrides.strokes = child.strokes;
          }

          // effects override
          if (
            child.effects !== undefined &&
            JSON.stringify(child.effects) !== JSON.stringify(original.effects)
          ) {
            overrideInfo.overrides.effects = child.effects;
          }

          // opacity override
          if (
            child.opacity !== undefined &&
            child.opacity !== original.opacity
          ) {
            overrideInfo.overrides.opacity = child.opacity;
          }

          // cornerRadius override
          if (
            child.cornerRadius !== undefined &&
            child.cornerRadius !== original.cornerRadius
          ) {
            overrideInfo.overrides.cornerRadius = child.cornerRadius;
          }

          // componentProperties override (nested INSTANCE의 props)
          if (
            child.componentProperties !== undefined &&
            JSON.stringify(child.componentProperties) !== JSON.stringify(original.componentProperties)
          ) {
            overrideInfo.overrides.componentProperties = child.componentProperties;
          }

          // override가 있으면 추가
          if (Object.keys(overrideInfo.overrides).length > 0) {
            overrides.push(overrideInfo);
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceChildren as unknown as InstanceChildNode[]);
    return overrides;
  }

  /**
   * INSTANCE override를 원본 노드에 적용
   *
   * @param originalChildren - 원본 children
   * @param instanceChildren - INSTANCE children
   * @returns 병합된 children (원본 ID 유지)
   */
  public mergeOverridesToOriginal(
    originalChildren: SceneNode[],
    instanceChildren: SceneNode[]
  ): SceneNode[] {
    // instanceChildren을 원본 ID로 매핑
    const overrideMap = new Map<string, InstanceChildNode>();
    const buildOverrideMap = (children: InstanceChildNode[]) => {
      for (const child of children) {
        const originalId = this.getOriginalId(child.id);
        overrideMap.set(originalId, child);
        if (child.children) {
          buildOverrideMap(child.children);
        }
      }
    };
    buildOverrideMap(instanceChildren as unknown as InstanceChildNode[]);

    // 원본 children에 override 적용
    const applyOverrides = (children: InstanceChildNode[]): InstanceChildNode[] => {
      return children.map((child) => {
        const override = overrideMap.get(child.id);
        const mergedChild = { ...child };

        if (override) {
          // characters 오버라이드
          if (override.characters !== undefined) {
            mergedChild.characters = override.characters;
          }

          // visible 오버라이드
          if (override.visible !== undefined) {
            mergedChild.visible = override.visible;
          }

          // fills 오버라이드
          if (override.fills !== undefined) {
            mergedChild.fills = override.fills;
          }

          // strokes 오버라이드
          if (override.strokes !== undefined) {
            mergedChild.strokes = override.strokes;
          }

          // effects 오버라이드
          if (override.effects !== undefined) {
            mergedChild.effects = override.effects;
          }

          // opacity 오버라이드
          if (override.opacity !== undefined) {
            mergedChild.opacity = override.opacity;
          }

          // cornerRadius 오버라이드
          if (override.cornerRadius !== undefined) {
            mergedChild.cornerRadius = override.cornerRadius;
          }

          // componentProperties 오버라이드 (nested INSTANCE)
          if (override.componentProperties !== undefined) {
            mergedChild.componentProperties = {
              ...mergedChild.componentProperties,
              ...override.componentProperties,
            };
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          mergedChild.children = applyOverrides(child.children);
        }

        return mergedChild;
      });
    };

    return applyOverrides(originalChildren as unknown as InstanceChildNode[]) as unknown as SceneNode[];
  }

  /**
   * INSTANCE 노드에서 variant props 추출
   *
   * INSTANCE가 참조하는 컴포넌트의 variant props를 추출합니다.
   * 예: "Size=Large, State=Default" → { size: "large", state: "default" }
   */
  public extractVariantProps(
    instanceNode: SceneNode,
    _data: PreparedDesignData
  ): Record<string, string> {
    const props: Record<string, string> = {};

    // componentProperties에서 variant props 추출
    const nodeWithProps = instanceNode as unknown as { componentProperties?: Record<string, ComponentPropertyValue> };
    if (nodeWithProps.componentProperties) {
      for (const [key, value] of Object.entries(nodeWithProps.componentProperties)) {
        const propValue = value as { type?: string; value?: string };
        if (propValue.type === "VARIANT" && propValue.value) {
          const propName = toCamelCase(key);
          props[propName] = propValue.value.toLowerCase();
        }
      }
    }

    return props;
  }

  /**
   * INSTANCE에서 오버라이드된 속성을 props 형태로 추출
   *
   * Figma의 overrides 배열을 활용하여 명시적으로 오버라이드된 필드만 추출합니다.
   * 이 방식은 원본 컴포넌트의 children 데이터가 없어도 동작합니다.
   *
   * 예: { rectangle1Bg: "#D6D6D6", aaText: "90" }
   */
  public extractOverrideProps(
    instanceNode: SceneNode,
    originalChildren: SceneNode[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};

    const instanceWithOverrides = instanceNode as unknown as {
      children?: InstanceChildNode[];
      overrides?: Array<{ id: string; overriddenFields: string[] }>;
    };

    if (!instanceWithOverrides?.children) return overrideProps;

    // overrides 배열에서 노드별 오버라이드 필드 맵 생성
    const overriddenFieldsMap = new Map<string, Set<string>>();
    if (instanceWithOverrides.overrides) {
      for (const override of instanceWithOverrides.overrides) {
        overriddenFieldsMap.set(override.id, new Set(override.overriddenFields));
      }
    }

    // 원본 children을 ID로 매핑 (이름 조회용, 비교용 아님)
    const originalMap = new Map<string, InstanceChildNode>();
    const buildOriginalMap = (children: InstanceChildNode[]) => {
      for (const child of children) {
        originalMap.set(child.id, child);
        if (child.children) {
          buildOriginalMap(child.children);
        }
      }
    };
    buildOriginalMap(originalChildren as unknown as InstanceChildNode[]);

    // INSTANCE children 순회
    const extractFromChildren = (children: InstanceChildNode[]) => {
      for (const child of children) {
        const overriddenFields = overriddenFieldsMap.get(child.id);
        const originalId = this.getOriginalId(child.id);
        const original = originalMap.get(originalId);

        // 노드 이름 결정 (원본 또는 현재 child에서)
        const nodeName = original?.name || child.name;
        const baseName = toCamelCase(nodeName);

        // overrides 배열이 있으면 명시적 오버라이드만 추출
        // overrides 배열이 없으면 원본과 비교 (fallback)
        if (overriddenFields) {
          // fills 또는 inheritFillStyleId 오버라이드 → Bg prop
          if (
            (overriddenFields.has("fills") || overriddenFields.has("inheritFillStyleId")) &&
            child.fills !== undefined
          ) {
            const bgColor = extractColorFromFills(child.fills);
            if (bgColor) {
              overrideProps[`${baseName}Bg`] = bgColor;
            }
          }

          // strokes 오버라이드 → Stroke prop
          if (overriddenFields.has("strokes") && child.strokes !== undefined) {
            const strokeColor = extractColorFromFills(child.strokes);
            if (strokeColor) {
              overrideProps[`${baseName}Stroke`] = strokeColor;
            }
          }

          // characters 오버라이드 → Text prop
          if (overriddenFields.has("characters") && child.characters !== undefined) {
            overrideProps[`${baseName}Text`] = child.characters;
          }

          // opacity 오버라이드 → Opacity prop
          if (overriddenFields.has("opacity") && child.opacity !== undefined) {
            overrideProps[`${baseName}Opacity`] = String(child.opacity);
          }

          // visible 오버라이드 → Show prop
          if (overriddenFields.has("visible") && child.visible !== undefined) {
            overrideProps[`show${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`] = String(child.visible);
          }
        } else if (original) {
          // Fallback: overrides 배열이 없으면 원본과 비교
          if (
            child.fills !== undefined &&
            JSON.stringify(child.fills) !== JSON.stringify(original.fills)
          ) {
            const bgColor = extractColorFromFills(child.fills);
            if (bgColor) {
              overrideProps[`${baseName}Bg`] = bgColor;
            }
          }

          if (
            child.strokes !== undefined &&
            JSON.stringify(child.strokes) !== JSON.stringify(original.strokes)
          ) {
            const strokeColor = extractColorFromFills(child.strokes);
            if (strokeColor) {
              overrideProps[`${baseName}Stroke`] = strokeColor;
            }
          }

          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            overrideProps[`${baseName}Text`] = child.characters;
          }

          if (
            child.opacity !== undefined &&
            child.opacity !== original.opacity
          ) {
            overrideProps[`${baseName}Opacity`] = String(child.opacity);
          }

          if (
            child.visible !== undefined &&
            child.visible !== original.visible
          ) {
            overrideProps[`show${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`] = String(child.visible);
          }
        }

        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceWithOverrides.children);
    return overrideProps;
  }

  // ==========================================================================
  // ExternalRefBuilder Methods
  // ==========================================================================

  /**
   * 외부 컴포넌트 참조 정보 생성
   *
   * @returns ExternalRefResult 또는 undefined (외부 참조가 아닌 경우)
   */
  public buildExternalRef(
    input: ExternalRefInput,
    data: PreparedDesignData
  ): ExternalRefResult | undefined {
    const { nodeType, nodeSpec, nodeName } = input;

    // 1. 컴포넌트 참조 타입 확인
    if (!NodeProcessor.isComponentReference(nodeType)) {
      return undefined;
    }

    // 2. nodeSpec 필수
    if (!nodeSpec) {
      return undefined;
    }

    // 3. componentId 추출
    const componentId = getComponentId(nodeSpec);
    if (!componentId) {
      return undefined;
    }

    // 4. dependencies에서 찾기
    if (!data.dependencies?.has(componentId)) {
      return undefined;
    }

    const depData = data.dependencies.get(componentId);
    if (!depData?.info) {
      return undefined;
    }

    // 5. Variant props 추출
    const variantProps = this.extractVariantProps(nodeSpec, data);

    // 6. Override props 추출
    const depDocument = depData.info.document;
    const originalChildren = depDocument && hasChildren(depDocument)
      ? depDocument.children
      : [];
    const overrideProps = this.extractOverrideProps(
      nodeSpec,
      originalChildren as SceneNode[]
    );

    // 7. ComponentSetId 결정
    const components = depData.info.components as
      | Record<string, { componentSetId?: string }>
      | undefined;
    const componentSetId = components?.[componentId]?.componentSetId;

    // 8. ComponentSet 이름 결정
    // componentSetId가 있으면 componentSets에서 이름 조회, 없으면 document.name 사용
    let componentName: string;
    if (componentSetId) {
      const componentSets = depData.info.componentSets as
        | Record<string, { name?: string }>
        | undefined;
      const componentSetInfo = componentSets?.[componentSetId];
      componentName = componentSetInfo?.name || depData.info.document?.name || nodeName;
    } else {
      componentName = depData.info.document?.name || nodeName;
    }

    // 9. 결과 반환
    return {
      componentSetId: componentSetId || componentId,
      componentName: toPascalCase(componentName),
      props: { ...variantProps, ...overrideProps },
    };
  }
}

export default InstanceProcessor;
