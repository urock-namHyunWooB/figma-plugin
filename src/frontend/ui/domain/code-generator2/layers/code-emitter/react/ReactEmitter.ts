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
    const componentName = this.toComponentName(uiTree.root.name);

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
    const imports = ImportsGenerator.generate(uiTree, this.styleStrategy);
    const propsInterface = PropsGenerator.generate(uiTree, componentName);
    const stylesResult = StylesGenerator.generate(uiTree, componentName, this.styleStrategy);
    const jsx = JsxGenerator.generate(uiTree, componentName, this.styleStrategy, {
      debug: this.options.debug,
      nodeStyleMap: stylesResult.nodeStyleMap,
    });

    return {
      imports,
      propsInterface,
      styles: stylesResult.code,
      jsx,
    };
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
        return new TailwindStrategy();
      case "emotion":
      default:
        return new EmotionStrategy();
    }
  }

  /**
   * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
   * 한글/비ASCII 문자가 포함된 경우 fallback 이름 생성
   */
  private toComponentName(name: string): string {
    // 영문/숫자만 추출
    let normalized = name
      .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 및 한글 제거 (슬래시 포함)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    // 영문/숫자가 없으면 fallback 이름 생성
    if (!normalized || normalized.length === 0) {
      const hash = this.simpleHash(name);
      normalized = `Component${hash}`;
    }

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(normalized)) {
      normalized = "_" + normalized;
    }

    return normalized;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
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
