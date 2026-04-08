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

import type { UITree, UINode, SlotPropDefinition, VariantPropDefinition } from "../../../types/types";
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
import { SemanticIRBuilder } from "../SemanticIRBuilder";
import type { SemanticComponent } from "../SemanticIR";

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

    // Phase 3 scaffold → Phase 7: IR is now consumed by generators.
    const ir: SemanticComponent = SemanticIRBuilder.build(renamedTree);

    // Step 1: 컴포넌트명 생성
    const componentName = toComponentName(renamedTree.root.name);

    // Step 2: 각 섹션 생성 (독립적으로 병렬 가능)
    const sections = this.generateAllSections(renamedTree, ir, componentName);

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

    // dependency의 variant prop options를 parent binding에 맞춰 확장
    this.propagateVariantOptions(main, filteredDeps);

    // dependency의 native prop rename을 parent binding에 반영
    this.propagateNativeRenames(main, filteredDeps);

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
  /**
   * 부모의 variant prop options를 dependency에 전파.
   * 부모가 state={"Error"|"Normal"|...}를 전달하는데 dependency가 {"Normal"|...}만 수용하면 타입 에러.
   */
  private propagateVariantOptions(
    main: UITree,
    deps: Map<string, UITree>
  ): void {
    // main의 prop name → 확장 정보 매핑
    const mainPropInfo = new Map<string, { type: string; options?: Set<string>; extraValues?: string[] }>();
    for (const p of main.props) {
      if (p.type === "variant") {
        mainPropInfo.set(p.name, { type: "variant", options: new Set((p as VariantPropDefinition).options) });
      } else if (p.type === "boolean" && (p as any).extraValues?.length) {
        mainPropInfo.set(p.name, { type: "boolean", extraValues: (p as any).extraValues });
      }
    }
    if (mainPropInfo.size === 0) return;

    // dep name → UITree 역매핑 (componentId가 없으면 name으로 매칭)
    const depsByName = new Map<string, UITree[]>();
    for (const [, dep] of deps) {
      const name = dep.componentName ?? dep.root?.name ?? "";
      if (!depsByName.has(name)) depsByName.set(name, []);
      depsByName.get(name)!.push(dep);
    }

    // main tree에서 component 노드의 bindings 수집 → dep name별로 필요한 options
    // dep name → { attrName → variant options to add } + { attrName → extraValues to add }
    const depVariantExtensions = new Map<string, Map<string, Set<string>>>();
    const depExtraValues = new Map<string, Map<string, string[]>>();

    const walkNode = (node: UINode) => {
      if (node.type === "component" && node.bindings?.attrs) {
        const compName = node.name ?? "";
        if (depsByName.has(compName)) {
          for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
            if ("prop" in source) {
              const info = mainPropInfo.get(source.prop);
              if (!info) continue;
              if (info.type === "variant" && info.options) {
                if (!depVariantExtensions.has(compName)) depVariantExtensions.set(compName, new Map());
                const propMap = depVariantExtensions.get(compName)!;
                if (!propMap.has(attrName)) propMap.set(attrName, new Set());
                for (const v of info.options) propMap.get(attrName)!.add(v);
              }
              if (info.type === "boolean" && info.extraValues) {
                if (!depExtraValues.has(compName)) depExtraValues.set(compName, new Map());
                depExtraValues.get(compName)!.set(attrName, info.extraValues);
              }
            }
          }
        }
      }
      if ("children" in node && node.children) {
        for (const child of node.children) walkNode(child);
      }
    };
    walkNode(main.root);

    // dependency props 확장
    for (const [depName, propMap] of depVariantExtensions) {
      const depTrees = depsByName.get(depName);
      if (!depTrees) continue;
      for (const dep of depTrees) {
        for (const prop of dep.props) {
          if (prop.type === "variant") {
            const extensions = propMap.get(prop.name);
            if (extensions) {
              const variantProp = prop as VariantPropDefinition;
              const existing = new Set(variantProp.options);
              for (const v of extensions) {
                if (!existing.has(v)) variantProp.options.push(v);
              }
            }
          }
        }
      }
    }

    // boolean extraValues 전파
    for (const [depName, extraMap] of depExtraValues) {
      const depTrees = depsByName.get(depName);
      if (!depTrees) continue;
      for (const dep of depTrees) {
        for (const prop of dep.props) {
          if (prop.type === "boolean") {
            const extras = extraMap.get(prop.name);
            if (extras) {
              const boolProp = prop as any;
              if (!boolProp.extraValues) boolProp.extraValues = [];
              for (const v of extras) {
                if (!boolProp.extraValues.includes(v)) boolProp.extraValues.push(v);
              }
            }
          }
        }
      }
    }
  }

  /**
   * dependency의 native prop rename을 parent의 binding에 반영.
   * 예: input dependency에서 checked→customChecked rename 시,
   *     parent의 <Input checked={checked}> → <Input customChecked={checked}>
   */
  private propagateNativeRenames(
    main: UITree,
    deps: Map<string, UITree>
  ): void {
    // dep name → { originalProp → renamedProp } 매핑
    const depRenameMap = new Map<string, Map<string, string>>();
    for (const [, dep] of deps) {
      const rootType = (dep.root as any)?.type as string;
      const nativeAttrs = NATIVE_ATTRS_BY_ELEMENT[rootType];
      if (!nativeAttrs) continue;

      const renames = new Map<string, string>();
      for (const prop of dep.props) {
        if (nativeAttrs.has(prop.name) && !prop.nativeAttribute) {
          const newName = "custom" + prop.name.charAt(0).toUpperCase() + prop.name.slice(1);
          renames.set(prop.name, newName);
        }
      }
      if (renames.size > 0) {
        const depName = dep.componentName ?? dep.root?.name ?? "";
        depRenameMap.set(depName, renames);
      }
    }
    if (depRenameMap.size === 0) return;

    // main tree의 component 노드 binding 업데이트
    const walkNode = (node: UINode) => {
      if (node.type === "component" && node.bindings?.attrs) {
        const compName = node.name ?? "";
        const renames = depRenameMap.get(compName);
        if (renames) {
          const newAttrs: Record<string, any> = {};
          for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
            const renamed = renames.get(attrName);
            newAttrs[renamed ?? attrName] = source;
          }
          node.bindings.attrs = newAttrs;
        }
      }
      if ("children" in node && node.children) {
        for (const child of node.children) walkNode(child);
      }
    };
    walkNode(main.root);
  }

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
    _uiTree: UITree,
    ir: SemanticComponent,
    componentName: string
  ): {
    imports: string;
    propsInterface: string;
    styles: string;
    jsx: string;
    diagnostics: VariantInconsistency[];
  } {
    const propsInterface = PropsGenerator.generate(ir, componentName);
    const stylesResult = StylesGenerator.generate(ir, componentName, this.styleStrategy);
    const jsxResult = JsxGenerator.generate(ir, componentName, this.styleStrategy, {
      debug: this.options.debug,
      nodeStyleMap: stylesResult.nodeStyleMap,
    });

    // JSX에서 실제 사용되는 컴포넌트만 import (slot binding → JSX 미생성 케이스 제거)
    const rawImports = ImportsGenerator.generate(ir, this.styleStrategy);
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
    // JSX에서 사용되지 않는 스타일 변수 선언 제거
    const styles = this.filterUnusedStyles(sections.styles, sections.jsx);

    const rawCode = [
      sections.imports,
      "",
      sections.propsInterface,
      "",
      styles,
      "",
      sections.jsx,
    ].join("\n");

    return await this.formatCode(rawCode);
  }

  /**
   * JSX 코드에서 참조되지 않는 스타일 변수 선언을 제거.
   * `const varName = css\`...\`;` 및 `const varName: Record<...> = { ... };` 형태를 감지.
   */
  private filterUnusedStyles(stylesCode: string, jsxCode: string): string {
    // `const `로 시작하는 선언 단위로 분리
    const lines = stylesCode.split("\n");
    const declarations: Array<{ varName: string; lines: string[] }> = [];
    let current: { varName: string; lines: string[] } | null = null;

    for (const line of lines) {
      const constMatch = line.match(/^const (\w+)/);
      if (constMatch) {
        if (current) declarations.push(current);
        current = { varName: constMatch[1], lines: [line] };
      } else if (current) {
        current.lines.push(line);
      } else {
        // const 이전의 코드 (없어야 하지만 안전)
        declarations.push({ varName: "", lines: [line] });
      }
    }
    if (current) declarations.push(current);

    const usedDecls = declarations.filter((decl) => {
      if (!decl.varName) return true;
      // 파생 변수 (varName_xxxStyles)는 base 변수의 사용 여부를 따라감
      const baseVarName = decl.varName.replace(/_\w+Styles$/, "");
      return jsxCode.includes(baseVarName);
    });

    return usedDecls.map((d) => d.lines.join("\n")).join("\n");
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
