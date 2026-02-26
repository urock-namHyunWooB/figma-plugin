/**
 * SwitchHeuristic
 *
 * Switch/Toggle 컴포넌트 판별 휴리스틱
 *
 * 판별 기준:
 * 1. 이름 패턴: switch, toggle (+10)
 * 2. Active prop이 boolean 타입 (+10)
 * 3. 시각적 특성: 작은 크기, 높이 16-48px (+5)
 *
 * 추가 기능:
 * - onChange prop 추가: (active: boolean) => void
 * - onClick 핸들러 추가
 */

import type { ComponentType, InternalNode } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";

export class SwitchHeuristic implements IHeuristic {
  readonly name = "SwitchHeuristic";
  readonly componentType: ComponentType = "toggle";

  // ===========================================================================
  // Score 계산
  // ===========================================================================

  score(ctx: HeuristicContext): number {
    let score = 0;

    // 1. 이름 패턴 매칭 (+10)
    score += this.scoreByName(ctx.componentName);

    // 2. Active prop 매칭 (+10)
    score += this.scoreByActiveProp(ctx.propDefs);

    // 3. 시각적 특성 매칭 (+5)
    score += this.scoreByVisual(ctx);

    return score;
  }

  /**
   * 이름 패턴 점수
   */
  private scoreByName(name: string): number {
    const lowerName = name.toLowerCase();

    // 정확한 매칭
    if (/switch/i.test(lowerName)) return 10;
    if (/toggle/i.test(lowerName)) return 10;

    return 0;
  }

  /**
   * Active prop 점수
   */
  private scoreByActiveProp(
    propDefs:
      | Record<string, { type?: string; variantOptions?: string[] }>
      | undefined
  ): number {
    if (!propDefs) return 0;

    // Active prop 찾기 (boolean 또는 VARIANT with True/False)
    const activeProp = Object.entries(propDefs).find(([key, def]) => {
      const keyLower = key.toLowerCase();
      if (!keyLower.includes("active")) return false;

      // BOOLEAN 타입
      if (def.type === "BOOLEAN") return true;

      // VARIANT 타입이고 True/False 옵션이 있는 경우
      if (def.type === "VARIANT" && def.variantOptions) {
        const options = def.variantOptions.map((o) => o.toLowerCase());
        return options.includes("true") && options.includes("false");
      }

      return false;
    });

    return activeProp ? 10 : 0;
  }

  /**
   * 시각적 특성 점수
   */
  private scoreByVisual(ctx: HeuristicContext): number {
    const rootBounds = ctx.tree.bounds;
    if (!rootBounds) return 0;

    let score = 0;

    // 높이 16-48px (Switch는 작은 크기)
    if (rootBounds.height >= 16 && rootBounds.height <= 48) {
      score += 2;
    }

    // 가로세로 비율 1.5-3 (Switch는 가로로 긴 형태)
    const ratio = rootBounds.width / rootBounds.height;
    if (ratio >= 1.5 && ratio <= 3) {
      score += 3;
    }

    return score;
  }

  // ===========================================================================
  // Apply
  // ===========================================================================

  apply(ctx: HeuristicContext): HeuristicResult {
    // 루트에 semanticType 설정
    ctx.tree.semanticType = "switch";

    // onChange prop 추가
    this.addOnChangeProp(ctx);

    return {
      componentType: this.componentType,
      rootNodeType: "button", // Switch는 클릭 가능한 요소이므로 button
    };
  }

  /**
   * onChange prop 추가
   */
  private addOnChangeProp(ctx: HeuristicContext): void {
    // 이미 onChange prop이 있으면 추가하지 않음
    const hasOnChange = ctx.props.some((p) => p.name === "onChange");
    if (hasOnChange) return;

    // onChange prop 추가
    ctx.props.push({
      type: "function",
      name: "onChange",
      defaultValue: undefined,
      required: false,
      sourceKey: "", // 휴리스틱이 추가한 prop
      functionSignature: "(active: boolean) => void",
    });
  }
}
