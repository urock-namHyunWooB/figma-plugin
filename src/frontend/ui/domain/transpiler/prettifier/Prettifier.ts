import type { IPrettifierStrategy } from "./strategies/IPrettifierStrategy";
import { DefaultPrettifierStrategy } from "./strategies/DefaultPrettifierStrategy";
import { ButtonPrettifierStrategy } from "@frontend/ui/domain/transpiler/prettifier/strategies/ButtonPrettifierStrategy";
import { TextPrettifierStrategy } from "@frontend/ui/domain/transpiler/prettifier/strategies/TextPrettifierStrategy";
import { AstTree } from "@frontend/ui/domain/transpiler/types/ast";
import { PropIR, UnifiedNode } from "@frontend/ui/domain/transpiler";

/**
 * ComponentAST를 정리하고 최적화하는 구현체
 * 전략 패턴을 사용하여 타입별로 다른 prettify 로직을 적용할 수 있도록 확장 가능
 */
export class Prettifier {
  private strategies: IPrettifierStrategy[];

  constructor(strategies?: IPrettifierStrategy[]) {
    this.strategies = strategies ?? [
      new ButtonPrettifierStrategy(),
      new TextPrettifierStrategy(),
      new DefaultPrettifierStrategy(),
    ];
  }

  public prettify(ast: UnifiedNode, props: PropIR[]) {
    // 적절한 전략 선택
    const strategy = this.selectStrategy(ast, props);
    const prettifiedAst = strategy.prettifyNode(ast, props);

    return prettifiedAst;
  }

  /**
   * 컨텍스트에 맞는 전략을 선택
   * 첫 번째로 canHandle이 true를 반환하는 전략을 사용
   */
  private selectStrategy(
    ast: UnifiedNode,
    props: PropIR[]
  ): IPrettifierStrategy {
    const strategy = this.strategies.find((s) => s.canHandle(ast));
    if (!strategy) {
      throw new Error("No prettifier strategy found for the given context");
    }
    return strategy;
  }
}
