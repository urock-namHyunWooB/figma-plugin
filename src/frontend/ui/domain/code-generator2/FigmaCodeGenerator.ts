/**
 * FigmaCodeGenerator
 *
 * Figma 디자인 데이터를 React 컴포넌트 코드로 변환하는 메인 엔트리포인트
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                      High-Level Pipeline                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   FigmaNodeData                                                 │
 * │        │                                                        │
 * │        ▼                                                        │
 * │   ┌─────────────┐                                               │
 * │   │ DataManager │  데이터 접근 레이어 (HashMap 기반 O(1) 조회)    │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ TreeManager │  트리 구축 레이어                              │
 * │   │  └ TreeBuilder (6단계 파이프라인 + 휴리스틱)                 │
 * │   └──────┬──────┘                                               │
 * │          │ UITree                                               │
 * │          ▼                                                      │
 * │   ┌─────────────┐                                               │
 * │   │ CodeEmitter │  코드 생성 레이어                              │
 * │   │  └ StyleStrategy (Emotion / Tailwind)                      │
 * │   └──────┬──────┘                                               │
 * │          │                                                      │
 * │          ▼                                                      │
 * │   React Component Code (.tsx)                                   │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { FigmaNodeData, UITree, PropDefinition } from "./types/types";
import DataManager from "./layers/data-manager/DataManager";
import TreeManager from "./layers/tree-manager/TreeManager";
import type { ICodeEmitter, EmittedCode } from "./layers/code-emitter/ICodeEmitter";
import { ReactEmitter, type StyleStrategyType } from "./layers/code-emitter/react/ReactEmitter";
import { toComponentName } from "./utils/nameUtils";

/** v1 호환 SlotInfo */
export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  hasDependency: boolean;
  mockupSvg?: string;
  width?: number;
  height?: number;
}

/** v1 호환 UI용 PropDefinition */
export interface LegacyPropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  slotInfo?: SlotInfo;
}

/** v1 호환 컴파일된 의존성 */
export interface CompiledDependency {
  id: string;
  name: string;
  code: string;
}

/** v1 호환 멀티 컴포넌트 결과 */
export interface MultiComponentResult {
  mainCode: string;
  mainName: string;
  dependencies: CompiledDependency[];
}

/** 코드 생성 옵션 (v1 호환) */
export interface GeneratorOptions {
  /** 스타일 전략: emotion (기본) 또는 tailwind */
  styleStrategy?: StyleStrategyType | { type: StyleStrategyType };
  /** 디버그 모드: data-figma-id 속성 추가 */
  debug?: boolean;
}

/** 코드 생성 결과 */
export interface GeneratedResult {
  /** 메인 컴포넌트 코드 */
  main: EmittedCode;
  /** 의존 컴포넌트 코드 (componentId → code) */
  dependencies: Map<string, EmittedCode>;
}

