/**
 * ProfileHeuristic
 *
 * 프로필 아바타 컴포넌트 감지 및 보정
 *
 * 감지 기준:
 * - 이름에 "profile" 또는 "avatar" 포함
 * - states variant 존재 (default/dimmed/none 등)
 *
 * 보정:
 * 1. imageSrc prop 추가 (no default) — CSS background fallback
 * 2. text boolean → string 변환 (default: Figma TEXT 내용)
 * 3. states prop 제거 — dimmed→:hover, none→!imageSrc 자동 전환
 * 4. hover 효과: ::after overlay + text opacity 전환
 * 5. placeholder FRAME: states=none → !imageSrc 조건 변경
 * 6. 기타 스타일 보정 (border, background, position)
 */

import type {
  InternalNode,
  ConditionNode,
  StringPropDefinition,
} from "../../../../types/types";
import type {
  IHeuristic,
  HeuristicContext,
  HeuristicResult,
} from "./IHeuristic";
import type { ComponentType } from "../../../../types/types";

export class ProfileHeuristic implements IHeuristic {
  readonly name = "ProfileHeuristic";
  readonly componentType: ComponentType = "unknown";

  score(ctx: HeuristicContext): number {
    const name = ctx.componentName.toLowerCase();
    if (!/\b(profile|avatar)\b/i.test(name)) return 0;

    // states variant가 있어야 함
    if (!ctx.propDefs) return 0;
    const hasStates = Object.keys(ctx.propDefs).some(
      (k) => ctx.propDefs![k].type === "VARIANT" && /^states?$/i.test(k)
    );
    if (!hasStates) return 0;

    return 15;
  }

  apply(ctx: HeuristicContext): HeuristicResult {
    // 1. imageSrc prop 추가 (no default, CSS background가 fallback)
    this.addImageSrcProp(ctx);

    // 2. text boolean → string 변환
    this.convertTextToStringProp(ctx);

    // 3. TEXT visibleCondition: truthy(text) only (states 의존 제거)
    this.fixTextVisibleCondition(ctx);

    // 4. TEXT font 스타일 + hover hidden 스타일 주입
    this.injectTextStyles(ctx);

    // 5. states prop 제거 + states 관련 dynamic 전부 제거
    this.removeStatesProp(ctx);

    // 6. 루트 background에서 이미지 URL 제거 (size/position만 유지)
    this.stripImageFromBackground(ctx.tree);

    // 7. hover 효과 (::after overlay + text visibility)
    this.addHoverEffect(ctx.tree);

    // 8. placeholder FRAME: states=none → !imageSrc
    this.fixPlaceholderCondition(ctx.tree);

    // 9. placeholder position 보정
    this.fixPlaceholderPosition(ctx.tree);

    return { componentType: this.componentType };
  }

  // ===========================================================================
  // 1. imageSrc prop
  // ===========================================================================

  /**
   * imageSrc prop 추가 (default 없음)
   * CSS background가 visual fallback 역할 → imageSrc 미제공 시 placeholder 표시
   */
  private addImageSrcProp(ctx: HeuristicContext): void {
    if (ctx.props.some((p) => p.name === "imageSrc")) return;

    const prop: StringPropDefinition = {
      type: "string",
      name: "imageSrc",
      required: false,
      sourceKey: "",
    };
    ctx.props.push(prop);

    // 루트에 backgroundImage 인라인 스타일 바인딩
    if (!ctx.tree.bindings) ctx.tree.bindings = {};
    if (!ctx.tree.bindings.style) ctx.tree.bindings.style = {};
    ctx.tree.bindings.style["backgroundImage"] = {
      expr: "imageSrc ? `url(${imageSrc})` : undefined",
    };
  }

  // ===========================================================================
  // 2. text boolean → string
  // ===========================================================================

  /**
   * text boolean prop → string prop 변환
   * defaultValue는 Figma TEXT 노드의 실제 문자열 (예: "홍")
   */
  private convertTextToStringProp(ctx: HeuristicContext): void {
    const textIdx = ctx.props.findIndex(
      (p) => p.name === "text" && p.type === "boolean"
    );
    if (textIdx === -1) return;

    // TEXT 노드에서 실제 문자 추출
    const defaultText = this.extractTextContent(ctx.tree, ctx) || "홍";

    // boolean → string 교체
    const prop: StringPropDefinition = {
      type: "string",
      name: "text",
      defaultValue: defaultText,
      required: false,
      sourceKey: ctx.props[textIdx].sourceKey,
    };
    ctx.props[textIdx] = prop;

    // TEXT 노드에 textContent 바인딩 설정 → JsxGenerator가 {text} 렌더링
    this.setTextContentBinding(ctx.tree);
  }

