import SpecDataManager from "./SpecDataManager";
import InstanceOverrideManager from "./InstanceOverrideManager";
import VariantEnrichManager from "./VariantEnrichManager";

import type { FigmaNodeData } from "@compiler/types/baseType";

/**
 * 컴파일된 의존성 결과
 */
export interface CompiledDependency {
  componentName: string;
  code: string;
  componentSetId: string;
}

/**
 * 멀티 컴포넌트 컴파일 결과
 */
export interface MultiComponentResult {
  mainComponent: {
    componentName: string;
    code: string;
  };
  dependencies: Record<string, CompiledDependency>;
}

/**
 * 컴파일러 인터페이스 (순환 참조 방지)
 */
interface CompilerInterface {
  getGeneratedCode(componentName: string): Promise<string | null>;
}

/**
 * 컴파일러 팩토리 (순환 참조 방지)
 */
type CompilerFactory = (spec: FigmaNodeData) => CompilerInterface;

/**
 * 의존성 컴포넌트 관리 매니저
 *
 * - 의존성 컴파일 오케스트레이션
 * - 코드 번들링 (import 정리, export 제거)
 * - 변수명 충돌 해결
 */
class DependencyManager {
  constructor(
    private specDataManager: SpecDataManager,
    private instanceOverrideManager: InstanceOverrideManager,
    private variantEnrichManager: VariantEnrichManager
  ) {}

  /**
   * 의존성 컴포넌트와 함께 컴파일
   * @param mainCode 메인 컴포넌트 컴파일된 코드
   * @param componentName 메인 컴포넌트 이름
   * @param compilerFactory 재귀 컴파일용 팩토리 함수
   * @param normalizeComponentName 컴포넌트 이름 정규화 함수
   */
  public async compileWithDependencies(
    mainCode: string,
    componentName: string,
    compilerFactory: CompilerFactory,
    normalizeComponentName: (name: string) => string
  ): Promise<MultiComponentResult> {
    // 1. dependencies를 ComponentSet 기준으로 그룹핑
    const groupedDeps =
      this.specDataManager.getDependenciesGroupedByComponentSet();

    // 2. 메인 문서에서 componentId별 인스턴스 매핑 생성
    const instancesByComponentId =
      this.instanceOverrideManager.findInstancesByComponentId();

    // 3. 각 ComponentSet을 하나의 컴포넌트로 컴파일
    const compiledDeps: Record<string, CompiledDependency> = {};

    // 재귀 방지: _skipDependencyCompilation 플래그가 있으면 dependencies 컴파일 건너뛰기
    const skipCompilation = (this.specDataManager.getSpec() as any)
      ._skipDependencyCompilation;
    if (skipCompilation) {
      return {
        mainComponent: {
          componentName,
          code: mainCode || "",
        },
        dependencies: compiledDeps,
      };
    }

    // 루트의 dependencies 정보 (중첩 의존성 해결용)
    const rootDependencies = this.specDataManager.getDependencies() || {};

    for (const [componentSetId, group] of Object.entries(groupedDeps)) {
      // 메인 document에서 실제로 사용되는 variant를 찾기
      // (group.variants 중에서 INSTANCE가 참조하는 것을 우선 사용)
      // visible: true인 INSTANCE를 우선 선택
      let representativeVariant = group.variants[0];
      let instanceNode: any = null;

      // 1차: visible: true인 INSTANCE 찾기
      for (const variant of group.variants) {
        const variantId = variant.info.document.id;
        const found =
          this.instanceOverrideManager.findInstanceNodeForComponentId(
            variantId
          );

        // visible이 명시적으로 false가 아닌 경우만 선택
        if (found && found.visible !== false) {
          representativeVariant = variant;
          instanceNode = found;

          break;
        }
      }

      // 2차: visible: true인 것이 없으면 아무 INSTANCE나 선택 (기존 동작)
      if (!instanceNode) {
        for (const variant of group.variants) {
          const variantId = variant.info.document.id;
          const found =
            this.instanceOverrideManager.findInstanceNodeForComponentId(
              variantId
            );
          if (found) {
            representativeVariant = variant;
            instanceNode = found;
            break;
          }
        }
      }

      // 의존 컴포넌트에 vectorSvg 주입
      let enrichedVariant = this.variantEnrichManager.enrichWithVectorSvg(
        representativeVariant,
        instancesByComponentId
      );

      // 모든 INSTANCE에서 오버라이드 가능한 prop 수집
      const overrideableProps = this._collectAllOverrideableProps(
        group.variants,
        instancesByComponentId
      );

      // INSTANCE 컨텍스트 병합: INSTANCE의 오버라이드를 원본 variant에 적용
      if (instanceNode) {
        const hasActualOverride =
          this.instanceOverrideManager.hasActualOverride(
            representativeVariant.info.document.children || [],
            instanceNode.children || []
          );

        if (hasActualOverride) {
          // 오버라이드가 있으면 원본 ID로 매핑 (characters 등 적용)
          enrichedVariant =
            this.instanceOverrideManager.enrichVariantWithInstanceContext(
              enrichedVariant,
              instanceNode
            );
        } else {
          // 오버라이드가 없으면 INSTANCE children을 그대로 사용
          const originalChildren =
            representativeVariant.info.document.children || [];

          enrichedVariant =
            this.instanceOverrideManager.enrichVariantWithInstanceChildren(
              enrichedVariant,
              instanceNode
            );

          // 원본 children이 비어있었을 때만 플래그 설정
          // 플래그가 true면 I... 노드가 유지됨 (실제 콘텐츠)
          // 플래그가 false면 I... 노드가 삭제됨 (INSTANCE 컨텍스트의 중복 노드)
          if (originalChildren.length === 0) {
            (enrichedVariant as any)._enrichedFromEmptyChildren = true;
          }
        }
      }

      // 메인 문서의 vectorSvgs를 dependency에 전달
      // (자식 VECTOR 노드들이 SVG로 렌더링되도록)
      const rootVectorSvgs = this.specDataManager.getSpec().vectorSvgs;
      if (rootVectorSvgs && Object.keys(rootVectorSvgs).length > 0) {
        enrichedVariant = {
          ...enrichedVariant,
          vectorSvgs: {
            ...(enrichedVariant.vectorSvgs || {}),
            ...rootVectorSvgs,
          },
        };
      }

      // 중첩 dependencies 정보 주입
      enrichedVariant = this.variantEnrichManager.enrichWithDependencies(
        enrichedVariant,
        rootDependencies
      );

      // dependency 루트 스타일에서 고정 크기 제거 (사용처에서 크기 지정)
      enrichedVariant =
        this.variantEnrichManager.makeRootFlexible(enrichedVariant);

      // 오버라이드 가능한 prop 정보 주입 (마지막에 추가하여 손실 방지)
      if (Object.keys(overrideableProps).length > 0) {
        (enrichedVariant as any)._overrideableProps = overrideableProps;
      }

      try {
        const depCompiler = compilerFactory(enrichedVariant);
        const depComponentName = normalizeComponentName(group.componentSetName);
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
        componentName,
        code: mainCode || "",
      },
      dependencies: compiledDeps,
    };
  }

