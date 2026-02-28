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

import type { UITree } from "../../../types/types";
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
  ): Promise<string> {
    const result = await this.emitAll(main, deps);
    const depArray = Array.from(result.dependencies.values());
    return this.bundler.bundle(result.main, depArray);
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