  /** TEXT 노드에서 characters 추출 */
  private extractTextContent(
    node: InternalNode,
    ctx: HeuristicContext
  ): string | undefined {
    for (const child of node.children) {
      if (child.type === "TEXT") {
        const firstMerged = child.mergedNodes?.[0];
        if (firstMerged) {
          const { node: figmaNode } = ctx.dataManager.getById(firstMerged.id);
          if (figmaNode && (figmaNode as any).characters) {
            return (figmaNode as any).characters;
          }
        }
      }
      const found = this.extractTextContent(child, ctx);
      if (found) return found;
    }
    return undefined;
  }

  /** TEXT 노드에 bindings.textContent = { prop: "text" } 설정 */
  private setTextContentBinding(node: InternalNode): void {
    for (const child of node.children) {
      if (child.type === "TEXT") {
        if (!child.bindings) child.bindings = {};
        child.bindings.textContent = { prop: "text" };
      }
      this.setTextContentBinding(child);
    }
  }

  // ===========================================================================
  // 3. TEXT visibleCondition
  // ===========================================================================

  /**
   * TEXT 노드의 visibleCondition을 truthy(text)로 단순화
   * (states 의존 제거 — hover CSS가 대신 처리)
   */
  private fixTextVisibleCondition(ctx: HeuristicContext): void {
    this.traverseFixTextCondition(ctx.tree);
  }

  private traverseFixTextCondition(node: InternalNode): void {
    for (const child of node.children) {
      if (child.type === "TEXT") {
        // 기존 조건 무시 → truthy(text) only
        child.visibleCondition = {
          type: "truthy",
          prop: "text",
        };
      }
      this.traverseFixTextCondition(child);
    }
  }

  // ===========================================================================
  // 4. TEXT font 스타일 주입
  // ===========================================================================

  /**
   * TEXT 노드에 font 스타일 + hover visibility 스타일 주입
   */
  private injectTextStyles(ctx: HeuristicContext): void {
    for (const child of ctx.tree.children) {
      if (child.type === "TEXT") {
        this.injectFontStylesFromFigma(child, ctx);
      }
    }
  }

  /**
   * Figma TEXT 노드에서 font 스타일 추출 → styles.base에 주입
   * + 절대 위치 + opacity: 0 (hover 시 표시)
   */
  private injectFontStylesFromFigma(
    textNode: InternalNode,
    ctx: HeuristicContext
  ): void {
    const firstMerged = textNode.mergedNodes?.[0];
    if (!firstMerged) return;

    const { node: figmaNode } = ctx.dataManager.getById(firstMerged.id);
    if (!figmaNode) return;

    const style = (figmaNode as any).style;
    const fills = (figmaNode as any).fills;

    const fontStyles: Record<string, string | number> = {};

    // font 속성 추출
    if (style?.fontSize) {
      fontStyles["font-size"] = `${style.fontSize}px`;
    }
    if (style?.fontWeight) {
      fontStyles["font-weight"] = `${style.fontWeight}`;
    }
    if (style?.fontFamily) {
      fontStyles["font-family"] = `"${style.fontFamily}"`;
    }
    if (style?.letterSpacing && style.letterSpacing !== 0) {
      fontStyles["letter-spacing"] = `${style.letterSpacing}px`;
    }
    if (style?.lineHeightPercentFontSize) {
      fontStyles["line-height"] = `${style.lineHeightPercentFontSize}%`;
    }
    if (style?.textAlignHorizontal === "CENTER") {
      fontStyles["text-align"] = "center";
    }

    // text color (fills)
    if (fills?.length > 0) {
      const fill = fills[0];
      if (fill.type === "SOLID" && fill.color) {
        const { r, g, b } = fill.color;
        fontStyles["color"] = ProfileHeuristic.rgbToHex(r, g, b);
      }
    }

    // 레이아웃: 절대 위치 + 중앙 정렬
    fontStyles["display"] = "flex";
    fontStyles["align-items"] = "center";
    fontStyles["justify-content"] = "center";
    fontStyles["position"] = "absolute";
    fontStyles["inset"] = "0";
    fontStyles["font-style"] = "normal";

    // hover visibility
    fontStyles["opacity"] = "0";
    fontStyles["transition"] = "opacity 0.15s";
    fontStyles["z-index"] = "2";

    if (Object.keys(fontStyles).length === 0) return;

    // styles.base에 병합 (fontStyles 우선 → 기존 left/top 등 덮어씀)
    if (!textNode.styles) {
      textNode.styles = { base: {}, dynamic: [] };
    }
    textNode.styles.base = {
      ...textNode.styles.base,
      ...fontStyles,
    };
    // 불필요한 Figma 좌표 제거
    delete textNode.styles.base["left"];
    delete textNode.styles.base["top"];

    // size별 font-size 동적 스타일 주입
    this.injectSizeDynamicFontStyles(textNode, ctx);
  }

