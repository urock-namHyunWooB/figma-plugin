/**
 * ReactEmitter
 *
 * UITree → React 컴포넌트 코드 변환 (ICodeEmitter 구현)
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       emit() Pipeline                           │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │   UITree                                                        │
 * │      │                                                          │
 * │      ├─► ImportsGenerator   → import React from "react"; ...    │
 * │      │                                                          │
 * │      ├─► PropsGenerator     → interface ButtonProps { ... }     │
 * │      │                                                          │
 * │      ├─► StylesGenerator    → const styles = css`...`;          │
 * │      │                                                          │
 * │      ├─► JsxGenerator       → <button css={styles}>...</button> │
 * │      │                                                          │
 * │      └─► Prettier           → formatted code                    │
 * │                                                                 │
 * │      ▼                                                          │
 * │   EmittedCode { code, componentName, fileExtension: ".tsx" }    │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { UITree, SlotPropDefinition } from "../../../types/types";
import type {
  ICodeEmitter,
  EmittedCode,
  GeneratedResult,
  BundledResult,
} from "../ICodeEmitter";
import { ReactBundler } from "./ReactBundler";
import { ImportsGenerator } from "./generators/ImportsGenerator";
import { PropsGenerator } from "./generators/PropsGenerator";
import { StylesGenerator } from "./generators/StylesGenerator";
import { JsxGenerator, type JsxGenerateResult } from "./generators/JsxGenerator";
import type { VariantInconsistency } from "../../../types/types";
import { EmotionStrategy } from "./style-strategy/EmotionStrategy";
import { TailwindStrategy } from "./style-strategy/TailwindStrategy";
import type { IStyleStrategy } from "./style-strategy/IStyleStrategy";
import { toComponentName } from "../../../utils/nameUtils";

/** element별 충돌하는 native HTML attribute */
const NATIVE_ATTRS_BY_ELEMENT: Record<string, Set<string>> = {
  button: new Set(["type", "name", "value", "disabled"]),
  input: new Set(["type", "name", "value", "disabled", "placeholder", "checked", "required"]),
  link: new Set(["href", "name", "type"]),
};

/** 스타일 전략 타입 */
export type StyleStrategyType = "emotion" | "tailwind";

/** ReactEmitter 옵션 */
export interface ReactEmitterOptions {
  /** 스타일 전략 */
  styleStrategy?: StyleStrategyType;
  /** 디버그 모드 (data-figma-id 추가) */
  debug?: boolean;
  /** Tailwind 전략 옵션 */
  tailwind?: { inlineCn?: boolean; cnImportPath?: string };
}

export class ReactEmitter implements ICodeEmitter {
  readonly framework = "react";

  private readonly options: ReactEmitterOptions & { styleStrategy: StyleStrategyType; debug: boolean };
  private readonly styleStrategy: IStyleStrategy;
  private readonly bundler: ReactBundler;

  constructor(options: ReactEmitterOptions = {}) {
    this.options = {
      styleStrategy: options.styleStrategy ?? "emotion",
      debug: options.debug ?? false,
      tailwind: options.tailwind,
    };

    this.styleStrategy = this.createStyleStrategy();
    this.bundler = new ReactBundler();
  }

  /**
   * UITree → React 컴포넌트 코드 변환 (고수준 파이프라인)
   *
   * 1. 컴포넌트명 생성
   * 2. 각 섹션 독립적으로 생성 (imports, props, styles, jsx)
   *    - StylesGenerator가 변수명 고유성 보장
   * 3. 섹션 조합 및 포맷팅
   */
  async emit(uiTree: UITree): Promise<EmittedCode> {
    // Step 0: native HTML prop 충돌 rename (UITree 복사본에 적용)
    const renamedTree = this.renameNativeProps(uiTree);

    // Step 1: 컴포넌트명 생성
    const componentName = toComponentName(renamedTree.root.name);

    // Step 2: 각 섹션 생성 (독립적으로 병렬 가능)
    const sections = this.generateAllSections(renamedTree, componentName);

    // Step 3: 조합 및 포맷팅
    const code = await this.assembleAndFormat(sections);

    return {
      code,
      componentName,
      fileExtension: ".tsx",
      diagnostics: sections.diagnostics,
    };
  }

  /**
   * 메인 + 의존 트리 → 개별 코드 변환 (멀티 파일 출력용)
   */
  async emitAll(
    main: UITree,
    deps: Map<string, UITree>
  ): Promise<GeneratedResult> {
    const mainCode = await this.emit(main);

    const depCodes = new Map<string, EmittedCode>();
    const emittedCache = new Map<UITree, EmittedCode>();

    for (const [depId, depTree] of deps) {
      if (!emittedCache.has(depTree)) {
        emittedCache.set(depTree, await this.emit(depTree));
      }
      depCodes.set(depId, emittedCache.get(depTree)!);
    }

    return { main: mainCode, dependencies: depCodes };
  }

  /**
   * 메인 + 의존 트리 → 단일 파일 번들 출력
   */
  async emitBundled(
    main: UITree,
    deps: Map<string, UITree>
  ): Promise<BundledResult> {
    const filteredDeps = this.filterSlotDependencies(main, deps);
    const result = await this.emitAll(main, filteredDeps);
    const depArray = Array.from(result.dependencies.values());
    const rawCode = this.bundler.bundle(result.main, depArray);
    const code = await this.formatCode(rawCode);

    // 모든 컴포넌트의 diagnostics 합산
    const diagnostics: VariantInconsistency[] = [
      ...(result.main.diagnostics || []),
    ];
    for (const dep of Array.from(result.dependencies.values())) {
      if (dep.diagnostics) diagnostics.push(...dep.diagnostics);
    }

    return { code, diagnostics };
  }

