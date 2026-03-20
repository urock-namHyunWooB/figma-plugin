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
    let toggleProp = ctx.props.find((p) => isToggleProp(p.name));

    // toggle prop이 없으면 active: boolean prop 자동 생성
    if (!toggleProp) {
      const activeProp = {
        type: "boolean" as const,
        name: "active",
        defaultValue: "false",
        required: false,
        sourceKey: "",
      };
      ctx.props.push(activeProp);
      toggleProp = activeProp;
    }

    const activeName = toggleProp.name;

    // 루트에 onClick 바인딩 (+ disable 계열 prop이 있으면 disabled도)
    const disableProp = ctx.props.find((p) => isDisableProp(p.name));
    const attrBindings: Record<string, { prop: string } | { expr: string }> = {
      ...ctx.tree.bindings?.attrs,
      role: { expr: '"switch"' },
      'aria-checked': { prop: activeName },
      onClick: { expr: `() => ${onChangeName}?.(!${activeName})` },
    };
    if (disableProp) {
      attrBindings.disabled = { prop: disableProp.name };
    }
    ctx.tree.bindings = { ...ctx.tree.bindings, attrs: attrBindings };

    // 노브(토글 원) 중복 통합
    this.mergeKnobNodes(ctx.tree);

    // spacer 프레임 제거
    this.removeSpacerNodes(ctx.tree);

    // Active 상태 기반 justify-content 동적 스타일
    this.addJustifyContentStyle(ctx.tree, activeName);

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
   * 같은 이름의 RECTANGLE 노브 노드들을 1개로 통합
   *
   * variant 병합 시 checked 상태에 따라 노브 위치가 다르면
   * NodeMatcher가 같은 노드로 인식 못 해 중복 생성됨.
   * 모든 노브의 mergedNodes를 합치고 중복 제거.
   */
  private mergeKnobNodes(tree: InternalNode): void {
    const knobGroups = new Map<string, InternalNode[]>();

    for (const child of tree.children) {
      if (child.type === "RECTANGLE") {
        const key = child.name;
        if (!knobGroups.has(key)) knobGroups.set(key, []);
        knobGroups.get(key)!.push(child);
      }
    }

    for (const [, knobs] of knobGroups) {
      if (knobs.length <= 1) continue;

      // 첫 번째 노브에 나머지의 mergedNodes 합치기
      const primary = knobs[0];
      for (let i = 1; i < knobs.length; i++) {
        if (knobs[i].mergedNodes) {
          primary.mergedNodes = [
            ...(primary.mergedNodes || []),
            ...knobs[i].mergedNodes,
          ];
        }
      }

      // visibleCondition 제거 (항상 보여야 함)
      delete (primary as any).visibleCondition;

      // 중복 노브를 children에서 제거
      const knobSet = new Set(knobs.slice(1));
      tree.children = tree.children.filter((c) => !knobSet.has(c));
    }
  }

  /**
   * spacer 프레임 제거 (재귀)
   *
   * Figma에서 간격 조절용으로 쓴 spacer 프레임은 CSS gap으로 처리되므로 불필요.
   */
  private removeSpacerNodes(node: InternalNode): void {
    node.children = node.children.filter(
      (child) => !child.name.toLowerCase().includes("spacer")
    );
    for (const child of node.children) {
      this.removeSpacerNodes(child);
    }
  }

  /**
   * checked 상태에 따른 justify-content 동적 스타일 추가
   *
   * Figma에서 checked=true일 때 primaryAxisAlignItems: "MAX" (노브 오른쪽),
   * checked=false일 때 기본 (노브 왼쪽). CSS로 justify-content를 제어.
   */
  private addJustifyContentStyle(tree: InternalNode, activeName: string): void {
    if (!tree.styles) return;

    if (!tree.styles.dynamic) {
      tree.styles.dynamic = [];
    }

    // checked=true → justify-content: flex-end (노브 오른쪽)
    tree.styles.dynamic.push({
      condition: { type: "truthy", prop: activeName },
      style: { "justify-content": "flex-end" },
    });

    // base에 flex-start 설정 (checked=false 기본)
    if (tree.styles.base) {
      tree.styles.base["justify-content"] = "flex-start";
    }
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