  /**
   * TEXT 노드의 size별 fontSize 차이를 dynamic 스타일로 주입
   */
  private injectSizeDynamicFontStyles(
    textNode: InternalNode,
    ctx: HeuristicContext
  ): void {
    if (!textNode.mergedNodes || textNode.mergedNodes.length < 2) return;

    const sizePropName = this.findSizePropName(ctx);
    if (!sizePropName) return;

    const sizeToFontSize = new Map<string, number>();
    for (const merged of textNode.mergedNodes) {
      const { node: figmaNode } = ctx.dataManager.getById(merged.id);
      if (!figmaNode) continue;

      const fontSize = (figmaNode as any).style?.fontSize;
      if (!fontSize) continue;

      const variantName = merged.variantName || "";
      const sizeMatch = variantName.match(/size=(\w+)/i);
      if (sizeMatch) {
        sizeToFontSize.set(sizeMatch[1], fontSize);
      }
    }

    if (sizeToFontSize.size < 2) return;

    const baseFontSize = parseFloat(
      (textNode.styles?.base?.["font-size"] as string) || "0"
    );

    if (!textNode.styles) textNode.styles = { base: {}, dynamic: [] };
    if (!textNode.styles.dynamic) textNode.styles.dynamic = [];

    for (const [sizeValue, fontSize] of sizeToFontSize) {
      if (fontSize === baseFontSize) continue;

      textNode.styles.dynamic.push({
        condition: {
          type: "eq",
          prop: sizePropName,
          value: sizeValue,
        },
        style: { "font-size": `${fontSize}px` },
      });
    }
  }

