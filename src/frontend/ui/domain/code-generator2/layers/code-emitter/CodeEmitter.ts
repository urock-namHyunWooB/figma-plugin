/**
 * CodeEmitter
 *
 * UITree → React 컴포넌트 코드 변환
 *
 * 파이프라인:
 * 1. ImportsGenerator: import 문 생성
 * 2. PropsGenerator: Props 인터페이스 생성
 * 3. StylesGenerator: 스타일 코드 생성
 * 4. JsxGenerator: JSX 컴포넌트 생성
 * 5. Prettier 포맷팅
 */

import type { UITree } from "../../types/types";
import { ImportsGenerator } from "./generators/ImportsGenerator";
import { PropsGenerator } from "./generators/PropsGenerator";
import { StylesGenerator } from "./generators/StylesGenerator";
import { JsxGenerator } from "./generators/JsxGenerator";
import { EmotionStrategy } from "./style-strategy/EmotionStrategy";
import type { IStyleStrategy } from "./style-strategy/IStyleStrategy";

/** 스타일 전략 타입 */
export type StyleStrategyType = "emotion" | "tailwind";

/** CodeEmitter 옵션 */
export interface CodeEmitterOptions {
  /** 스타일 전략 */
  styleStrategy?: StyleStrategyType;
  /** 디버그 모드 (data-figma-id 추가) */
  debug?: boolean;
}

/** 코드 생성 결과 */
export interface EmittedCode {
  /** 전체 코드 */
  code: string;
  /** 컴포넌트 이름 */
  componentName: string;
}

export class CodeEmitter {
  private readonly options: Required<CodeEmitterOptions>;
  private readonly styleStrategy: IStyleStrategy;

  constructor(options: CodeEmitterOptions = {}) {
    this.options = {
      styleStrategy: options.styleStrategy ?? "emotion",
      debug: options.debug ?? false,
    };

    // StyleStrategy 생성
    this.styleStrategy = this.createStyleStrategy();
  }

  /**
   * UITree를 React 코드로 변환
   */
  async emit(uiTree: UITree): Promise<EmittedCode> {
    const componentName = this.toComponentName(uiTree.root.name);

    // 1. 각 섹션 생성
    const imports = ImportsGenerator.generate(uiTree, this.styleStrategy);
    const propsInterface = PropsGenerator.generate(uiTree, componentName);
    const styles = StylesGenerator.generate(uiTree, componentName, this.styleStrategy);
    const component = JsxGenerator.generate(uiTree, componentName, this.styleStrategy, {
      debug: this.options.debug,
    });

    // 2. 코드 조합
    const code = [
      imports,
      "",
      propsInterface,
      "",
      styles,
      "",
      component,
    ].join("\n");

    // 3. 포맷팅
    const formattedCode = await this.formatCode(code);

    return {
      code: formattedCode,
      componentName,
    };
  }

  /**
   * StyleStrategy 생성
   */
  private createStyleStrategy(): IStyleStrategy {
    switch (this.options.styleStrategy) {
      case "tailwind":
        // TODO: TailwindStrategy 구현
        return new EmotionStrategy();
      case "emotion":
      default:
        return new EmotionStrategy();
    }
  }

  /**
   * 컴포넌트 이름 변환 (PascalCase)
   */
  private toComponentName(name: string): string {
    return name
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Prettier 포맷팅
   */
  private async formatCode(code: string): Promise<string> {
    try {
      const prettier = await import("prettier");
      const parserTypescript = await import("prettier/plugins/typescript");

      const formatted = await prettier.format(code, {
        parser: "typescript",
        plugins: [parserTypescript.default],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        printWidth: 80,
        trailingComma: "es5",
      });

      return formatted;
    } catch (error) {
      console.warn("Prettier formatting failed:", error);
      return code;
    }
  }
}

export default CodeEmitter;
