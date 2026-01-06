import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import { FigmaNodeData } from "./types/baseType";

export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  originalType?: string;
}

export class FigmaCompiler {
  public readonly SpecDataManager: SpecDataManager;
  public readonly Engine: Engine;

  constructor(spec: FigmaNodeData) {
    const specDataManager = (this.SpecDataManager = new SpecDataManager(spec));
    this.Engine = new Engine(this, specDataManager.getRenderTree());
  }

  /**
   * 생성된 React 컴포넌트 코드를 반환
   * dependencies가 있으면 같은 파일에 함께 생성
   * @param componentName 컴포넌트 이름 (기본값: "Button")
   * @returns 생성된 TypeScript/TSX 코드 문자열, 또는 null (COMPONENT_SET이 아닌 경우)
   */
  public async getGeneratedCode(
    componentName: string = "Button"
  ): Promise<string | null> {
    // dependencies가 있는지 확인
    const groupedDeps =
      this.SpecDataManager.getDependenciesGroupedByComponentSet();
    const hasDependencies = Object.keys(groupedDeps).length > 0;

    if (!hasDependencies) {
      // dependencies가 없으면 기존 방식으로 생성
      return await this.Engine.getGeneratedCode(componentName);
    }

    // dependencies가 있으면 함께 생성
    return await this._generateCodeWithInlineDependencies(componentName);
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

    // 2. 의존 컴포넌트들 (import 제거, export 제거)
    for (const dep of Object.values(result.dependencies)) {
      // INSTANCE 루트인 경우, 루트가 참조하는 componentId의 의존성은 스킵
      // (루트 INSTANCE와 의존성이 같은 컴포넌트를 가리키므로 중복 방지)
      if (isInstanceRoot && this._isDependencyOfRootInstance(dep.componentSetId, rootComponentId)) {
        continue;
      }

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

    return Object.entries(props).map(([name, def]: [string, any]) => ({
      name,
      type: def.type,
      defaultValue: def.defaultValue,
      variantOptions: def.variantOptions,
      originalType: def.originalType,
    }));
  }

  /**
   * 컴포넌트 이름 반환
   */
  public getComponentName(): string {
    const document = this.SpecDataManager.getDocument();
    // 공백을 제거하고 PascalCase로 변환
    return document.name.replace(/\s+/g, "");
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

    // 3. 각 ComponentSet을 하나의 컴포넌트로 컴파일
    const compiledDeps: Record<string, CompiledDependency> = {};

    for (const [componentSetId, group] of Object.entries(groupedDeps)) {
      // 첫 번째 variant를 대표로 사용 (모든 variants가 같은 구조)
      // TODO: 여러 variants를 합쳐서 하나의 컴포넌트로 만들기
      const representativeVariant = group.variants[0];

      try {
        const depCompiler = new FigmaCompiler(representativeVariant);
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
   * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
   */
  private _normalizeComponentName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 제거
      .split(/\s+/) // 공백으로 분리
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // PascalCase
      .join("");
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