  private findSizePropName(ctx: HeuristicContext): string | undefined {
    if (!ctx.propDefs) return undefined;
    for (const key of Object.keys(ctx.propDefs)) {
      if (/^size$/i.test(key) && ctx.propDefs[key].type === "VARIANT") {
        return key;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // 5. states prop 제거
  // ===========================================================================

  /**
   * states prop 완전 제거
   * - props 배열에서 states 제거
   * - 트리 전체 dynamic에서 states 관련 엔트리 제거
   */
  private removeStatesProp(ctx: HeuristicContext): void {
    // props에서 states 제거
    const statesIdx = ctx.props.findIndex(
      (p) => p.type === "variant" && /^states?$/i.test(p.name)
    );
    if (statesIdx !== -1) {
      ctx.props.splice(statesIdx, 1);
    }

    // 트리 전체에서 states 관련 dynamic 제거
    this.removeStatesDynamic(ctx.tree);
  }

  /**
   * 재귀적으로 states 관련 dynamic 엔트리 처리
   * - 단순 eq(states, X) → 제거
   * - AND(states=default, size=X) → states 조건 제거, size만 남김 (default 스타일 보존)
   * - AND(states≠default, size=X) → 제거
   * - states 무관 → 유지
   */
  private removeStatesDynamic(node: InternalNode): void {
    if (node.styles?.dynamic) {
      const newDynamic: typeof node.styles.dynamic = [];

      for (const entry of node.styles.dynamic) {
        const statesValue = this.getStatesValue(entry.condition);

        if (!statesValue) {
          // states 무관 → 유지
          newDynamic.push(entry);
        } else if (entry.condition.type === "and") {
          // AND: states=default만 보존 (size 스타일 유지)
          if (/^default$/i.test(statesValue)) {
            const nonStatesConditions = entry.condition.conditions.filter(
              (c) => !(c.type === "eq" && /^states?$/i.test(c.prop))
            );
            if (nonStatesConditions.length === 1) {
              newDynamic.push({ condition: nonStatesConditions[0], style: entry.style });
            } else if (nonStatesConditions.length > 1) {
              newDynamic.push({
                condition: { type: "and", conditions: nonStatesConditions },
                style: entry.style,
              });
            }
          }
          // states != default → 제거
        }
        // simple eq(states, X) → 제거
      }

      node.styles.dynamic = newDynamic;
    }
    for (const child of node.children) {
      this.removeStatesDynamic(child);
    }
  }

  // ===========================================================================
  // 6. background에서 이미지 URL 제거
  // ===========================================================================

  /**
   * 루트 size 스타일에서 background의 url() 제거
   * background-size/position/repeat만 유지 → imageSrc 인라인 스타일과 조합
   */
  private stripImageFromBackground(node: InternalNode): void {
    // base에서 처리
    if (node.styles?.base) {
      this.replaceBackgroundWithProperties(node.styles.base);
    }
    // dynamic (size entries)에서 처리
    if (node.styles?.dynamic) {
      for (const entry of node.styles.dynamic) {
        this.replaceBackgroundWithProperties(entry.style);
      }
    }
  }

  /** background shorthand → 개별 속성 분리 (url 제거) */
  private replaceBackgroundWithProperties(
    style: Record<string, string | number>
  ): void {
    const bg = style["background"] as string | undefined;
    if (!bg || !/url\(/.test(bg)) return;

    delete style["background"];
    style["background-size"] = "cover";
    style["background-position"] = "50%";
    style["background-repeat"] = "no-repeat";
  }

  // ===========================================================================
  // 7. hover 효과
  // ===========================================================================

  /**
   * 루트에 hover 효과 추가
   * - ::after overlay (어두운 반투명)
   * - &:hover > span text 표시
   */
  private addHoverEffect(node: InternalNode): void {
    if (!node.styles) node.styles = { base: {}, dynamic: [] };

    // __nested로 중첩 셀렉터 삽입
    (node.styles.base as any).__nested = {
      "&::after": {
        content: "''",
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        background: "rgba(0, 0, 0, 0.25)",
        opacity: "0",
        transition: "opacity 0.15s",
        pointerEvents: "none",
        zIndex: "1",
      },
      "&:hover::after": {
        opacity: "1",
      },
      "&:hover > span": {
        opacity: "1",
      },
    };
  }

  // ===========================================================================
  // 8. placeholder 조건 변경
  // ===========================================================================

  /**
   * placeholder FRAME: states=none → !imageSrc
   * imageSrc 미제공 시 자동으로 placeholder 실루엣 표시
   */
  private fixPlaceholderCondition(node: InternalNode): void {
    for (const child of node.children) {
      if (
        child.type === "FRAME" &&
        child.visibleCondition?.type === "eq" &&
        /^states?$/i.test((child.visibleCondition as any).prop) &&
        /^none$/i.test((child.visibleCondition as any).value)
      ) {
        child.visibleCondition = {
          type: "not",
          condition: { type: "truthy", prop: "imageSrc" },
        };
      }
    }
  }

  // ===========================================================================
  // 9. placeholder position 보정
  // ===========================================================================

  /**
   * placeholder FRAME의 absolute position → 100% fill
   */
  private fixPlaceholderPosition(node: InternalNode): void {
    for (const child of node.children) {
      if (
        child.type === "FRAME" &&
        child.visibleCondition?.type === "not"
      ) {
        if (child.styles?.base) {
          delete child.styles.base["position"];
          delete child.styles.base["left"];
          delete child.styles.base["top"];

          child.styles.base["width"] = "100%";
          child.styles.base["height"] = "100%";

          // Figma가 이미지 fill에 자동 추가하는 lightgray fallback 제거
          const bg = child.styles.base["background"] as string | undefined;
          if (bg && /lightgray/i.test(bg)) {
            child.styles.base["background"] = bg.replace(/\s*lightgray/i, "");
          }
        }

        // size별 width/height dynamic 제거 (부모에 맞춤)
        if (child.styles?.dynamic) {
          for (const entry of child.styles.dynamic) {
            delete entry.style["width"];
            delete entry.style["height"];
          }
        }
      }
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** 조건에서 states prop의 값 추출 */
  private getStatesValue(condition: ConditionNode): string | undefined {
    if (condition.type === "eq" && /^states?$/i.test(condition.prop)) {
      return String(condition.value);
    }
    if (condition.type === "and") {
      for (const c of condition.conditions) {
        if (c.type === "eq" && /^states?$/i.test(c.prop)) {
          return String(c.value);
        }
      }
    }
    return undefined;
  }

  /** 조건이 states prop을 포함하는지 확인 */
  private isStatesCondition(condition: ConditionNode): boolean {
    if (condition.type === "eq" && /^states?$/i.test(condition.prop)) {
      return true;
    }
    if (condition.type === "and") {
      return condition.conditions.some(
        (c) => c.type === "eq" && /^states?$/i.test(c.prop)
      );
    }
    return false;
  }

  private static rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}
