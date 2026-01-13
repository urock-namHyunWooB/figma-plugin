export type {
  StyleStrategy,
  StyleStrategyType,
  StyleStrategyOptions,
  DynamicStyleInfo,
} from "./StyleStrategy";

export { default as EmotionStrategy } from "./EmotionStrategy";
export { default as TailwindStrategy } from "./TailwindStrategy";

import ts from "typescript";
import { FinalAstTree } from "@compiler";
import { StyleStrategy, StyleStrategyOptions } from "./StyleStrategy";
import EmotionStrategy from "./EmotionStrategy";
import TailwindStrategy from "./TailwindStrategy";

/**
 * 스타일 전략 팩토리
 * 옵션에 따라 적절한 전략 인스턴스 생성
 */
export function createStyleStrategy(
  factory: ts.NodeFactory,
  astTree: FinalAstTree,
  options?: StyleStrategyOptions
): StyleStrategy {
  const strategyType = options?.type || "emotion";

  switch (strategyType) {
    case "tailwind":
      return new TailwindStrategy(factory, astTree, {
        cnImportPath: options?.tailwind?.cnImportPath,
        inlineCn: options?.tailwind?.inlineCn,
      });

    case "emotion":
    default:
      return new EmotionStrategy(factory, astTree);
  }
}

