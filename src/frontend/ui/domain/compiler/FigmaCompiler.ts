import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import { FigmaNodeData } from "./types/baseType";
import type { StyleStrategyOptions } from "./core/react-generator/style-strategy";

export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  /** dependency 컴포넌트가 컴파일되어 있는지 여부 */
  hasDependency: boolean;
  /** dependency 컴포넌트의 SVG 마크업 (목업용) */
  mockupSvg?: string;
}

export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  originalType?: string;
  /** SLOT 타입인 경우 관련 정보 */
  slotInfo?: SlotInfo;
}

/**
 * FigmaCompiler 옵션
 */
export interface FigmaCompilerOptions {
  /** 스타일 전략 옵션 */
  styleStrategy?: StyleStrategyOptions;
}

export class FigmaCompiler {
  public readonly SpecDataManager: SpecDataManager;
  public readonly Engine: Engine;
  private readonly options: FigmaCompilerOptions;

  constructor(spec: FigmaNodeData, options?: FigmaCompilerOptions) {
    this.options = options || {};
    const specDataManager = (this.SpecDataManager = new SpecDataManager(spec));
    this.Engine = new Engine(
      this,
      specDataManager.getRenderTree(),
      { styleStrategy: this.options.styleStrategy }
    );
  }

  /**
   * 컴파일 실행 (getGeneratedCode의 별칭)
   */
  public async compile(componentName?: string): Promise<string | null> {
    return this.getGeneratedCode(componentName || this.getComponentName());
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * dependencies가 있으면 같은 파일에 함께 생성
   * @param componentName 컴포넌트 이름 (기본값: Figma 노드 이름에서 추출)
   * @returns 생성된 TypeScript/TSX 코드 문자열, 또는 null (COMPONENT_SET이 아닌 경우)
   */
  public async getGeneratedCode(
    componentName?: string
  ): Promise<string | null> {
    // componentName이 없으면 Figma 노드 이름에서 추출
    const resolvedName = componentName || this.getComponentName();
    
    // dependencies가 있는지 확인
    const groupedDeps =
      this.SpecDataManager.getDependenciesGroupedByComponentSet();
    const hasDependencies = Object.keys(groupedDeps).length > 0;

    if (!hasDependencies) {
      // dependencies가 없으면 기존 방식으로 생성
      return await this.Engine.getGeneratedCode(resolvedName);
    }

    // dependencies가 있으면 함께 생성
    return await this._generateCodeWithInlineDependencies(resolvedName);
  }

  /**
   * dependencies를 같은 파일에 인라인으로 포함하여 코드 생성
   */
  private async _generateCodeWithInlineDependencies(
    componentName: string
  ): Promise<string> {
    const result = await this.getGeneratedCodeWithDependencies(componentName);

    // 루트가 INSTANCE인 경우, 해당 componentId의 의존성은 스킵
    const rootDocument = this.SpecDataManager.getDocument();
    const rootComponentId = rootDocument.componentId;
    const isInstanceRoot = rootDocument.type === "INSTANCE" && rootComponentId;

    // 코드 조각들을 합침
    const codeParts: string[] = [];

    // 1. 공통 imports (React, emotion) - 메인 컴포넌트 코드에서 추출
    // 메인 코드에서 import 문만 추출
    const mainCode = result.mainComponent.code;
    const mainLines = mainCode.split("\n");
    const importEndIndex = mainLines.findIndex(
      (line) => !line.startsWith("import") && line.trim() !== ""
    );

    const importLines = mainLines.slice(0, importEndIndex).join("\n");
    const mainCodeWithoutImports = mainLines.slice(importEndIndex).join("\n");

    codeParts.push(importLines);
    codeParts.push(""); // 빈 줄

    // 메인 컴포넌트의 변수명 수집 (충돌 감지용)
    const mainVariableNames = this._extractVariableNames(mainCodeWithoutImports);

    // 이미 사용된 모든 변수명 추적 (메인 + 의존 컴포넌트)
    const usedVariableNames = new Set(mainVariableNames);

    // 이미 추가된 컴포넌트 이름 추적 (중복 방지)
    const addedComponentNames = new Set<string>();

    // 2. 의존 컴포넌트들 (import 제거, export 제거, 변수명 충돌 해결)
    for (const dep of Object.values(result.dependencies)) {
      // INSTANCE 루트인 경우, 루트가 참조하는 componentId의 의존성은 스킵
      // (루트 INSTANCE와 의존성이 같은 컴포넌트를 가리키므로 중복 방지)
      if (isInstanceRoot && this._isDependencyOfRootInstance(dep.componentSetId, rootComponentId)) {
        continue;
      }

      // 같은 이름의 컴포넌트가 이미 추가되었으면 스킵 (중복 선언 방지)
      if (addedComponentNames.has(dep.componentName)) {
        continue;
      }
      addedComponentNames.add(dep.componentName);

      const depCode = dep.code;
      // import 문 제거
      const depLines = depCode.split("\n");
      const depImportEndIndex = depLines.findIndex(
        (line) => !line.startsWith("import") && line.trim() !== ""
      );
      let depCodeWithoutImports = depLines.slice(depImportEndIndex).join("\n");

      // "export default function" → "function" 으로 변경
      depCodeWithoutImports = depCodeWithoutImports.replace(
        /export\s+default\s+function/g,
        "function"
      );

      // 변수명 충돌 해결
      depCodeWithoutImports = this._resolveVariableConflicts(
        depCodeWithoutImports,
        usedVariableNames,
        dep.componentName
      );

      codeParts.push(`// === ${dep.componentName} ===`);
      codeParts.push(depCodeWithoutImports);
      codeParts.push(""); // 빈 줄
    }

    // 3. 메인 컴포넌트
    codeParts.push(`// === ${result.mainComponent.componentName} ===`);
    codeParts.push(mainCodeWithoutImports);

    return codeParts.join("\n");
  }

  /**
   * 의존성이 루트 INSTANCE가 참조하는 컴포넌트인지 확인
   */
  private _isDependencyOfRootInstance(
    depComponentSetId: string,
    rootComponentId: string
  ): boolean {
    // dependencies에서 rootComponentId에 해당하는 컴포넌트 찾기
    const dependencies = this.SpecDataManager.getDependencies();
    const rootDep = dependencies[rootComponentId];
    
    if (!rootDep) return false;
    
    // 해당 컴포넌트의 componentSetId와 비교
    // 단일 COMPONENT인 경우 componentSetId가 없으므로 componentId 자체와 비교
    const rootDepComponentSetId = rootDep.info?.components?.[rootComponentId]?.componentSetId;
    
    // COMPONENT_SET에 속한 경우: componentSetId로 비교
    if (rootDepComponentSetId) {
      return depComponentSetId === rootDepComponentSetId;
    }
    
    // 단일 COMPONENT인 경우: componentId 자체로 비교
    // (getDependenciesGroupedByComponentSet에서 componentId가 fallback으로 사용됨)
    return depComponentSetId === rootComponentId;
  }

  /**
   * Props 정의 반환 (UI 컨트롤러 생성용)
   */
  public getPropsDefinition(): PropDefinition[] {
    const astTree = this.Engine.getFinalAstTree();
    const props = astTree.props;

    // slot 노드에서 componentSetId 정보 추출
    const slotInfoMap = this._extractSlotInfoFromAstTree(astTree);

    return Object.entries(props).map(([name, def]: [string, any]) => {
      const propDef: PropDefinition = {
        name,
        type: def.type,
        defaultValue: def.defaultValue,
        variantOptions: def.variantOptions,
        originalType: def.originalType,
      };

      // SLOT 타입이면 slotInfo 추가
      if (def.type === "SLOT" && slotInfoMap.has(name)) {
        propDef.slotInfo = slotInfoMap.get(name);
      }

      return propDef;
    });
  }

  /**
   * AST 트리에서 slot 노드의 정보 추출
   */
  private _extractSlotInfoFromAstTree(
    astTree: any
  ): Map<string, SlotInfo> {
    const slotInfoMap = new Map<string, SlotInfo>();
    const groupedDeps = this.SpecDataManager.getDependenciesGroupedByComponentSet();
    const dependencies = this.SpecDataManager.getDependencies();

    const traverse = (node: any) => {
      if (!node) return;

      // isSlot이고 slotName이 있는 노드
      if (node.isSlot && node.slotName) {
        const slotName = node.slotName;
        
        // 1. metaData.vectorSvg에서 SVG 추출 (가장 우선)
        let mockupSvg: string | undefined = node.metaData?.vectorSvg;
        
        // externalComponent 정보가 있으면 dependency 컴포넌트 정보 추출
        if (node.externalComponent) {
          const componentSetId = node.externalComponent.componentSetId;
          const componentId = node.externalComponent.componentId;
          const depInfo = componentSetId ? groupedDeps[componentSetId] : null;
          
          // 2. metaData에 없으면 dependency에서 SVG 추출
          if (!mockupSvg) {
            const depData = componentId ? dependencies[componentId] : null;
            if (depData?.vectorSvgs) {
              const svgs = Object.values(depData.vectorSvgs);
              if (svgs.length > 0) {
                mockupSvg = svgs[0] as string;
              }
            }
          }
          
          slotInfoMap.set(slotName, {
            componentSetId,
            componentName: depInfo?.componentSetName 
              ? this._normalizeComponentName(depInfo.componentSetName)
              : node.externalComponent.componentName,
            hasDependency: !!depInfo,
            mockupSvg,
          });
        } else {
          // externalComponent가 없어도 metaData에서 SVG 추출 가능
          slotInfoMap.set(slotName, {
            componentName: node.name,
            hasDependency: false,
            mockupSvg,
          });
        }
      }

      // 자식 노드 순회
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(astTree);
    return slotInfoMap;
  }

  /**
   * 컴포넌트 이름 반환
   */
  public getComponentName(): string {
    const document = this.SpecDataManager.getDocument();
    return this._normalizeComponentName(document.name);
  }

  /**
   * 멀티 컴포넌트 컴파일 결과 타입
   */
  public async getGeneratedCodeWithDependencies(
    componentName?: string
  ): Promise<MultiComponentResult> {
    const name = componentName || this.getComponentName();

    // 1. 메인 컴포넌트 컴파일 (순환 참조 방지를 위해 Engine 직접 호출)
    const mainCode = await this.Engine.getGeneratedCode(name);

    // 2. dependencies를 ComponentSet 기준으로 그룹핑
    const groupedDeps =
      this.SpecDataManager.getDependenciesGroupedByComponentSet();

    // 3. 메인 문서에서 componentId별 인스턴스 매핑 생성
    const instancesByComponentId = this._findInstancesByComponentId();

    // 4. 각 ComponentSet을 하나의 컴포넌트로 컴파일
    const compiledDeps: Record<string, CompiledDependency> = {};

    // 재귀 방지: _skipDependencyCompilation 플래그가 있으면 dependencies 컴파일 건너뛰기
    const skipCompilation = (this.SpecDataManager.getSpec() as any)._skipDependencyCompilation;
    if (skipCompilation) {
      return {
        mainComponent: {
          componentName: name,
          code: mainCode || "",
        },
        dependencies: compiledDeps,
      };
    }

    // 루트의 dependencies 정보 (중첩 의존성 해결용)
    const rootDependencies = this.SpecDataManager.getDependencies() || {};

    for (const [componentSetId, group] of Object.entries(groupedDeps)) {
      // 메인 document에서 실제로 사용되는 variant를 찾기
      // (group.variants 중에서 INSTANCE가 참조하는 것을 우선 사용)
      let representativeVariant = group.variants[0];
      let instanceNode: any = null;

      for (const variant of group.variants) {
        const variantId = variant.info.document.id;
        const found = this._findInstanceNodeForComponentId(variantId);
        if (found) {
          representativeVariant = variant;
          instanceNode = found;
          break;
        }
      }

      // 의존 컴포넌트에 vectorSvg 주입
      let enrichedVariant = this._enrichVariantWithVectorSvg(
        representativeVariant,
        instancesByComponentId
      );

      // INSTANCE 컨텍스트 병합: INSTANCE의 오버라이드를 원본 variant에 적용
      if (instanceNode) {
        const hasActualOverride = this._hasActualOverride(
          representativeVariant.info.document.children || [],
          instanceNode.children || []
        );
        
        if (hasActualOverride) {
          // 오버라이드가 있으면 원본 ID로 매핑 (characters 등 적용)
          enrichedVariant = this._enrichVariantWithInstanceContext(
            enrichedVariant,
            instanceNode
          );
        } else {
          // 오버라이드가 없으면 INSTANCE children을 그대로 사용 (I... 노드가 삭제됨)
          enrichedVariant = this._enrichVariantWithInstanceChildren(
            enrichedVariant,
            instanceNode
          );
        }
      }

      // 중첩 dependencies 정보 주입
      enrichedVariant = this._enrichVariantWithDependencies(
        enrichedVariant,
        rootDependencies
      );

      // dependency 루트 스타일에서 고정 크기 제거 (사용처에서 크기 지정)
      enrichedVariant = this._removeRootSizeFromStyleTree(enrichedVariant);

      try {
        const depCompiler = new FigmaCompiler(enrichedVariant, this.options);
        const depComponentName = this._normalizeComponentName(
          group.componentSetName
        );
        const depCode = await depCompiler.getGeneratedCode(depComponentName);

        compiledDeps[componentSetId] = {
          componentName: depComponentName,
          code: depCode || "",
          componentSetId,
        };
      } catch (e) {
        console.error(
          `Failed to compile dependency ${group.componentSetName}:`,
          e
        );
      }
    }

    return {
      mainComponent: {
        componentName: name,
        code: mainCode || "",
      },
      dependencies: compiledDeps,
    };
  }

  /**
   * 메인 문서에서 componentId별 INSTANCE 노드 찾기
   */
  private _findInstancesByComponentId(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    const document = this.SpecDataManager.getDocument();

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
   * 메인 문서에서 특정 componentId를 참조하는 INSTANCE 노드 전체 데이터 찾기
   * INSTANCE의 children을 사용하여 부모 컨텍스트의 visible 상태를 반영
   */
  private _findInstanceNodeForComponentId(componentId: string): any | null {
    const document = this.SpecDataManager.getDocument();

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

    return traverse(document);
  }

  /**
   * INSTANCE 노드의 컨텍스트를 variant에 병합
   * INSTANCE의 children(I...로 시작하는 ID)을 사용하여 부모 컨텍스트 반영
   */
  private _enrichVariantWithInstanceContext(
    variant: FigmaNodeData,
    instanceNode: any
  ): FigmaNodeData {
    if (!instanceNode || !instanceNode.children) {
      return variant;
    }

    // styleTree에서 INSTANCE의 children 부분 찾기
    const instanceStyleTree = this._findStyleTreeForInstance(instanceNode.id);

    // INSTANCE children의 오버라이드를 원본 variant children에 적용
    // (INSTANCE children ID는 I...로 시작해서 그대로 사용하면 updateCleanupNodes에서 삭제됨)
    const mergedChildren = this._mergeInstanceOverrides(
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
      const mergedStyleChildren = this._mergeStyleTreeChildren(
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
   * INSTANCE children을 그대로 사용 (오버라이드가 없는 경우)
   * I...로 시작하는 노드 ID가 유지되어 updateCleanupNodes에서 삭제됨
   */
  private _enrichVariantWithInstanceChildren(
    variant: FigmaNodeData,
    instanceNode: any
  ): FigmaNodeData {
    if (!instanceNode || !instanceNode.children) {
      return variant;
    }

    // styleTree에서 INSTANCE의 children 부분 찾기
    const instanceStyleTree = this._findStyleTreeForInstance(instanceNode.id);

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
  private _hasActualOverride(
    variantChildren: any[],
    instanceChildren: any[]
  ): boolean {
    // INSTANCE child ID에서 원본 ID 추출
    const getOriginalId = (instanceId: string): string => {
      if (!instanceId.startsWith("I")) return instanceId;
      const parts = instanceId.split(";");
      return parts[parts.length - 1];
    };

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
        const originalId = getOriginalId(child.id);
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
  private _mergeInstanceOverrides(
    variantChildren: any[],
    instanceChildren: any[]
  ): any[] {
    // INSTANCE child ID에서 원본 ID 추출 (I704:56;704:29;692:1613 → 692:1613)
    const getOriginalId = (instanceId: string): string => {
      if (!instanceId.startsWith("I")) return instanceId;
      const parts = instanceId.split(";");
      return parts[parts.length - 1];
    };

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
        const originalId = getOriginalId(child.id);
        overrideMap.set(originalId, child);
        if (child.children) {
          buildOverrideMap(child.children);
        }
      }
    };
    buildOverrideMap(instanceChildren);

    // 원본 children에 오버라이드 적용 (실제로 변경된 것만)
    const applyOverrides = (children: any[]): any[] => {
      return children
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
        // visible: false인 노드 제외 (INSTANCE 컨텍스트에서 숨겨진 노드)
        .filter((child) => child.visible !== false);
    };

    return applyOverrides(variantChildren);
  }

  /**
   * styleTree children도 원본 ID로 병합
   * INSTANCE의 styleTree ID는 I...로 시작하여 updateCleanupNodes에서 삭제되므로
   * 원본 variant ID를 유지하면서 스타일만 오버라이드
   */
  private _mergeStyleTreeChildren(
    variantStyleChildren: any[],
    instanceStyleChildren: any[]
  ): any[] {
    if (instanceStyleChildren.length === 0) {
      return variantStyleChildren;
    }

    // INSTANCE child ID에서 원본 ID 추출 (I704:56;704:29;692:1613 → 692:1613)
    const getOriginalId = (instanceId: string): string => {
      if (!instanceId.startsWith("I")) return instanceId;
      const parts = instanceId.split(";");
      return parts[parts.length - 1];
    };

    // instanceStyleChildren을 원본 ID로 매핑
    const overrideMap = new Map<string, any>();
    const buildOverrideMap = (children: any[]) => {
      for (const child of children) {
        const originalId = getOriginalId(child.id);
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
  private _findStyleTreeForInstance(instanceId: string): any | null {
    const styleTree = this.SpecDataManager.getRenderTree();

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
   * 의존 컴포넌트 데이터에 vectorSvg 주입
   * 메인 문서의 인스턴스에서 merged SVG를 추출하여 루트 노드에 설정
   */
  private _enrichVariantWithVectorSvg(
    variant: FigmaNodeData,
    instancesByComponentId: Map<string, string[]>
  ): FigmaNodeData {
    const rootComponentId =
      variant.info.document.componentId || variant.info.document.id;

    // 해당 컴포넌트를 참조하는 인스턴스 찾기
    const instanceIds = instancesByComponentId.get(rootComponentId);
    if (!instanceIds || instanceIds.length === 0) {
      return variant;
    }

    // 첫 번째 인스턴스의 merged SVG 추출
    const firstInstanceId = instanceIds[0];
    const mergedSvg =
      this.SpecDataManager.mergeInstanceVectorSvgs(firstInstanceId);

    if (!mergedSvg) {
      return variant;
    }

    // variant 데이터에 vectorSvgs 추가 (루트 노드 ID를 키로)
    const rootNodeId = variant.info.document.id;
    return {
      ...variant,
      vectorSvgs: {
        ...(variant.vectorSvgs || {}),
        [rootNodeId]: mergedSvg,
      },
    };
  }

  /**
   * dependency 컴포넌트의 루트 styleTree에서 고정 크기(width/height) 제거
   * 사용하는 곳(INSTANCE)에서 크기를 지정하므로, dependency 자체는 크기를 갖지 않음
   */
  private _removeRootSizeFromStyleTree(variant: FigmaNodeData): FigmaNodeData {
    if (!variant.styleTree?.cssStyle) {
      return variant;
    }

    const { width, height, ...restCssStyle } = variant.styleTree.cssStyle;

    return {
      ...variant,
      styleTree: {
        ...variant.styleTree,
        cssStyle: restCssStyle,
      },
    };
  }

  /**
   * 의존 컴포넌트에 중첩 dependencies 정보 주입
   * 루트의 dependencies를 전달하되, _skipDependencyCompilation 플래그로 재귀 방지
   */
  private _enrichVariantWithDependencies(
    variant: FigmaNodeData,
    rootDependencies: Record<string, any>
  ): FigmaNodeData {
    if (!rootDependencies || Object.keys(rootDependencies).length === 0) {
      return variant;
    }

    // 루트 dependencies에서 componentSets/components 정보 수집
    const mergedComponentSets: Record<string, any> = {
      ...(variant.info.componentSets || {}),
    };
    const mergedComponents: Record<string, any> = {
      ...(variant.info.components || {}),
    };

    for (const dep of Object.values(rootDependencies)) {
      const depInfo = (dep as any).info || {};
      if (depInfo.componentSets) {
        Object.assign(mergedComponentSets, depInfo.componentSets);
      }
      if (depInfo.components) {
        Object.assign(mergedComponents, depInfo.components);
      }
    }

    // variant에 dependencies 및 info 병합
    // _skipDependencyCompilation은 getGeneratedCodeWithDependencies에서 체크
    return {
      ...variant,
      dependencies: {
        ...(variant.dependencies || {}),
        ...rootDependencies,
      },
      _skipDependencyCompilation: true, // 재귀 방지 플래그
      info: {
        ...variant.info,
        componentSets: mergedComponentSets,
        components: mergedComponents,
      },
    };
  }

  /**
   * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
   * 한글/비ASCII 문자가 포함된 경우 fallback 이름 생성
   */
  private _normalizeComponentName(name: string): string {
    // 먼저 영문/숫자만 추출 시도
    let normalized = name
      .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 및 한글 제거
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    // 영문/숫자가 없으면 (한글만 있는 경우 등) fallback 이름 생성
    if (!normalized || normalized.length === 0) {
      // 원본 이름에서 고유한 해시 생성
      const hash = this._simpleHash(name);
      normalized = `Component${hash}`;
    }

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(normalized)) {
      normalized = "_" + normalized;
    }

    return normalized;
  }

  /**
   * 간단한 해시 함수 (이름에서 고유한 숫자 생성)
   */
  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }

  /**
   * 코드에서 변수명 추출
   * const xxx = 패턴의 변수명들을 추출
   */
  private _extractVariableNames(code: string): string[] {
    const varRegex = /const\s+(\w+)\s*=/g;
    const variables: string[] = [];

    let match;
    while ((match = varRegex.exec(code)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  /**
   * 의존 컴포넌트의 변수명 충돌 해결
   * 충돌하는 변수명에 컴포넌트 이름 prefix 추가
   */
  private _resolveVariableConflicts(
    code: string,
    usedVariableNames: Set<string>,
    componentName: string
  ): string {
    // 의존 컴포넌트의 변수명 추출
    const depVariables = this._extractVariableNames(code);

    // 충돌하는 변수명 찾기
    const conflictingVars = depVariables.filter((v) =>
      usedVariableNames.has(v)
    );

    if (conflictingVars.length === 0) {
      // 충돌 없으면 변수명만 등록하고 원본 반환
      depVariables.forEach((v) => usedVariableNames.add(v));
      return code;
    }

    // 충돌하는 변수명 rename
    let renamedCode = code;
    for (const varName of conflictingVars) {
      // 새 변수명 생성: {componentName}_{varName}
      // 첫 글자 소문자로 변환 (camelCase 유지)
      const prefix =
        componentName.charAt(0).toLowerCase() + componentName.slice(1);
      let newVarName = `${prefix}_${varName}`;

      // 새 이름도 충돌하면 숫자 suffix 추가
      let counter = 2;
      while (usedVariableNames.has(newVarName)) {
        newVarName = `${prefix}_${varName}_${counter}`;
        counter++;
      }

      // 변수 선언 및 참조 모두 rename
      // 단어 경계(\b)를 사용하여 정확한 변수명만 매칭
      const varRegex = new RegExp(`\\b${varName}\\b`, "g");
      renamedCode = renamedCode.replace(varRegex, newVarName);

      // 새 변수명 등록
      usedVariableNames.add(newVarName);
    }

    // 충돌하지 않는 변수명도 등록
    depVariables
      .filter((v) => !conflictingVars.includes(v))
      .forEach((v) => usedVariableNames.add(v));

    return renamedCode;
  }
}

/**
 * 멀티 컴포넌트 컴파일 결과 타입
 */
export interface MultiComponentResult {
  mainComponent: {
    componentName: string;
    code: string;
  };
  dependencies: Record<string, CompiledDependency>;
}

export interface CompiledDependency {
  componentName: string;
  code: string;
  componentSetId: string;
}

export default FigmaCompiler;
