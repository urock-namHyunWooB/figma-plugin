/**
 * PolicyMapper
 *
 * CodeEmitterPolicy → ReactGeneratorOptions
 * 새로운 아키텍처의 Policy를 ReactGenerator가 기대하는 옵션으로 변환합니다.
 *
 * NOTE: 레거시 ReactGenerator와의 호환성을 위해 유지합니다.
 * 새로운 ReactEmitter는 이 모듈을 사용하지 않고 직접 StyleStrategy를 생성합니다.
 */

import type { CodeEmitterPolicy, StyleStrategy as PolicyStyleStrategy } from "@compiler/types/architecture";
import type { ReactGeneratorOptions } from "@compiler/core/react-generator/ReactGenerator";
import type { StyleStrategyOptions } from "@compiler/core/react-generator/style-strategy";

/**
 * CodeEmitterPolicy를 ReactGeneratorOptions로 변환
 * (레거시 Engine.ts, FigmaCodeGenerator에서 사용)
 *
 * @example
 * // Input (CodeEmitterPolicy)
 * {
 *   platform: "react",
 *   styleStrategy: "tailwind",
 *   convention: { componentStyle: "function", ... }
 * }
 *
 * // Output (ReactGeneratorOptions)
 * {
 *   styleStrategy: { type: "tailwind" },
 *   debug: false
 * }
 */
export function mapPolicy(policy: CodeEmitterPolicy): ReactGeneratorOptions {
  return {
    styleStrategy: mapStyleStrategy(policy.styleStrategy),
    debug: policy.debug ?? false,
  };
}

/**
 * StyleStrategy (string) → StyleStrategyOptions 변환
 */
function mapStyleStrategy(strategy: PolicyStyleStrategy): StyleStrategyOptions {
  switch (strategy) {
    case "tailwind":
      return {
        type: "tailwind",
        tailwind: {
          inlineCn: true, // 의존성 없이 동작
          useArbitraryValues: true,
        },
      };

    case "emotion":
    default:
      return {
        type: "emotion",
      };

    // 향후 확장 가능
    // case "css-modules":
    // case "styled-components":
  }
}

/**
 * 기본 CodeEmitterPolicy 생성
 */
export function createDefaultPolicy(): CodeEmitterPolicy {
  return {
    platform: "react",
    styleStrategy: "emotion",
  };
}

export default {
  map: mapPolicy,
  createDefault: createDefaultPolicy,
};
