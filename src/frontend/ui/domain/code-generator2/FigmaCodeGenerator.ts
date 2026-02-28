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
import type {
  ICodeEmitter,
  EmittedCode,
  GeneratedResult,
} from "./layers/code-emitter/ICodeEmitter";
import {
  ReactEmitter,
  type StyleStrategyType,
} from "./layers/code-emitter/react/ReactEmitter";
import { toComponentName } from "./utils/nameUtils";

export interface SlotInfo {
  componentSetId?: string;
  componentName?: string;
  hasDependency: boolean;
  mockupSvg?: string;
  width?: number;
  height?: number;
}

/**UI용 PropDefinition */
export interface LegacyPropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  slotInfo?: SlotInfo;
}

/**컴파일된 의존성 */
export interface CompiledDependency {
  id: string;
  name: string;
  code: string;
}

/**멀티 컴포넌트 결과 */
export interface MultiComponentResult {
  mainCode: string;
  mainName: string;
  dependencies: CompiledDependency[];
}

/** Tailwind 전략 옵션 */
export interface TailwindOptions {
  /** cn 함수를 인라인으로 생성할지 (기본: true) */
  inlineCn?: boolean;
  /** cn import 경로 (inlineCn: false일 때 사용, 기본: "@/lib/cn") */
  cnImportPath?: string;
}

/** 코드 생성 옵션 (v1 호환) */
export interface GeneratorOptions {
  /** 스타일 전략: emotion (기본) 또는 tailwind */
  styleStrategy?:
    | StyleStrategyType
    | { type: StyleStrategyType; tailwind?: TailwindOptions };
  /** 디버그 모드: data-figma-id 속성 추가 */
  debug?: boolean;
}

export type { GeneratedResult } from "./layers/code-emitter/ICodeEmitter";

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
    try {
      const { main, dependencies } = this.treeManager.build();
      return await this.codeEmitter.emitBundled(main, dependencies);
    } catch (e) {
      console.error("Compile error:", e);
      return null;
    }
  }


  /**
   * Props 정의 반환 (UI 컨트롤러용)
   */
  getPropsDefinition(): LegacyPropDefinition[] {
    const uiTree = this.buildUITree().main;
    const slotInfoMap = this.extractSlotInfoFromUITree(uiTree.root);
    return uiTree.props.map((prop) =>
      this.toLegacyPropDefinition(prop, slotInfoMap)
    );
  }

  /**
   * UITree를 순회하여 slot prop name → SlotInfo 매핑 추출
   * slot은 bindings.content = { prop: slotName } 을 가진 노드로 식별됨
   */
  private extractSlotInfoFromUITree(
    root: import("./types/types").UINode
  ): Map<string, SlotInfo> {
    const slotInfoMap = new Map<string, SlotInfo>();
    const groupedDeps = this.dataManager.getDependenciesGroupedByComponentSet();

    const traverse = (node: import("./types/types").UINode) => {
      const slotBinding = node.bindings?.content;
      if (slotBinding && "prop" in slotBinding) {
        const propName = slotBinding.prop;
        const rawNode = this.dataManager.getById(node.id).node as any;
        const bbox = rawNode?.absoluteBoundingBox;

        const componentId: string | undefined = rawNode?.componentId;
        const mockupSvg = componentId
          ? this.dataManager.getMergedVectorSvgForComponent(componentId)
          : undefined;

        let componentName: string | undefined = node.name;
        let hasDependency = false;
        if (componentId) {
          const depInfo = this.dataManager
            .getAllDependencies()
            .get(componentId);
          if (depInfo) {
            hasDependency = true;
            const compInfo = (depInfo.info as any).components?.[componentId];
            const setId: string | undefined = compInfo?.componentSetId;
            if (setId && groupedDeps[setId]) {
              componentName = toComponentName(
                groupedDeps[setId].componentSetName
              );
            }
          }
        }

        slotInfoMap.set(propName, {
          componentName,
          hasDependency,
          mockupSvg,
          width: bbox?.width,
          height: bbox?.height,
        });
      }

      if ("children" in node && node.children) {
        for (const child of node.children as import("./types/types").UINode[]) {
          traverse(child);
        }
      }
    };

    traverse(root);
    return slotInfoMap;
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


  private toLegacyPropDefinition(
    prop: PropDefinition,
    slotInfoMap?: Map<string, SlotInfo>
  ): LegacyPropDefinition {
    const typeMap: Record<string, "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT"> = {
      variant: "VARIANT",
      string: "TEXT",
      boolean: "BOOLEAN",
      slot: "SLOT",
    };

    const result: LegacyPropDefinition = {
      name: prop.name,
      type: typeMap[prop.type] ?? "TEXT",
      defaultValue: prop.defaultValue,
      variantOptions:
        prop.type === "variant" ? (prop as any).options : undefined,
    };

    if (prop.type === "slot" && slotInfoMap?.has(prop.name)) {
      result.slotInfo = slotInfoMap.get(prop.name);
    }

    return result;
  }
}

export default FigmaCodeGenerator;
