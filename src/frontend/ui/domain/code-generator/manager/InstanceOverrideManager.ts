import SpecDataManager from "./SpecDataManager";

import type { FigmaNodeData } from "@code-generator/types/baseType";

/**
 * INSTANCE 노드의 오버라이드를 원본 COMPONENT/variant에 병합하는 매니저
 *
 * Figma에서 INSTANCE는 COMPONENT의 복제본이며,
 * 텍스트(characters), 가시성(visible), 색상(fills) 등을 오버라이드할 수 있습니다.
 * 이 매니저는 INSTANCE의 오버라이드를 원본 데이터에 병합하는 역할을 담당합니다.
 */
class InstanceOverrideManager {
  constructor(private specDataManager: SpecDataManager) {}

  /**
   * 메인 문서에서 componentId별 INSTANCE 노드 ID 목록 찾기
   */
  public findInstancesByComponentId(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const document = this.specDataManager.getDocument();

    const traverse = (node: any) => {
      if (!node) return;
      if (node.type === "INSTANCE" && node.componentId) {
        const componentId = node.componentId;
        if (!result.has(componentId)) {
          result.set(componentId, []);
        }
        result.get(componentId)!.push(node.id);
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(document);
    return result;
  }

  /**
   * 메인 문서 및 dependency 문서에서 특정 componentId를 참조하는 INSTANCE 노드 전체 데이터 찾기
   * INSTANCE의 children을 사용하여 부모 컨텍스트의 visible 상태를 반영
   */
  public findInstanceNodeForComponentId(componentId: string): any | null {
    const traverse = (node: any): any | null => {
      if (!node) return null;
      if (node.type === "INSTANCE" && node.componentId === componentId) {
        return node;
      }
      if (node.children) {
        for (const child of node.children) {
          const found = traverse(child);
          if (found) return found;
        }
      }
      return null;
    };

    // 1. 메인 document에서 먼저 검색
    const document = this.specDataManager.getDocument();
    const foundInMain = traverse(document);
    if (foundInMain) return foundInMain;

    // 2. 메인에서 못 찾으면 dependency documents에서 검색
    const dependencies = this.specDataManager.getDependencies();
    if (dependencies) {
      for (const depData of Object.values(dependencies)) {
        const depDocument = (depData as any)?.info?.document;
        if (depDocument) {
          const foundInDep = traverse(depDocument);
          if (foundInDep) return foundInDep;
        }
      }
    }

    return null;
  }

  /**
   * INSTANCE 노드의 컨텍스트를 variant에 병합
   * INSTANCE의 children(I...로 시작하는 ID)을 사용하여 부모 컨텍스트 반영
   */
  public enrichVariantWithInstanceContext(
    variant: FigmaNodeData,
    instanceNode: any
  ): FigmaNodeData {
    if (!instanceNode || !instanceNode.children) {
      return variant;
    }

    // styleTree에서 INSTANCE의 children 부분 찾기
    const instanceStyleTree = this.findStyleTreeForInstance(instanceNode.id);

    // INSTANCE children의 오버라이드를 원본 variant children에 적용
    // (INSTANCE children ID는 I...로 시작해서 그대로 사용하면 updateCleanupNodes에서 삭제됨)
    const mergedChildren = this.mergeInstanceOverrides(
      variant.info.document.children || [],
      instanceNode.children || []
    );

    const newDocument = {
      ...variant.info.document,
      children: mergedChildren,
    };

    // styleTree도 병합 (있는 경우)
    let newStyleTree = variant.styleTree;
    if (instanceStyleTree?.children) {
      const mergedStyleChildren = this.mergeStyleTreeChildren(
        variant.styleTree?.children || [],
        instanceStyleTree.children || []
      );
      newStyleTree = {
        ...variant.styleTree,
        children: mergedStyleChildren,
      };
    }

    return {
      ...variant,
      info: {
        ...variant.info,
        document: newDocument,
      },
      styleTree: newStyleTree,
    };
  }

  /**
   * INSTANCE의 styleTree만 병합 (children은 원본 유지)
   * visible: false 노드가 있을 때 사용 - 크기 override는 적용하되 visible 상태는 원본 유지
   */
  public enrichVariantWithStyleTreeOnly(
    variant: FigmaNodeData,
    instanceNode: any
  ): FigmaNodeData {
    if (!instanceNode) {
      return variant;
    }

    // styleTree에서 INSTANCE의 children 부분 찾기
    const instanceStyleTree = this.findStyleTreeForInstance(instanceNode.id);

    // styleTree만 병합 (children은 원본 유지)
    let newStyleTree = variant.styleTree;
    if (instanceStyleTree?.children) {
      const mergedStyleChildren = this.mergeStyleTreeChildren(
        variant.styleTree?.children || [],
        instanceStyleTree.children || []
      );
      newStyleTree = {
        ...variant.styleTree,
        children: mergedStyleChildren,
      };
    }

    return {
      ...variant,
      styleTree: newStyleTree,
    };
  }

  /**
   * INSTANCE children을 그대로 사용 (오버라이드가 없는 경우)
   * I...로 시작하는 노드 ID가 유지되어 updateCleanupNodes에서 삭제됨
   */
  public enrichVariantWithInstanceChildren(
    variant: FigmaNodeData,
    instanceNode: any
  ): FigmaNodeData {
    if (!instanceNode || !instanceNode.children) {
      return variant;
    }

    // styleTree에서 INSTANCE의 children 부분 찾기
    const instanceStyleTree = this.findStyleTreeForInstance(instanceNode.id);

    // INSTANCE 노드의 children을 variant의 document children으로 교체
    const newDocument = {
      ...variant.info.document,
      children: instanceNode.children,
    };

    // styleTree도 INSTANCE 컨텍스트로 교체 (children만)
    let newStyleTree = variant.styleTree;
    if (instanceStyleTree?.children) {
      newStyleTree = {
        ...variant.styleTree,
        children: instanceStyleTree.children,
      };
    }

    return {
      ...variant,
      info: {
        ...variant.info,
        document: newDocument,
      },
      styleTree: newStyleTree,
    };
  }

  /**
   * INSTANCE children에 실제 오버라이드가 있는지 확인
   * (characters, fills 등이 원본과 다른 경우)
   */
  public hasActualOverride(
    variantChildren: any[],
    instanceChildren: any[]
  ): boolean {
    // 원본 variant children을 ID로 매핑
    const variantMap = new Map<string, any>();
    const buildVariantMap = (children: any[]) => {
      for (const child of children) {
        variantMap.set(child.id, child);
        if (child.children) {
          buildVariantMap(child.children);
        }
      }
    };
    buildVariantMap(variantChildren);

    // INSTANCE children에서 오버라이드 확인
    const checkOverride = (children: any[]): boolean => {
      for (const child of children) {
        const originalId = this._getOriginalId(child.id);
        const original = variantMap.get(originalId);

        if (original) {
          // characters가 다르면 오버라이드
          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            return true;
          }
        }

        // 재귀적으로 children 확인
        if (child.children && checkOverride(child.children)) {
          return true;
        }
      }
      return false;
    };

    return checkOverride(instanceChildren);
  }

  /**
   * INSTANCE children의 오버라이드를 원본 variant children에 적용
   * - 원본 children의 ID를 유지 (I...로 시작하면 삭제되므로)
   * - INSTANCE children에서 **실제로 변경된** 속성(characters 등)만 추출
   */
  public mergeInstanceOverrides(
    variantChildren: any[],
    instanceChildren: any[]
  ): any[] {
    // 원본 variant children을 ID로 매핑 (비교용)
    const variantMap = new Map<string, any>();
    const buildVariantMap = (children: any[]) => {
      for (const child of children) {
        variantMap.set(child.id, child);
        if (child.children) {
          buildVariantMap(child.children);
        }
      }
    };
    buildVariantMap(variantChildren);

    // instanceChildren을 원본 ID로 매핑
    const overrideMap = new Map<string, any>();
    const buildOverrideMap = (children: any[]) => {
      for (const child of children) {
        const originalId = this._getOriginalId(child.id);
        overrideMap.set(originalId, child);
        if (child.children) {
          buildOverrideMap(child.children);
        }
      }
    };
    buildOverrideMap(instanceChildren);

    // 원본 children에 오버라이드 적용 (실제로 변경된 것만)
    const applyOverrides = (children: any[]): any[] => {
      return (
        children
          .map((child) => {
            const override = overrideMap.get(child.id);
            const mergedChild = { ...child };

            if (override) {
              // characters가 **실제로 변경된 경우에만** 오버라이드 적용
              if (
                override.characters !== undefined &&
                override.characters !== child.characters
              ) {
                mergedChild.characters = override.characters;
              }
              // visible이 실제로 변경된 경우에만 오버라이드 적용
              if (
                override.visible !== undefined &&
                override.visible !== child.visible
              ) {
                mergedChild.visible = override.visible;
              }
              // fills가 실제로 변경된 경우에만 오버라이드 적용
              if (
                override.fills !== undefined &&
                JSON.stringify(override.fills) !== JSON.stringify(child.fills)
              ) {
                mergedChild.fills = override.fills;
              }
            }

            // 재귀적으로 children 처리
            if (child.children) {
              mergedChild.children = applyOverrides(child.children);
            }

            return mergedChild;
          })
          // visible: false 노드도 유지 (INSTANCE에서 override 가능)
          // FinalAstTree._processHiddenNodes에서 조건부 렌더링으로 처리
      );
    };

    return applyOverrides(variantChildren);
  }

  /**
   * styleTree children도 원본 ID로 병합
   * INSTANCE의 styleTree ID는 I...로 시작하여 updateCleanupNodes에서 삭제되므로
   * 원본 variant ID를 유지하면서 스타일만 오버라이드
   */
  public mergeStyleTreeChildren(
    variantStyleChildren: any[],
    instanceStyleChildren: any[]
  ): any[] {
    if (instanceStyleChildren.length === 0) {
      return variantStyleChildren;
    }

    // instanceStyleChildren을 원본 ID로 매핑
    const overrideMap = new Map<string, any>();
    const buildOverrideMap = (children: any[]) => {
      for (const child of children) {
        const originalId = this._getOriginalId(child.id);
        overrideMap.set(originalId, child);
        if (child.children) {
          buildOverrideMap(child.children);
        }
      }
    };
    buildOverrideMap(instanceStyleChildren);

    // 원본 styleTree children에 오버라이드 적용 (ID 유지)
    const applyOverrides = (children: any[]): any[] => {
      return children.map((child) => {
        const override = overrideMap.get(child.id);
        const mergedChild = { ...child };

        if (override) {
          // 스타일 관련 속성 오버라이드 (ID는 원본 유지)
          if (override.cssStyle) {
            mergedChild.cssStyle = { ...child.cssStyle, ...override.cssStyle };
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          mergedChild.children = applyOverrides(child.children);
        }

        return mergedChild;
      });
    };

    return applyOverrides(variantStyleChildren);
  }

  /**
   * 메인 styleTree에서 특정 INSTANCE ID의 styleTree 부분 찾기
   */
  public findStyleTreeForInstance(instanceId: string): any | null {
    const styleTree = this.specDataManager.getRenderTree();

    const traverse = (node: any): any | null => {
      if (!node) return null;
      if (node.id === instanceId) {
        return node;
      }
      if (node.children) {
        for (const child of node.children) {
          const found = traverse(child);
          if (found) return found;
        }
      }
      return null;
    };

    return traverse(styleTree);
  }

  /**
   * INSTANCE child ID에서 원본 ID 추출
   * 예: I704:56;704:29;692:1613 → 692:1613
   */
  private _getOriginalId(instanceId: string): string {
    if (!instanceId.startsWith("I")) return instanceId;
    const parts = instanceId.split(";");
    return parts[parts.length - 1];
  }

  /**
   * INSTANCE의 children에서 오버라이드된 속성(fills, characters)을 추출
   * prop 형태로 반환: { rectangle1Bg: "#D6D6D6", aaText: "90" }
   */
  public extractOverrideProps(
    instanceNode: any,
    variantChildren: any[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};

    if (!instanceNode?.children) return overrideProps;

    // 원본 variant children을 ID로 매핑
    const variantMap = new Map<string, any>();
    const buildVariantMap = (children: any[]) => {
      for (const child of children) {
        variantMap.set(child.id, child);
        if (child.children) {
          buildVariantMap(child.children);
        }
      }
    };
    buildVariantMap(variantChildren);

    // INSTANCE children 순회하며 오버라이드 추출
    const extractFromChildren = (children: any[]) => {
      for (const child of children) {
        const originalId = this._getOriginalId(child.id);
        const original = variantMap.get(originalId);

        if (original) {
          // 노드 이름을 prop 이름으로 변환 (camelCase)
          const baseName = this._toCamelCase(original.name);

          // fills 오버라이드 (background color)
          if (
            child.fills !== undefined &&
            JSON.stringify(child.fills) !== JSON.stringify(original.fills)
          ) {
            const bgColor = this._extractColorFromFills(child.fills);
            if (bgColor) {
              overrideProps[`${baseName}Bg`] = bgColor;
            }
          }

          // characters 오버라이드 (text)
          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            overrideProps[`${baseName}Text`] = child.characters;
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceNode.children);

    return overrideProps;
  }

  /**
   * fills 배열에서 색상 추출 (hex 형식)
   */
  private _extractColorFromFills(fills: any[]): string | null {
    if (!fills || fills.length === 0) return null;

    const fill = fills[0];
    if (fill.type !== "SOLID" || !fill.color) return null;

    const { r, g, b, a } = fill.color;
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");

    if (a !== undefined && a < 1) {
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * 문자열을 camelCase로 변환
   */
  private _toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");
  }

  /**
   * 메인 문서 및 dependency 문서에서 특정 componentId를 참조하는 모든 INSTANCE 노드 찾기
   */
  public findAllInstanceNodesForComponentId(componentId: string): any[] {
    const results: any[] = [];

    const traverse = (node: any): void => {
      if (!node) return;
      if (node.type === "INSTANCE" && node.componentId === componentId) {
        results.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    // 1. 메인 document에서 검색
    const document = this.specDataManager.getDocument();
    traverse(document);

    // 2. dependency documents에서도 검색
    const dependencies = this.specDataManager.getDependencies();
    if (dependencies) {
      for (const depData of Object.values(dependencies)) {
        const depDocument = (depData as any)?.info?.document;
        if (depDocument) {
          traverse(depDocument);
        }
      }
    }

    return results;
  }
}

export default InstanceOverrideManager;
