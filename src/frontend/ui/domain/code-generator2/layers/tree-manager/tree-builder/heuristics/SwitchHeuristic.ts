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

import type { ComponentType } from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import { isToggleProp, isDisableProp } from "../processors/utils/propPatterns";

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
   * Active prop 점수 (scoring은 "active" 전용 — 다른 패턴은 apply에서만 사용)
   */
  private scoreByActiveProp(
    propDefs:
      | Record<string, { type?: string; variantOptions?: string[] }>
      | undefined
  ): number {
    if (!propDefs) return 0;

    const activeProp = Object.entries(propDefs).find(([key, def]) => {
      if (!key.toLowerCase().includes("active")) return false;

      if (def.type === "BOOLEAN") return true;

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
    // onChange prop 추가
    const onChangeName = this.addOnChangeProp(ctx);

    // 토글 상태 prop 이름 찾기 (active, on, toggled 등)
    const toggleProp = ctx.props.find((p) => isToggleProp(p.name));
    const activeName = toggleProp?.name ?? "active";

    // 루트에 onClick 바인딩 (+ disable 계열 prop이 있으면 disabled도)
    const disableProp = ctx.props.find((p) => isDisableProp(p.name));
    const attrBindings: Record<string, { prop: string } | { expr: string }> = {
      ...ctx.tree.bindings?.attrs,
      onClick: { expr: `() => ${onChangeName}?.(!${activeName})` },
    };
    if (disableProp) {
      attrBindings.disabled = { prop: disableProp.name };
    }
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: attrBindings };

    // Active 상태 기반 CSS 생성
    this.addActiveDynamicStyles(ctx.tree);

    // Disable 상태 기반 CSS 생성 (disable prop이 있는 경우만)
    this.addDisableDynamicStyles(ctx.tree, ctx.props);

    return {
      componentType: this.componentType,
      rootNodeType: "button",
    };
  }

  /**
   * onChange prop 추가
   */
  private addOnChangeProp(ctx: HeuristicContext): string {
    const name = "onChange";
    if (!ctx.props.some((p) => p.name === name)) {
      ctx.props.push({
        type: "function",
        name,
        defaultValue: undefined,
        required: false,
        sourceKey: "",
        functionSignature: "(active: boolean) => void",
      });
    }
    return name;
  }

  /**
   * INSTANCE 자식들에 active, disable, size props 자동 전달
   */
  private propagatePropsToInstances(
    node: any,
    props: any[]
  ): void {
    if (!node) return;

    // active, disable, size, onChange prop 이름 찾기
    const activeProp = props.find((p) => isToggleProp(p.name));
    const disableProp = props.find((p) => isDisableProp(p.name));
    const sizeProp = props.find((p) => p.name.toLowerCase().includes("size"));
    const onChangeProp = props.find((p) => p.name === "onChange");

    const traverse = (n: any) => {
      if (n.type === "INSTANCE") {
        // INSTANCE 자식에 props 바인딩
        if (!n.bindings) {
          n.bindings = {};
        }
        if (!n.bindings.attrs) {
          n.bindings.attrs = {};
        }

        if (activeProp) {
          n.bindings.attrs.active = { prop: activeProp.name };
        }
        if (disableProp) {
          n.bindings.attrs.disable = { prop: disableProp.name };
        }
        if (sizeProp) {
          n.bindings.attrs.size = { prop: sizeProp.name };
        }
        if (onChangeProp) {
          n.bindings.attrs.onChange = { prop: onChangeProp.name };
        }
      }

      // 자식 순회
      if (n.children && Array.isArray(n.children)) {
        for (const child of n.children) {
          traverse(child);
        }
      }
    };

    traverse(node);
  }

  /**
   * Active 상태 기반 동적 CSS 추가
   *
   * Figma에서 Active=False와 Active=True variant의 스타일 차이를 계산해서
   * CSS dynamic condition으로 변환
   */
  private addActiveDynamicStyles(node: any): void {
    if (!node || !node.mergedNodes) return;

    // mergedNodes에서 Active=False와 Active=True 버전 찾기
    const falseVariant = node.mergedNodes.find((m: any) =>
      m.variantName && m.variantName.includes("Active=False")
    );
    const trueVariant = node.mergedNodes.find((m: any) =>
      m.variantName && m.variantName.includes("Active=True")
    );

    if (!falseVariant || !trueVariant) {
      return; // Active variant가 없으면 처리하지 않음
    }

    // TODO: mergedNodes의 스타일 차이를 계산해서
    // dynamic CSS로 추가하는 로직 구현
    // 현재는 StyleProcessor에서 이미 variant별 스타일을 수집하므로
    // 그 정보를 활용해야 함

    // 임시로 StyleProcessor가 처리하도록 위임
  }

  /**
   * Disable 상태 기반 동적 CSS 추가
   *
   * 루트 노드에만 적용 (opacity는 CSS 상속되므로 자식에 중복 불필요)
   * disable prop이 실제로 존재하는 컴포넌트에서만 동작
   */
  private addDisableDynamicStyles(node: any, props: any[]): void {
    if (!node?.styles) return;

    const disableProp = props.find(
      (p: any) => isDisableProp(p.name)
    );
    if (!disableProp) return;

    if (!node.styles.dynamic) {
      node.styles.dynamic = [];
    }

    node.styles.dynamic.push({
      condition: { type: "eq", prop: disableProp.name, value: "true" },
      style: {
        opacity: "0.5",
        cursor: "not-allowed",
      },
    });
  }
}
