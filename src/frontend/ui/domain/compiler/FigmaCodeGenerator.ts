import Engine from "./core/Engine";
import NewEngine from "./core/NewEngine";
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
 * FigmaCodeGenerator 옵션
 */
export interface FigmaCodeGeneratorOptions {
  /** 스타일 전략 옵션 */
  styleStrategy?: StyleStrategyOptions;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
  /**
   * 새 파이프라인 사용 여부
   * true: DataPreparer → TreeBuilder → ReactEmitter
   * false (기본값): 레거시 파이프라인
   */
  useNewPipeline?: boolean;
}

export class FigmaCodeGenerator {
  private readonly spec: FigmaNodeData;
  private readonly specDataManager: SpecDataManager;
  private readonly engine: Engine | null;
  private readonly newEngine: NewEngine | null;
  private readonly options: FigmaCodeGeneratorOptions;
  private readonly dependencyManager: DependencyManager;
  private readonly propsManager: PropsManager;
  private readonly useNewPipeline: boolean;

  constructor(spec: FigmaNodeData, options?: FigmaCodeGeneratorOptions) {
    this.spec = spec;
    this.options = options || {};
    this.useNewPipeline = this.options.useNewPipeline ?? false;

    const specDataManager = (this.specDataManager = new SpecDataManager(spec));
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

    if (this.useNewPipeline) {
      // 새 파이프라인: DataPreparer → TreeBuilder → ReactEmitter
      this.newEngine = new NewEngine(
        { spec },
        {
          styleStrategy: this.options.styleStrategy?.type || "emotion",
          debug: this.options.debug,
        }
      );
      this.engine = null;
    } else {
      // 레거시 파이프라인
      this.engine = new Engine(
        {
          specDataManager,
          extractedProps: this.propsManager.extractedProps,
        },
        specDataManager.getRenderTree(),
        {
          styleStrategy: this.options.styleStrategy,
          debug: this.options.debug,
        }
      );
      this.newEngine = null;
    }
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
      this.specDataManager.getDependenciesGroupedByComponentSet();
    const hasDependencies = Object.keys(groupedDeps).length > 0;

    if (!hasDependencies) {
      // dependencies가 없으면 기존 방식으로 생성
      return await this._getEngineGeneratedCode(resolvedName);
    }

    // dependencies가 있으면 함께 생성
    return await this._generateCodeWithInlineDependencies(resolvedName);
  }

  /**
   * 엔진에서 코드 생성 (새/레거시 파이프라인 분기)
   */
  private async _getEngineGeneratedCode(componentName: string): Promise<string> {
    if (this.useNewPipeline && this.newEngine) {
      return await this.newEngine.getGeneratedCode(componentName);
    }
    return await this.engine!.getGeneratedCode(componentName);
  }

  /**
   * dependencies를 같은 파일에 인라인으로 포함하여 코드 생성
   */
  private async _generateCodeWithInlineDependencies(
    componentName: string
  ): Promise<string> {
    const result = await this.getGeneratedCodeWithDependencies(componentName);
    const rootDocument = this.specDataManager.getDocument();
    return this.dependencyManager.bundleWithDependencies(result, rootDocument);
  }

  /**
   * Props 정의 반환 (UI 컨트롤러 생성용)
   */
  public getPropsDefinition(): PropDefinition[] {
    if (this.useNewPipeline && this.newEngine) {
      // 새 파이프라인: DesignTree.props를 레거시 형식으로 변환
      const propsRecord = this.newEngine.getPropsAsLegacyFormat();
      // PropsManager가 기대하는 astTree 형식으로 래핑
      const fakeAstTree = { props: propsRecord };
      return this.propsManager.getPropsDefinition(fakeAstTree, (name) =>
        normalizeComponentName(name)
      );
    }

    const astTree = this.engine!.getFinalAstTree();
    return this.propsManager.getPropsDefinition(astTree, (name) =>
      normalizeComponentName(name)
    );
  }

  /**
   * 컴포넌트 이름 반환
   */
  public getComponentName(): string {
    const document = this.specDataManager.getDocument();
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
    const mainCode = await this._getEngineGeneratedCode(name);

    // 의존성 컴파일을 DependencyManager에 위임
    return this.dependencyManager.compileWithDependencies(
      mainCode,
      name,
      // 컴파일러 팩토리: 재귀 컴파일용
      (spec) => new FigmaCodeGenerator(spec, this.options),
      // 이름 정규화 함수
      (n) => normalizeComponentName(n)
    );
  }
}

// DependencyManager에서 타입 re-export
export type { MultiComponentResult, CompiledDependency };

export default FigmaCodeGenerator;
