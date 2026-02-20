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
import type { ICodeEmitter, EmittedCode } from "../ICodeEmitter";
import { ImportsGenerator } from "./generators/ImportsGenerator";
import { PropsGenerator } from "./generators/PropsGenerator";
import { StylesGenerator } from "./generators/StylesGenerator";
import { JsxGenerator } from "./generators/JsxGenerator";
import { EmotionStrategy } from "./style-strategy/EmotionStrategy";
import { TailwindStrategy } from "./style-strategy/TailwindStrategy";
import type { IStyleStrategy } from "./style-strategy/IStyleStrategy";

/** 스타일 전략 타입 */
export type StyleStrategyType = "emotion" | "tailwind";

/** ReactEmitter 옵션 */
export interface ReactEmitterOptions {
  /** 스타일 전략 */
  styleStrategy?: StyleStrategyType;
  /** 디버그 모드 (data-figma-id 추가) */
  debug?: boolean;
}

export class ReactEmitter implements ICodeEmitter {
  readonly framework = "react";

  private readonly options: Required<ReactEmitterOptions>;
  private readonly styleStrategy: IStyleStrategy;

  constructor(options: ReactEmitterOptions = {}) {
    this.options = {
      styleStrategy: options.styleStrategy ?? "emotion",
      debug: options.debug ?? false,
    };

    this.styleStrategy = this.createStyleStrategy();
  }

  async emit(uiTree: UITree): Promise<EmittedCode> {
    const componentName = this.toComponentName(uiTree.root.name);

    // Step 1: 각 섹션 생성
    const imports = ImportsGenerator.generate(uiTree, this.styleStrategy);
    const propsInterface = PropsGenerator.generate(uiTree, componentName);
    const styles = StylesGenerator.generate(uiTree, componentName, this.styleStrategy);
    const jsx = JsxGenerator.generate(uiTree, componentName, this.styleStrategy, {
      debug: this.options.debug,
    });

    // Step 2: 코드 조합
    const rawCode = [imports, "", propsInterface, "", styles, "", jsx].join("\n");

    // Step 3: 포맷팅
    const code = await this.formatCode(rawCode);

    return {
      code,
      componentName,
      fileExtension: ".tsx",
    };
  }

  private createStyleStrategy(): IStyleStrategy {
    switch (this.options.styleStrategy) {
      case "tailwind":
        return new TailwindStrategy();
      case "emotion":
      default:
        return new EmotionStrategy();
    }
  }

  private toComponentName(name: string): string {
    return name
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
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
