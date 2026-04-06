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

import type { FigmaNodeData, UITree } from "./types/types";
import type {
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
  GeneratorOptions,
} from "./types/public";
import DataManager from "./layers/data-manager/DataManager";
import TreeManager from "./layers/tree-manager/TreeManager";
import type {
  ICodeEmitter,
  EmittedCode,
  GeneratedResult,
  BundledResult,
} from "./layers/code-emitter/ICodeEmitter";
import type { VariantInconsistency, PropertyBindingFeedback } from "./types/types";
import { ReactEmitter } from "./layers/code-emitter/react/ReactEmitter";
import { toComponentName } from "./utils/nameUtils";
import { toPublicProps } from "./adapters/PropsAdapter";

export type { GeneratedResult, BundledResult } from "./layers/code-emitter/ICodeEmitter";
export type { VariantInconsistency, PropertyBindingFeedback } from "./types/types";

/** compile() 반환 타입: 코드 + 진단 */
export interface CompileResult {
  code: string | null;
  diagnostics: VariantInconsistency[];
  /** Component Property 바인딩 누락 피드백 */
  designFeedback: PropertyBindingFeedback[];
}

export type {
  SlotInfo,
  PropDefinition,
  CompiledDependency,
  MultiComponentResult,
  TailwindOptions,
  GeneratorOptions,
} from "./types/public";

class FigmaCodeGenerator {
  private readonly dataManager: DataManager;
  private readonly treeManager: TreeManager;
  private readonly codeEmitter: ICodeEmitter;

  constructor(spec: FigmaNodeData, options: GeneratorOptions = {}) {
    // Layer 1: 데이터 접근
    this.dataManager = new DataManager(spec);

    // Layer 2: 트리 구축
    this.treeManager = new TreeManager(this.dataManager);

    // Layer 3: 코드 생성 (현재 React만 지원, 추후 Vue/Svelte 확장 가능)
    // v1 호환: styleStrategy가 객체일 수 있음
    const styleStrategyObj =
      typeof options.styleStrategy === "object"
        ? options.styleStrategy
        : undefined;
    const styleStrategy =
      styleStrategyObj?.type ??
      (typeof options.styleStrategy === "string"
        ? options.styleStrategy
        : "emotion");
    const tailwindOptions = styleStrategyObj?.tailwind;

    this.codeEmitter = new ReactEmitter({
      styleStrategy,
      debug: options.debug ?? false,
      tailwind: tailwindOptions,
    });
  }

  /**
   * 전체 파이프라인 실행: FigmaNodeData → React Code (멀티 파일)
   */
  async generate(): Promise<GeneratedResult> {
    const { main, dependencies } = this.treeManager.build();
    return this.codeEmitter.emitAll(main, dependencies);
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
   * 코드 생성 (단일 파일 번들)
   */
  async compile(): Promise<string | null> {
    const result = await this.compileWithDiagnostics();
    return result.code;
  }

  /**
   * 코드 생성 + variant 불일치 진단 (단일 파일 번들)
   */
  async compileWithDiagnostics(): Promise<CompileResult> {
    try {
      const diagnostics: VariantInconsistency[] = [];
      const { main, dependencies } = this.treeManager.build(diagnostics);
      const result = await this.codeEmitter.emitBundled(main, dependencies);
      const designFeedback = this.detectPropertyBindingGaps();
      // 바인딩 누락을 VariantInconsistency 형태로 변환하여 기존 warning UI에 표시
      diagnostics.push(...this.bindingFeedbackToDiagnostics(designFeedback));
      return { code: result.code, diagnostics, designFeedback };
    } catch (e) {
      console.error("Compile error:", e);
      return { code: null, diagnostics: [], designFeedback: [] };
    }
  }

  /**
   * Component Property 바인딩 누락 감지.
   * 일부 variant에만 바인딩이 있고 나머지에 없으면 피드백 생성.
   */
  private detectPropertyBindingGaps(): PropertyBindingFeedback[] {
    const propDefs = this.dataManager.getComponentPropertyDefinitions();
    if (!propDefs) return [];

    const doc = this.dataManager.getDocument() as any;
    if (!doc?.children) return [];

    const feedback: PropertyBindingFeedback[] = [];

    for (const [propKey, propDef] of Object.entries(propDefs)) {
      const def = propDef as any;
      if (def.type === "VARIANT") continue;

      const refField = def.type === "BOOLEAN" ? "visible"
        : def.type === "TEXT" ? "characters"
        : null;
      if (!refField) continue;

      const bound: string[] = [];
      const unbound: string[] = [];

      for (const variant of doc.children) {
        const variantName = variant.name || "";
        const hasBinding = this.findBindingInTree(variant, refField, propKey);
        if (hasBinding) bound.push(variantName);
        else unbound.push(variantName);
      }

      // 일부만 바인딩 → 피드백
      if (bound.length > 0 && unbound.length > 0) {
        feedback.push({
          propertyName: propKey,
          propertyType: def.type,
          boundVariants: bound,
          unboundVariants: unbound,
        });
      }
    }

    return feedback;
  }

  private findBindingInTree(node: any, refField: string, propKey: string): boolean {
    if (node.componentPropertyReferences?.[refField] === propKey) return true;
    if (node.children) {
      for (const child of node.children) {
        if (this.findBindingInTree(child, refField, propKey)) return true;
      }
    }
    return false;
  }


  /**
   * PropertyBindingFeedback → VariantInconsistency 변환.
   * 기존 PropsMatrix warning UI에서 동일하게 표시되도록.
   */
  private bindingFeedbackToDiagnostics(
    feedbacks: PropertyBindingFeedback[]
  ): VariantInconsistency[] {
    return feedbacks.map((fb) => {
      const displayName = fb.propertyName.replace(/#.*$/, "").trim();

      const parsePropPairs = (name: string): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const pair of name.split(",")) {
          const [k, v] = pair.trim().split("=");
          if (k && v) result[k.trim()] = v.trim();
        }
        return result;
      };

      // 누락된 variant 이름에서 공통 조건 추출 (예: "size=small" variant 전체)
      const unboundProps = fb.unboundVariants.map(parsePropPairs);
      const commonConditions: string[] = [];
      if (unboundProps.length > 0) {
        for (const [key, val] of Object.entries(unboundProps[0])) {
          if (unboundProps.every((p) => p[key] === val)) {
            commonConditions.push(`${key}=${val}`);
          }
        }
      }
      const where = commonConditions.length > 0
        ? commonConditions.join(", ") + " variant"
        : `${fb.unboundVariants.length}개 variant`;

      return {
        cssProperty: `${where}에서 "${displayName}" 토글이 빠져있어요. 해당 레이어에 Component Property를 연결해주세요.`,
        propName: "",
        propValue: "",
        nodeName: displayName,
        variants: [],
        expectedValue: null,
      };
    });
  }

  /**
   * Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): PropDefinition[] {
    const uiTree = this.buildUITree().main;
    return toPublicProps(uiTree.props, this.dataManager, uiTree.arraySlots);
  }

  /**
   * 컴포넌트 이름 반환
   */
  getComponentName(): string {
    const mainId = this.dataManager.getMainComponentId();
    const { node } = this.dataManager.getById(mainId);
    return toComponentName(node?.name ?? "Component");
  }

  /**
   * 멀티 컴포넌트 컴파일 결과 반환
   */
  async getGeneratedCodeWithDependencies(): Promise<MultiComponentResult> {
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
}

export default FigmaCodeGenerator;
