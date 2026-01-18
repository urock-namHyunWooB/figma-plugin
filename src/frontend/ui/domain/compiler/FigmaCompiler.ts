import Engine from "./core/Engine";
import SpecDataManager from "./manager/SpecDataManager";
import InstanceOverrideManager from "./manager/InstanceOverrideManager";
import VariantEnrichManager from "./manager/VariantEnrichManager";
import DependencyManager from "./manager/DependencyManager";
import PropsManager from "./manager/PropsManager";
import { normalizeComponentName } from "./utils/normalizeString";

import type {
  MultiComponentResult,
  CompiledDependency,
} from "./manager/DependencyManager";
import type { SlotInfo, PropDefinition } from "./manager/PropsManager";
import type { FigmaNodeData } from "./types/baseType";
import type { StyleStrategyOptions } from "./core/react-generator/style-strategy";

// PropsManager에서 타입 re-export
export type { SlotInfo, PropDefinition };

/**
 * FigmaCompiler 옵션
 */
export interface FigmaCompilerOptions {
  /** 스타일 전략 옵션 */
  styleStrategy?: StyleStrategyOptions;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

export class FigmaCompiler {
  public readonly SpecDataManager: SpecDataManager;
  public readonly Engine: Engine;
  private readonly options: FigmaCompilerOptions;
  private readonly dependencyManager: DependencyManager;
  public readonly propsManager: PropsManager;

  constructor(spec: FigmaNodeData, options?: FigmaCompilerOptions) {
    this.options = options || {};
    const specDataManager = (this.SpecDataManager = new SpecDataManager(spec));
    const instanceOverrideManager = new InstanceOverrideManager(
      specDataManager
    );
    const variantEnrichManager = new VariantEnrichManager(specDataManager);
    this.dependencyManager = new DependencyManager(
      specDataManager,
      instanceOverrideManager,
      variantEnrichManager
    );
    this.propsManager = new PropsManager(specDataManager);
    this.Engine = new Engine(this, specDataManager.getRenderTree(), {
      styleStrategy: this.options.styleStrategy,
      debug: this.options.debug,
    });
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
    const rootDocument = this.SpecDataManager.getDocument();
    return this.dependencyManager.bundleWithDependencies(result, rootDocument);
  }

  /**
   * Props 정의 반환 (UI 컨트롤러 생성용)
   */
  public getPropsDefinition(): PropDefinition[] {
    const astTree = this.Engine.getFinalAstTree();
    return this.propsManager.getPropsDefinition(astTree, (name) =>
      normalizeComponentName(name)
    );
  }

  /**
   * 컴포넌트 이름 반환
   */
  public getComponentName(): string {
    const document = this.SpecDataManager.getDocument();
    return normalizeComponentName(document.name);
  }

  /**
   * 멀티 컴포넌트 컴파일 결과
   */
  public async getGeneratedCodeWithDependencies(
    componentName?: string
  ): Promise<MultiComponentResult> {
    const name = componentName || this.getComponentName();

    // 메인 컴포넌트 컴파일 (순환 참조 방지를 위해 Engine 직접 호출)
    const mainCode = await this.Engine.getGeneratedCode(name);

    // 의존성 컴파일을 DependencyManager에 위임
    return this.dependencyManager.compileWithDependencies(
      mainCode,
      name,
      // 컴파일러 팩토리: 재귀 컴파일용
      (spec) => new FigmaCompiler(spec, this.options),
      // 이름 정규화 함수
      (n) => normalizeComponentName(n)
    );
  }
}

// DependencyManager에서 타입 re-export
export type { MultiComponentResult, CompiledDependency };

export default FigmaCompiler;