export class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;
  private cachedUITree: { main: UITree; dependencies: Map<string, UITree> } | null = null;

  constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
    // Layer 1: 데이터 접근
    this.dataManager = new DataManager(spec);

    // Layer 2: 트리 구축
    this.treeManager = new TreeManager(this.dataManager);

    // Layer 3: 코드 생성 (현재 React만 지원, 추후 Vue/Svelte 확장 가능)
    // v1 호환: styleStrategy가 객체일 수 있음
    const styleStrategy = typeof options.styleStrategy === "object"
      ? options.styleStrategy.type
      : options.styleStrategy ?? "emotion";

    this.codeEmitter = new ReactEmitter({
      styleStrategy,
      debug: options.debug ?? false,
    });
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code
   */
  async generate(): Promise<GeneratedResult> {
    // Step 1: UITree 구축
    const { main: mainTree, dependencies: depTrees } = this.treeManager.build();

    // Step 2: 코드 생성
    const mainCode = await this.codeEmitter.emit(mainTree);

    const depCodes = new Map<string, EmittedCode>();
    for (const [depId, depTree] of depTrees) {
      depCodes.set(depId, await this.codeEmitter.emit(depTree));
    }

    return {
      main: mainCode,
      dependencies: depCodes,
    };
  }

  /**
   * UITree만 반환 (디버깅/테스트용)
   */
  buildUITree(): { main: UITree; dependencies: Map<string, UITree> } {
    return this.treeManager.build();
  }

  /**
   * 단일 UITree → 코드 변환 (디버깅/테스트용)
   */
  async emitCode(uiTree: UITree): Promise<EmittedCode> {
    return this.codeEmitter.emit(uiTree);
  }

  /**
   * v1 호환: 코드 생성 (compile의 별칭)
   */
  async getGeneratedCode(_componentName?: string): Promise<string | null> {
    return this.compile(_componentName);
  }

  /**
   * v1 호환: 코드 생성
   */
  async compile(_componentName?: string): Promise<string | null> {
    try {
      const result = await this.generate();

      // dependencies가 있으면 함께 번들링 (변수명 충돌 방지)
      if (result.dependencies.size > 0) {
        // 중복 제거: 같은 componentName을 가진 dependency는 한 번만 포함
        const seenComponents = new Set<string>();
        const uniqueDeps = Array.from(result.dependencies.values()).filter(dep => {
          if (seenComponents.has(dep.componentName)) {
            return false;
          }
          seenComponents.add(dep.componentName);
          return true;
        });

        const depCodes = uniqueDeps
          .map(dep => this.renameCssVariables(dep.code, dep.componentName))
          .join("\n\n");
        return `${depCodes}\n\n${result.main.code}`;
      }

      return result.main.code;
    } catch (e) {
      console.error("Compile error:", e);
      return null;
    }
  }

  /**
   * CSS 변수명에 prefix 추가하여 충돌 방지
   * 예: btnCss → Button_btnCss
   */
  private renameCssVariables(code: string, componentName: string): string {
    const prefix = componentName.replace(/\s+/g, "");

    // CSS 변수 패턴: xxxCss, xxxStyles 등
    const styleVarPattern = /\b(\w+(?:Css|Styles))\b/g;
    const foundVars = new Set<string>();

    // Step 1: 코드에서 스타일 변수명 수집
    let match;
    while ((match = styleVarPattern.exec(code)) !== null) {
      foundVars.add(match[1]);
    }

    // Step 2: 각 변수명을 prefix된 이름으로 교체
    let renamedCode = code;
    for (const varName of foundVars) {
      const newName = `${prefix}_${varName}`;
      // 단어 경계를 사용하여 정확한 매칭
      const regex = new RegExp(`\\b${varName}\\b`, "g");
      renamedCode = renamedCode.replace(regex, newName);
    }

    return renamedCode;
  }

  /**
   * v1 호환: Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): LegacyPropDefinition[] {
    const uiTree = this.getCachedUITree().main;
    return uiTree.props.map(prop => this.toLegacyPropDefinition(prop));
  }

  /**
   * v1 호환: 컴포넌트 이름 반환
   */
  getComponentName(): string {
    const mainId = this.dataManager.getMainComponentId();
    const { node } = this.dataManager.getById(mainId);
    return toComponentName(node?.name ?? "Component");
  }

  /**
   * v1 호환: 멀티 컴포넌트 컴파일 결과 반환
   */
  async getGeneratedCodeWithDependencies(_componentName?: string): Promise<MultiComponentResult> {
    const result = await this.generate();

    const dependencies: CompiledDependency[] = [];
    for (const [id, emitted] of result.dependencies) {
      dependencies.push({
        id,
        name: emitted.componentName,
        code: emitted.code,
      });
    }

    return {
      mainCode: result.main.code,
      mainName: result.main.componentName,
      dependencies,
    };
  }

  private getCachedUITree(): { main: UITree; dependencies: Map<string, UITree> } {
    if (!this.cachedUITree) {
      this.cachedUITree = this.treeManager.build();
    }
    return this.cachedUITree;
  }

  private toLegacyPropDefinition(prop: PropDefinition): LegacyPropDefinition {
    const typeMap: Record<string, "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT"> = {
      variant: "VARIANT",
      string: "TEXT",
      boolean: "BOOLEAN",
      slot: "SLOT",
    };

    return {
      name: prop.name,
      type: typeMap[prop.type] ?? "TEXT",
      defaultValue: prop.defaultValue,
      variantOptions: prop.type === "variant" ? (prop as any).options : undefined,
    };
  }

}

export default FigmaCodeGenerator;