  /**
   * Slot prop으로 변환된 INSTANCE의 원본 dependency 컴포넌트를 번들에서 제외.
   * slot은 외부에서 주입받으므로 dependency 코드가 불필요.
   */
  private filterSlotDependencies(
    main: UITree,
    deps: Map<string, UITree>
  ): Map<string, UITree> {
    const slotTrees = new Set<UITree>();
    for (const prop of main.props) {
      if (prop.type === "slot") {
        const componentId = (prop as SlotPropDefinition).componentId;
        if (componentId) {
          const tree = deps.get(componentId);
          if (tree) slotTrees.add(tree);
        }
      }
    }

    if (slotTrees.size === 0) return deps;

    const filtered = new Map<string, UITree>();
    for (const [id, tree] of deps) {
      if (!slotTrees.has(tree)) filtered.set(id, tree);
    }
    return filtered;
  }

  /**
   * 모든 섹션 생성 (imports, props, styles, jsx)
   */
  private generateAllSections(
    uiTree: UITree,
    componentName: string
  ): {
    imports: string;
    propsInterface: string;
    styles: string;
    jsx: string;
    diagnostics: VariantInconsistency[];
  } {
    const propsInterface = PropsGenerator.generate(uiTree, componentName);
    const stylesResult = StylesGenerator.generate(uiTree, componentName, this.styleStrategy);
    const jsxResult = JsxGenerator.generate(uiTree, componentName, this.styleStrategy, {
      debug: this.options.debug,
      nodeStyleMap: stylesResult.nodeStyleMap,
    });

    // JSX에서 실제 사용되는 컴포넌트만 import (slot binding → JSX 미생성 케이스 제거)
    const rawImports = ImportsGenerator.generate(uiTree, this.styleStrategy);
    const imports = this.filterComponentImportsByJsx(rawImports, jsxResult.code);

    return {
      imports,
      propsInterface,
      styles: stylesResult.code,
      jsx: jsxResult.code,
      diagnostics: jsxResult.diagnostics,
    };
  }

  /**
   * `import { Foo } from "./Foo"` 형태 라인 중 JSX에서 `<Foo` 미사용인 것 제거.
   * React/emotion 같은 라이브러리 imports는 그대로 유지.
   */
  private filterComponentImportsByJsx(imports: string, jsx: string): string {
    return imports
      .split("\n")
      .filter((line) => {
        const match = line.match(/^import \{ (\w+) \} from "\.\/\1";$/);
        if (!match) return true;
        return jsx.includes(`<${match[1]}`);
      })
      .join("\n");
  }

  /**
   * 섹션 조합 및 Prettier 포맷팅
   */
  private async assembleAndFormat(sections: {
    imports: string;
    propsInterface: string;
    styles: string;
    jsx: string;
  }): Promise<string> {
    const rawCode = [
      sections.imports,
      "",
      sections.propsInterface,
      "",
      sections.styles,
      "",
      sections.jsx,
    ].join("\n");

    return await this.formatCode(rawCode);
  }

  private createStyleStrategy(): IStyleStrategy {
    switch (this.options.styleStrategy) {
      case "tailwind":
        return new TailwindStrategy(this.options.tailwind);
      case "emotion":
      default:
        return new EmotionStrategy();
    }
  }

  private async formatCode(code: string): Promise<string> {
    try {
      const prettier = await import("prettier");
      const parserTypescript = await import("prettier/plugins/typescript");
      const parserEstree = await import("prettier/plugins/estree");

      return await prettier.format(code, {
        parser: "typescript",
        plugins: [parserTypescript.default, parserEstree.default],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        printWidth: 80,
        trailingComma: "es5",
      });
    } catch (error) {
      console.warn("Prettier formatting failed:", error);
      return code;
    }
  }

  /**
   * UITree 복사본을 만들어 native HTML prop 충돌 이름을 일괄 rename.
   * 원본 UITree(Layer 2 출력)는 변경하지 않음.
   *
   * rename 대상: rootNodeType이 native element(button, input, a)일 때
   * 해당 element의 native attributes와 이름이 겹치는 props.
   */
  private renameNativeProps(uiTree: UITree): UITree {
    const rootType = (uiTree.root as any).type as string;
    const nativeAttrs = NATIVE_ATTRS_BY_ELEMENT[rootType];
    if (!nativeAttrs) return uiTree;

    // rename 대상 prop 수집 (nativeAttribute 플래그가 있으면 의도적 사용이므로 스킵)
    const renameMap = new Map<string, string>();
    for (const prop of uiTree.props) {
      if (nativeAttrs.has(prop.name) && !prop.nativeAttribute) {
        renameMap.set(prop.name, "custom" + prop.name.charAt(0).toUpperCase() + prop.name.slice(1));
      }
    }
    if (renameMap.size === 0) return uiTree;

    // deep copy + prop 이름 일괄 치환
    const json = JSON.stringify(uiTree);
    let renamed = json;

    for (const [original, newName] of renameMap) {
      // "prop":"type" → "prop":"customType" (ConditionNode, Bindings 등)
      renamed = renamed.replaceAll(`"prop":"${original}"`, `"prop":"${newName}"`);
      // "name":"type" (PropDefinition.name)
      renamed = renamed.replaceAll(`"name":"${original}"`, `"name":"${newName}"`);
    }

    return JSON.parse(renamed);
  }
}

// Legacy alias for backward compatibility
export { ReactEmitter as CodeEmitter };
export type { ReactEmitterOptions as CodeEmitterOptions };

export default ReactEmitter;
