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

import type { UITree, UINode, ConditionNode } from "../../../types/types";
import type {
  ICodeEmitter,
  EmittedCode,
  GeneratedResult,
} from "../ICodeEmitter";
import { ReactBundler } from "./ReactBundler";
import { ImportsGenerator } from "./generators/ImportsGenerator";
import { PropsGenerator } from "./generators/PropsGenerator";
import { StylesGenerator } from "./generators/StylesGenerator";
import { JsxGenerator } from "./generators/JsxGenerator";
import { EmotionStrategy } from "./style-strategy/EmotionStrategy";
import { TailwindStrategy } from "./style-strategy/TailwindStrategy";
import type { IStyleStrategy } from "./style-strategy/IStyleStrategy";
import { toComponentName } from "../../../utils/nameUtils";

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
    // Step 0: UITree 사전 정리 (중복 dynamic styles 병합)
    this.mergeRedundantDynamicStyles(uiTree.root);

    // Step 1: 컴포넌트명 생성
    const componentName = toComponentName(uiTree.root.name);

    // Step 2: 각 섹션 생성 (독립적으로 병렬 가능)
    const sections = this.generateAllSections(uiTree, componentName);

    // Step 3: 조합 및 포맷팅
    const code = await this.assembleAndFormat(sections);

    return {
      code,
      componentName,
      fileExtension: ".tsx",
    };
  }

  /**
   * 메인 + 의존 트리 → 개별 코드 변환 (멀티 파일 출력용)
   * dep 트리에는 makeRootFlexible 적용 (고정 크기 → 100%)
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
        this.makeRootFlexible(depTree);
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
  ): Promise<string> {
    const result = await this.emitAll(main, deps);
    const depArray = Array.from(result.dependencies.values());
    return this.bundler.bundle(result.main, depArray);
  }

  /**
   * dependency 루트의 고정 크기를 100%로 변환
   * INSTANCE가 parent의 크기를 채우도록 함 (8px 붕괴 방지)
   */
  private makeRootFlexible(tree: UITree): void {
    const root = tree.root;
    if (!root.styles) return;

    const base = root.styles.base;
    if (
      base.width &&
      typeof base.width === "string" &&
      base.width.endsWith("px")
    ) {
      base.width = "100%";
    }
    if (
      base.height &&
      typeof base.height === "string" &&
      base.height.endsWith("px")
    ) {
      base.height = "100%";
    }

    if (base.background) {
      base.background = "transparent";
    }
    delete base["border-radius"];
    delete base.border;
    delete base.opacity;
    delete base.padding;
    delete base["padding-top"];
    delete base["padding-right"];
    delete base["padding-bottom"];
    delete base["padding-left"];

    if (root.styles.variants) {
      for (const [, variantStyles] of Object.entries(root.styles.variants)) {
        for (const [, styleObj] of Object.entries(
          variantStyles as Record<string, any>
        )) {
          if (styleObj && typeof styleObj === "object") {
            if (styleObj.background) {
              styleObj.background = "transparent";
            }
            delete styleObj["border-radius"];
            delete styleObj.border;
            delete styleObj.opacity;
          }
        }
      }
    }
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
  } {
    const propsInterface = PropsGenerator.generate(uiTree, componentName);
    const stylesResult = StylesGenerator.generate(uiTree, componentName, this.styleStrategy);
    const jsx = JsxGenerator.generate(uiTree, componentName, this.styleStrategy, {
      debug: this.options.debug,
      nodeStyleMap: stylesResult.nodeStyleMap,
    });

    // JSX에서 실제 사용되는 컴포넌트만 import (slot binding → JSX 미생성 케이스 제거)
    const rawImports = ImportsGenerator.generate(uiTree, this.styleStrategy);
    const imports = this.filterComponentImportsByJsx(rawImports, jsx);

    return {
      imports,
      propsInterface,
      styles: stylesResult.code,
      jsx,
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

  // ===========================================================================
  // UITree 전처리: 사용되지 않는 props 제거
  // ===========================================================================

  /**
   * variant/boolean props 중 UITree에서 실제로 참조되지 않는 것 제거.
   * slot/string/function props는 항상 유지.
   */
  private pruneUnusedProps(uiTree: UITree): void {
    const usedPropNames = new Set<string>();

    // 1. 노드 트리에서 참조된 prop 이름 수집
    this.collectReferencedPropsFromNode(uiTree.root, usedPropNames);

    // 2. derivedVars 표현식에서 참조된 prop 수집
    if (uiTree.derivedVars) {
      for (const dv of uiTree.derivedVars) {
        const identifiers = dv.expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];
        for (const ident of identifiers) {
          usedPropNames.add(ident);
        }
      }
    }

    // 3. 미참조 variant/boolean prop 제거
    uiTree.props = uiTree.props.filter((prop) => {
      if (prop.type === "variant" || prop.type === "boolean") {
        return usedPropNames.has(prop.name);
      }
      return true; // slot, string, function은 항상 유지
    });
  }

  private collectReferencedPropsFromNode(node: UINode, usedProps: Set<string>): void {
    // visibleCondition: 모든 조건 타입 수집 (JSX 조건부 렌더링에서 사용됨)
    if (node.visibleCondition) {
      this.collectPropsFromCondition(node.visibleCondition, usedProps);
    }

    // styles.dynamic: eq 조건에서만 prop 수집 (EmotionStrategy가 eq만 처리)
    if (node.styles?.dynamic) {
      for (const { condition } of node.styles.dynamic) {
        this.collectEqOnlyPropsFromCondition(condition, usedProps);
      }
    }

    // bindings
    if (node.bindings) {
      const { attrs, content, style } = node.bindings;
      if (attrs) {
        for (const binding of Object.values(attrs)) {
          if ("prop" in binding) usedProps.add(binding.prop);
        }
      }
      if (content && "prop" in content) usedProps.add(content.prop);
      if (style) {
        for (const binding of Object.values(style)) {
          if ("prop" in binding) usedProps.add(binding.prop);
        }
      }
    }

    // 자식 순회
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.collectReferencedPropsFromNode(child, usedProps);
      }
    }
  }

  /**
   * EmotionStrategy가 실제로 처리하는 eq 조건 prop만 수집 (truthy/neq 제외).
   * styles.dynamic 분석 전용.
   */
  private collectEqOnlyPropsFromCondition(condition: ConditionNode, usedProps: Set<string>): void {
    if (condition.type === "eq") {
      usedProps.add(condition.prop);
    } else if (condition.type === "and" || condition.type === "or") {
      for (const c of condition.conditions) {
        this.collectEqOnlyPropsFromCondition(c, usedProps);
      }
    } else if (condition.type === "not") {
      this.collectEqOnlyPropsFromCondition(condition.condition, usedProps);
    }
    // truthy, neq는 EmotionStrategy가 처리 못하므로 수집 안 함
  }

  private collectPropsFromCondition(condition: ConditionNode, usedProps: Set<string>): void {
    switch (condition.type) {
      case "eq":
      case "neq":
      case "truthy":
        usedProps.add(condition.prop);
        break;
      case "and":
      case "or":
        for (const c of condition.conditions) {
          this.collectPropsFromCondition(c, usedProps);
        }
        break;
      case "not":
        this.collectPropsFromCondition(condition.condition, usedProps);
        break;
    }
  }

  // ===========================================================================
  // UITree 전처리: 중복 dynamic styles를 base에 병합
  // ===========================================================================

  /**
   * 모든 variant 값이 동일한 dynamic style 항목을 base에 통합하고 dynamic에서 제거.
   * (예: size=Medium/Small이 모두 padding:2px → base에 병합, sizeStyles 생성 안 함)
   */
  private mergeRedundantDynamicStyles(node: UINode): void {
    if (node.styles?.dynamic && node.styles.dynamic.length > 0) {
      // prop별로 value→style 맵 수집
      const propStyleMap = new Map<string, Map<string, Record<string, string | number>>>();

      for (const { condition, style } of node.styles.dynamic) {
        for (const { propName, propValue } of this.extractEqPropsFromCondition(condition)) {
          if (!propStyleMap.has(propName)) propStyleMap.set(propName, new Map());
          if (!propStyleMap.get(propName)!.has(propValue)) {
            propStyleMap.get(propName)!.set(propValue, style);
          }
        }
      }

      // 2개 이상의 variant 값이 모두 동일한 스타일인 prop → base에 통합
      const propsToMerge = new Set<string>();
      for (const [propName, valueStyles] of propStyleMap) {
        if (valueStyles.size >= 2 && this.allStyleObjectsIdentical([...valueStyles.values()])) {
          propsToMerge.add(propName);
        }
      }

      for (const propName of propsToMerge) {
        const commonStyle = propStyleMap.get(propName)!.values().next().value!;
        Object.assign(node.styles.base, commonStyle);

        // dynamic entries에서 propName eq 조건을 제거하고 중복 entries 제거
        const seen = new Set<string>();
        const newDynamic: typeof node.styles.dynamic = [];
        for (const entry of node.styles.dynamic) {
          const newCondition = this.removeEqPropFromCondition(entry.condition, propName);
          if (newCondition !== null) {
            const key = JSON.stringify({ c: newCondition, s: entry.style });
            if (!seen.has(key)) {
              seen.add(key);
              newDynamic.push({ condition: newCondition, style: entry.style });
            }
          }
        }
        node.styles.dynamic = newDynamic;
      }
    }

    // 자식 순회
    if ("children" in node && node.children) {
      for (const child of node.children) {
        this.mergeRedundantDynamicStyles(child);
      }
    }
  }

  /**
   * 조건에서 특정 prop의 eq 조건을 제거.
   * 제거 후 조건이 사라지면 null 반환.
   */
  private removeEqPropFromCondition(
    condition: ConditionNode,
    propName: string
  ): ConditionNode | null {
    if (condition.type === "eq" && condition.prop === propName) {
      return null;
    }
    if (condition.type === "and") {
      const newConditions = condition.conditions
        .map((c) => this.removeEqPropFromCondition(c, propName))
        .filter((c): c is ConditionNode => c !== null);
      if (newConditions.length === 0) return null;
      if (newConditions.length === 1) return newConditions[0];
      return { type: "and", conditions: newConditions };
    }
    return condition; // truthy, neq, or, not 등은 그대로
  }

  private extractEqPropsFromCondition(
    condition: ConditionNode
  ): Array<{ propName: string; propValue: string }> {
    if (condition.type === "eq" && typeof condition.value === "string") {
      return [{ propName: condition.prop, propValue: condition.value }];
    }
    if (condition.type === "and") {
      const results: Array<{ propName: string; propValue: string }> = [];
      for (const c of condition.conditions) {
        if (c.type === "eq" && typeof c.value === "string") {
          results.push({ propName: c.prop, propValue: c.value });
        }
      }
      return results;
    }
    return [];
  }

  private allStyleObjectsIdentical(styles: Record<string, string | number>[]): boolean {
    if (styles.length <= 1) return false;
    const first = JSON.stringify(styles[0]);
    return styles.every((s) => JSON.stringify(s) === first);
  }


  private async formatCode(code: string): Promise<string> {
    try {
      const prettier = await import("prettier");
      const parserTypescript = await import("prettier/plugins/typescript");

      return await prettier.format(code, {
        parser: "typescript",
        plugins: [parserTypescript.default],
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
}

// Legacy alias for backward compatibility
export { ReactEmitter as CodeEmitter };
export type { ReactEmitterOptions as CodeEmitterOptions };

export default ReactEmitter;
