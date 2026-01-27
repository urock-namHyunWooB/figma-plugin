/**
 * Instance Processor
 *
 * INSTANCE 노드 처리 및 외부 참조 빌드를 담당하는 통합 Processor
 *
 * 포함된 기능:
 * - InstanceOverrideHandler: INSTANCE override 정보 추출 및 병합
 * - ExternalRefBuilder: 외부 컴포넌트 참조 정보 생성
 */

import type { PreparedDesignData } from "@compiler/types/architecture";
import type {
  IInstanceOverrideHandler,
  IExternalRefBuilder,
  OverrideInfo as IOverrideInfo,
  ExternalRefInput,
  ExternalRefResult,
  BuildContext,
  InternalNode,
  ExternalRefData,
} from "./interfaces";
import { NodeProcessor } from "./NodeProcessor";
import { toPascalCase, toCamelCase } from "./utils/stringUtils";
import { hasChildren, getComponentId } from "./utils/typeGuards";
import {
  extractColorFromFills,
  getOriginalId as getOriginalIdUtil,
  isInstanceChildId as isInstanceChildIdUtil,
} from "./utils/instanceUtils";

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

    const traverse = (node: InternalNode) => {
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

      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(ctx.internalTree);

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
    instanceChildren: any[],
    originalChildren: any[]
  ): IOverrideInfo[] {
    const overrides: IOverrideInfo[] = [];

    // 원본 children을 ID로 매핑
    const originalMap = new Map<string, any>();
    const buildOriginalMap = (children: any[]) => {
      for (const child of children) {
        originalMap.set(child.id, child);
        if (child.children) {
          buildOriginalMap(child.children);
        }
      }
    };
    buildOriginalMap(originalChildren);

    // INSTANCE children 순회하며 override 추출
    const extractFromChildren = (children: any[]) => {
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

    extractFromChildren(instanceChildren);
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
    originalChildren: any[],
    instanceChildren: any[]
  ): any[] {
    // instanceChildren을 원본 ID로 매핑
    const overrideMap = new Map<string, any>();
    const buildOverrideMap = (children: any[]) => {
      for (const child of children) {
        const originalId = this.getOriginalId(child.id);
        overrideMap.set(originalId, child);
        if (child.children) {
          buildOverrideMap(child.children);
        }
      }
    };
    buildOverrideMap(instanceChildren);

    // 원본 children에 override 적용
    const applyOverrides = (children: any[]): any[] => {
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

    return applyOverrides(originalChildren);
  }

  /**
   * INSTANCE 노드에서 variant props 추출
   *
   * INSTANCE가 참조하는 컴포넌트의 variant props를 추출합니다.
   * 예: "Size=Large, State=Default" → { size: "large", state: "default" }
   */
  public extractVariantProps(
    instanceNode: any,
    _data: PreparedDesignData
  ): Record<string, string> {
    const props: Record<string, string> = {};

    // componentProperties에서 variant props 추출
    if (instanceNode.componentProperties) {
      for (const [key, value] of Object.entries(instanceNode.componentProperties)) {
        const propValue = value as any;
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
   * 예: { rectangle1Bg: "#D6D6D6", labelText: "Click me" }
   */
  public extractOverrideProps(
    instanceNode: any,
    originalChildren: any[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};

    if (!instanceNode?.children) return overrideProps;

    // 원본 children을 ID로 매핑
    const originalMap = new Map<string, any>();
    const buildOriginalMap = (children: any[]) => {
      for (const child of children) {
        originalMap.set(child.id, child);
        if (child.children) {
          buildOriginalMap(child.children);
        }
      }
    };
    buildOriginalMap(originalChildren);

    // INSTANCE children 순회
    const extractFromChildren = (children: any[]) => {
      for (const child of children) {
        const originalId = this.getOriginalId(child.id);
        const original = originalMap.get(originalId);

        if (original) {
          const baseName = toCamelCase(original.name);

          // fills override → Bg prop
          if (
            child.fills !== undefined &&
            JSON.stringify(child.fills) !== JSON.stringify(original.fills)
          ) {
            const bgColor = extractColorFromFills(child.fills);
            if (bgColor) {
              overrideProps[`${baseName}Bg`] = bgColor;
            }
          }

          // strokes override → Stroke prop
          if (
            child.strokes !== undefined &&
            JSON.stringify(child.strokes) !== JSON.stringify(original.strokes)
          ) {
            const strokeColor = extractColorFromFills(child.strokes);
            if (strokeColor) {
              overrideProps[`${baseName}Stroke`] = strokeColor;
            }
          }

          // characters override → Text prop
          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            overrideProps[`${baseName}Text`] = child.characters;
          }

          // opacity override → Opacity prop
          if (
            child.opacity !== undefined &&
            child.opacity !== original.opacity
          ) {
            overrideProps[`${baseName}Opacity`] = String(child.opacity);
          }

          // visible override → Show prop
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

    extractFromChildren(instanceNode.children);
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

    // 8. 결과 반환
    return {
      componentSetId: componentSetId || componentId,
      componentName: toPascalCase(depData.info.document?.name || nodeName),
      props: { ...variantProps, ...overrideProps },
    };
  }
}

export default InstanceProcessor;
