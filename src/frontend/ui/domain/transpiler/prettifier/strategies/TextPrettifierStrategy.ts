import type { PropIR, UnifiedNode } from "../../types";
import type { IPrettifierStrategy } from "./IPrettifierStrategy";
import { DefaultPrettifierStrategy } from "./DefaultPrettifierStrategy";

/**
 * Text 타입 컴포넌트용 prettify 전략 예시
 *
 * 사용 예시:
 * ```ts
 * const prettifier = new Prettifier([
 *   new TextPrettifierStrategy(),
 *   new ButtonPrettifierStrategy(),
 *   new DefaultPrettifierStrategy(), // 항상 마지막에 기본 전략
 * ]);
 * ```
 */
export class TextPrettifierStrategy implements IPrettifierStrategy {
  private defaultStrategy = new DefaultPrettifierStrategy();

  public canHandle(ast: UnifiedNode): boolean {
    // Text 타입인지 확인 (예: ast.name을 기반으로 판단)
    const isTextType = ast.name.toLowerCase().includes("text");

    // 또는 ast.type을 기반으로 판단할 수도 있음
    // const isTextNode = ast.type === "TEXT";

    return isTextType;
  }

  public prettifyNode(
    ast: UnifiedNode,
    props: PropIR[]
  ): { unifiedNode: UnifiedNode; props: PropIR[] } {
    console.log("isText!!");
    return this.defaultStrategy.prettifyNode(ast, props);
  }
}
