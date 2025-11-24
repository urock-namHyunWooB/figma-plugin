import type { ComponentAST, ElementASTNode } from "../../types";
import type {
  IPrettifierStrategy,
  PrettifierContext,
} from "./IPrettifierStrategy";
import { DefaultPrettifierStrategy } from "./DefaultPrettifierStrategy";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";

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

  public canHandle(ast: AstTree): boolean {
    // Text 타입인지 확인 (예: propsIR에서 타입 확인 또는 ast.name 확인)
    // 여기서는 예시로 ast.name을 기반으로 판단
    const isTextType = ast.name.toLowerCase().includes("text");

    // 또는 propsIR을 기반으로 판단할 수도 있음
    // const hasTextProp = context.propsIR.some(prop => prop.type === "TEXT");

    return isTextType;
  }

  public prettifyNode(ast: AstTree) {
    console.log("isText!!");
    return this.defaultStrategy.prettifyNode(ast);
  }
}