  /**
   * dependencies를 같은 파일에 인라인으로 번들링
   */
  public bundleWithDependencies(
    result: MultiComponentResult,
    rootDocument: SceneNode
  ): string {
    // 루트가 INSTANCE인 경우, 해당 componentId의 의존성은 스킵
    const rootComponentId = (rootDocument as any).componentId;
    const isInstanceRoot = rootDocument.type === "INSTANCE" && rootComponentId;

    // 코드 조각들을 합침
    const codeParts: string[] = [];

    // 1. 공통 imports (React, emotion) - 메인 컴포넌트 코드에서 추출
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
    const mainVariableNames = this._extractVariableNames(
      mainCodeWithoutImports
    );

    // 이미 사용된 모든 변수명 추적 (메인 + 의존 컴포넌트)
    const usedVariableNames = new Set(mainVariableNames);

    // 이미 추가된 컴포넌트 이름 추적 (중복 방지)
    const addedComponentNames = new Set<string>();

    // 2. 의존 컴포넌트들 (import 제거, export 제거, 변수명 충돌 해결)
    for (const dep of Object.values(result.dependencies)) {
      // INSTANCE 루트인 경우, 루트가 참조하는 componentId의 의존성은 스킵
      if (
        isInstanceRoot &&
        this._isDependencyOfRootInstance(dep.componentSetId, rootComponentId)
      ) {
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
    const dependencies = this.specDataManager.getDependencies();
    const rootDep = dependencies?.[rootComponentId];

    if (!rootDep) return false;

    const rootDepComponentSetId =
      rootDep.info?.components?.[rootComponentId]?.componentSetId;

    if (rootDepComponentSetId) {
      return depComponentSetId === rootDepComponentSetId;
    }

    return depComponentSetId === rootComponentId;
  }

  /**
   * 코드에서 변수명 추출
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
   */
  private _resolveVariableConflicts(
    code: string,
    usedVariableNames: Set<string>,
    componentName: string
  ): string {
    const depVariables = this._extractVariableNames(code);
    const conflictingVars = depVariables.filter((v) =>
      usedVariableNames.has(v)
    );

    if (conflictingVars.length === 0) {
      depVariables.forEach((v) => usedVariableNames.add(v));
      return code;
    }

    let renamedCode = code;
    for (const varName of conflictingVars) {
      const prefix =
        componentName.charAt(0).toLowerCase() + componentName.slice(1);
      let newVarName = `${prefix}_${varName}`;

      let counter = 2;
      while (usedVariableNames.has(newVarName)) {
        newVarName = `${prefix}_${varName}_${counter}`;
        counter++;
      }

      const varRegex = new RegExp(`\\b${varName}\\b`, "g");
      renamedCode = renamedCode.replace(varRegex, newVarName);
      usedVariableNames.add(newVarName);
    }

    depVariables
      .filter((v) => !conflictingVars.includes(v))
      .forEach((v) => usedVariableNames.add(v));

    return renamedCode;
  }

  /**
   * INSTANCE children에서 오버라이드된 속성(fills, characters)을 추출
   * styleTree 기반 비교 (dependency의 info.document.children이 비어있을 수 있음)
   */
  private _extractOverridePropsFromStyle(
    instanceNode: any,
    variantStyleChildren: any[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};
    const instanceChildren = instanceNode?.children || [];

    if (instanceChildren.length === 0) {
      return overrideProps;
    }

    // variantStyleChildren을 이름으로 매핑
    const variantStyleMap = new Map<string, any>();
    const buildStyleMap = (children: any[]) => {
      for (const child of children) {
        const normalizedName = child.name?.toLowerCase().replace(/\s+/g, "");
        if (normalizedName) {
          variantStyleMap.set(normalizedName, child);
        }
        if (child.children) {
          buildStyleMap(child.children);
        }
      }
    };
    buildStyleMap(variantStyleChildren);

    // INSTANCE children 순회하며 오버라이드 추출
    const extractFromChildren = (children: any[]) => {
      for (const child of children) {
        const normalizedName = child.name?.toLowerCase().replace(/\s+/g, "");
        const originalStyle = variantStyleMap.get(normalizedName);

        // 노드 이름을 prop 이름으로 변환 (camelCase)
        const baseName = this._toCamelCase(child.name || "");

        if (baseName) {
          // fills 오버라이드 (background color)
          if (child.fills && child.fills.length > 0) {
            const bgColor = this._extractColorFromFills(child.fills);
            if (bgColor) {
              const originalBg = originalStyle?.cssStyle?.background;
              if (!originalBg || !originalBg.includes(bgColor)) {
                overrideProps[`${baseName}Bg`] = bgColor;
              }
            }
          }

          // characters 오버라이드 (text)
          if (child.characters !== undefined) {
            overrideProps[`${baseName}Text`] = child.characters;
          }
        }

        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceChildren);

    return overrideProps;
  }

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
   * 모든 INSTANCE에서 오버라이드 가능한 prop 수집
   * { propName: { nodeId: string, type: 'fills' | 'characters' } }
   */
  private _collectAllOverrideableProps(
    variants: FigmaNodeData[],
    instancesByComponentId: Map<string, string[]>
  ): Record<string, { nodeId: string; nodeName: string; type: string }> {
    const overrideableProps: Record<
      string,
      { nodeId: string; nodeName: string; type: string }
    > = {};

    for (const variant of variants) {
      const variantId = variant.info.document.id;
      // info.document.children이 비어있을 수 있으므로 styleTree.children 사용
      const variantStyleChildren = variant.styleTree?.children || [];

      // 해당 variant를 참조하는 모든 INSTANCE 찾기
      const instanceNodes =
        this.instanceOverrideManager.findAllInstanceNodesForComponentId(
          variantId
        );

      for (const instanceNode of instanceNodes) {
        const overrides = this._extractOverridePropsFromStyle(
          instanceNode,
          variantStyleChildren
        );

        // 오버라이드 정보 수집
        for (const [propName, _value] of Object.entries(overrides)) {
          if (!overrideableProps[propName]) {
            // propName에서 타입 추론: Bg로 끝나면 fills, Text로 끝나면 characters
            const type = propName.endsWith("Bg") ? "fills" : "characters";
            // nodeName은 propName에서 Bg/Text 제거
            const nodeName = propName.replace(/Bg$|Text$/, "");

            overrideableProps[propName] = {
              nodeId: "", // 실제 ID는 나중에 매핑
              nodeName,
              type,
            };
          }
        }
      }
    }

    return overrideableProps;
  }
}

export default DependencyManager;
