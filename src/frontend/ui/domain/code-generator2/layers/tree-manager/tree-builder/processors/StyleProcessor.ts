import {
  InternalNode,
  StyleObject,
  ConditionNode,
  PseudoClass,
  VariantOrigin,
} from "../../../../types/types";
import DataManager from "../../../data-manager/DataManager";

/**
 * StyleProcessor
 *
 * InternalNode의 mergedNodes → StyleObject 변환
 *
 * 병합 전략:
 * 1. 모든 variant 공통 스타일 → base
 * 2. 특정 variant만의 스타일 → dynamic (조건 생성)
 * 3. State prop 기반 스타일 → pseudo
 */
export class StyleProcessor {
  private readonly dataManager: DataManager;

  /** VECTOR 계열 타입 */
  private static readonly VECTOR_TYPES = new Set([
    "VECTOR", "LINE", "ELLIPSE", "STAR", "POLYGON", "BOOLEAN_OPERATION",
  ]);

  /** SVG 전용 속성 (CSS에서 제거해야 함) */
  private static readonly SVG_ONLY_PROPERTIES = new Set([
    "strokeWidth", "stroke-width",
    "strokeLinecap", "stroke-linecap",
    "strokeLinejoin", "stroke-linejoin",
    "strokeMiterlimit", "stroke-miterlimit",
    "strokeDasharray", "stroke-dasharray",
    "strokeDashoffset", "stroke-dashoffset",
    "fillRule", "fill-rule",
    "clipRule", "clip-rule",
  ]);

  // 모든 비-pseudo State 값은 createConditionFromVariantName에서 조건으로 포함됨.
  // 이전에는 PROP_BASED_STATE_VALUES 화이트리스트로 Checked/Indeterminate만 포함했지만,
  // Unchecked 등 default 값을 제외하면 UITreeOptimizer가 잘못 병합하는 버그 발생.

  /** CSS pseudo-class로 변환 가능한 State 값 (lowercase 비교용) */
  static readonly CSS_CONVERTIBLE_STATES = new Set([
    "default", "normal", "enabled", "rest", "idle",
    "hover", "hovered", "hovering",
    "active", "pressed", "pressing", "clicked",
    "focus", "focused", "focus-visible",
    "disabled", "disable", "inactive", "selected", "checked", "visited",
  ]);

  /** State prop 값 → CSS pseudo-class 매핑 (heuristics에서 사용) */
  static readonly STATE_TO_PSEUDO: Record<string, PseudoClass> = {
    Hover: ":hover",
    hover: ":hover",
    Active: ":active",
    active: ":active",
    Pressed: ":active",
    pressed: ":active",
    Focus: ":focus",
    focus: ":focus",
    Disabled: ":disabled",
    disabled: ":disabled",
    disable: ":disabled",
    Visited: ":visited",
    visited: ":visited",
  };

  /**
   * StyleProcessor가 조기 분리해도 안전한 pseudo-class 매핑.
   *
   * active/pressed는 Button에서는 CSS :active이지만
   * Checkbox/Radio/Switch에서는 "선택됨" 상태를 의미하므로 제외.
   * 이들은 dynamic 엔트리에 남겨서 각 heuristic이 판단하도록 위임.
   */
  private static readonly EAGER_PSEUDO: Record<string, PseudoClass> = {
    Hover: ":hover",
    hover: ":hover",
    Focus: ":focus",
    focus: ":focus",
    Disabled: ":disabled",
    disabled: ":disabled",
    disable: ":disabled",
    Visited: ":visited",
    visited: ":visited",
  };

  constructor(dataManager: DataManager) {
    this.dataManager = dataManager;
  }

  /**
   * InternalNode에 스타일 적용 (재귀)
   *
   * 2단계 처리:
   * 1. variant 기반 스타일 적용
   * 2. position 스타일 적용 (absolute positioning)
   */
  public applyStyles(node: InternalNode): InternalNode {
    // 1단계: variant 기반 스타일 적용
    let result = this.applyVariantStyles(node);

    // 2단계: position 스타일 적용
    result = this.applyPositionStyles(result);

    // 3단계: vector fill → currentColor 변환
    result = this.normalizeVectorFills(result);

    return result;
  }

  /**
   * variant 기반 스타일 적용 (재귀)
   */
  private applyVariantStyles(node: InternalNode): InternalNode {
    // 스타일 객체 생성 (synthetic 노드는 기존 styles 유지)
    let styles = this.createStyleObject(node) ?? node.styles;

    // 이전 프로세서가 추가한 dynamic style 보존
    // (createStyleObject가 새 StyleObject를 만들면 기존 node.styles.dynamic이 사라지므로 merge)
    if (styles && styles !== node.styles && node.styles?.dynamic?.length) {
      styles = {
        ...styles,
        dynamic: [...(styles.dynamic || []), ...node.styles.dynamic],
      };
    }

    // HORIZONTAL layoutMode 처리: flex-direction: row 명시적 추가
    // (CSS 기본값이므로 styleTree에 포함되지 않는 경우가 있음)
    if (styles && styles.base && styles.base["display"] === "flex") {
      const { node: sceneNode } = this.dataManager.getById(node.id);
      const layoutMode = (sceneNode as any)?.layoutMode;
      if (layoutMode === "HORIZONTAL" && !styles.base["flex-direction"]) {
        styles = {
          ...styles,
          base: { ...styles.base, "flex-direction": "row" },
        };
      }
    }

    // VECTOR 타입 처리: SVG 전용 속성 제거, overflow: visible 추가
    let correctedBounds: typeof node.bounds | undefined;
    if (styles && StyleProcessor.VECTOR_TYPES.has(node.type)) {
      const filteredBase: Record<string, string | number> = { overflow: "visible" };
      let hasRotate = false;
      for (const [key, value] of Object.entries(styles.base || {})) {
        if (StyleProcessor.SVG_ONLY_PROPERTIES.has(key)) continue;
        // SVG exportAsync는 rotate를 path 좌표에 이미 반영 → CSS rotate 제거 (이중 적용 방지)
        if (key === "transform" && typeof value === "string" && /rotate\(/.test(value)) {
          hasRotate = true;
          const stripped = value.replace(/rotate\([^)]*\)\s*/g, "").trim();
          if (stripped) {
            filteredBase[key] = stripped;
          }
          continue;
        }
        filteredBase[key] = value;
      }

      // rotate 보정 + zero-dimension vector 보정 (stroke-only 경로)
      // getCSSAsync는 회전 전 치수를 반환하므로, absoluteBoundingBox(회전 후)로 보정
      // LINE 제외: height:0 LINE은 레이아웃 구분선으로 display:none 처리됨 (UINodeConverter)
      const hasZeroDim = node.type !== "LINE" && node.bounds &&
        (node.bounds.width < 1 || node.bounds.height < 1);
      if (node.bounds && (hasRotate || hasZeroDim)) {
        let w = node.bounds.width;
        let h = node.bounds.height;
        let bx = node.bounds.x;
        let by = node.bounds.y;

        // 한 축이 ~0인 경우 (직선 등): absoluteRenderBounds(stroke 포함)로 fallback
        if (w < 1 || h < 1) {
          const { node: sceneNode } = this.dataManager.getById(node.id);
          const renderBounds = (sceneNode as any)?.absoluteRenderBounds;
          if (renderBounds) {
            // bounds.x는 폭≈0일 때 중심점 → renderBounds.x(왼쪽 가장자리)로 교체
            if (w < 1) { w = renderBounds.width; bx = renderBounds.x; }
            if (h < 1) { h = renderBounds.height; by = renderBounds.y; }
          }
        }

        filteredBase["width"] = `${Math.round(w * 1000) / 1000}px`;
        filteredBase["height"] = `${Math.round(h * 1000) / 1000}px`;

        // bounds도 교정 (applyPositionStyles에서 올바른 left/top 계산용)
        correctedBounds = { x: bx, y: by, width: w, height: h };
      }

      // VECTOR 치수 보충: getCSSAsync가 width/height를 반환하지 않고
      // collectVariantStyles의 bbox supplement도 cssStyle.flex로 스킵된 경우 대비
      if (node.bounds && !filteredBase["width"] && !filteredBase["height"]) {
        filteredBase["width"] = `${Math.round(node.bounds.width * 1000) / 1000}px`;
        filteredBase["height"] = `${Math.round(node.bounds.height * 1000) / 1000}px`;
      }

      styles = {
        ...styles,
        base: filteredBase,
      };
    }

    // TEXT 노드: text-box-trim 적용
    // Figma는 글리프 visual bounds 기준 정렬, CSS는 line-height 박스 기준 정렬
    // text-box-trim으로 leading을 제거하여 Figma와 동일한 정렬 결과를 얻음
    if (node.type === "text") {
      if (!styles) {
        styles = { base: {}, dynamic: [] };
      }
      styles = {
        ...styles,
        base: {
          ...(styles!.base || {}),
          "text-box-trim": "trim-both",
          "text-box-edge": "cap alphabetic",
        },
      } as StyleObject;
    }

    // strokeAlign: INSIDE → box-sizing: border-box 적용
    // getCSSAsync()가 이미 올바른 padding 값을 반환하므로 padding 보정 불필요
    if (styles && this.hasBorderInStyles(styles)) {
      const strokeAlign = this.getStrokeAlign(node);
      if (strokeAlign === "INSIDE") {
        styles = {
          ...styles,
          base: { ...(styles.base || {}), "box-sizing": "border-box" },
        };
      }
    }

    // children 재귀 처리
    const styledChildren = node.children.map((child) =>
      this.applyVariantStyles(child)
    );

    // CONDITIONAL_GROUP branches 재귀 처리
    // branch 진입 시 자식의 mergedNodes를 해당 branch 값으로 필터링하여
    // StyleProcessor가 고정된 prop 차원을 변수로 보지 않도록 함
    let styledBranches = node.branches;
    if (node.branches && node.branchProp) {
      styledBranches = {};
      for (const [value, children] of Object.entries(node.branches)) {
        styledBranches[value] = children.map((child) =>
          this.applyVariantStyles(
            this.filterMergedNodesForBranch(child, node.branchProp!, value)
          )
        );
      }
    }

    return {
      ...node,
      styles,
      ...(correctedBounds ? { bounds: correctedBounds } : {}),
      children: styledChildren,
      ...(styledBranches ? { branches: styledBranches } : {}),
    };
  }

  /**
   * position 스타일 적용
   *
   * auto-layout이 아닌 부모의 자식에게 position: absolute 적용
   * 해당 부모에게 position: relative 적용
   */
  private applyPositionStyles(node: InternalNode): InternalNode {
    // 1단계: 자식에게 position: absolute, left, top 적용
    const updatedChildren = node.children.map((child) => {
      // 재귀적으로 먼저 자식의 자식들 처리
      const processedChild = this.applyPositionStyles(child);

      // 부모가 auto-layout이 아니면 position 적용
      if (this.shouldApplyAbsolutePosition(node, processedChild)) {
        // variant별 위치를 계산하여 base/dynamic 분리
        const posResult = this.calculatePositionStylesPerVariant(node, processedChild);
        if (posResult) {
          return {
            ...processedChild,
            styles: {
              ...processedChild.styles,
              base: {
                ...(processedChild.styles?.base || {}),
                ...posResult.base,
              },
              dynamic: [
                ...(processedChild.styles?.dynamic || []),
                ...posResult.dynamic,
              ],
            },
          };
        }
      }

      return processedChild;
    });

    // CONDITIONAL_GROUP branches 재귀 처리
    let updatedBranches = node.branches;
    if (node.branches) {
      updatedBranches = {};
      for (const [value, children] of Object.entries(node.branches)) {
        updatedBranches[value] = children.map((child) =>
          this.applyPositionStyles(child)
        );
      }
    }

    // 2단계: absolute 자식이 있으면 부모에 position: relative 적용
    const hasAbsoluteChild = updatedChildren.some(
      (child) => child.styles?.base?.position === "absolute"
    );

    if (hasAbsoluteChild && !node.styles?.base?.position) {
      return {
        ...node,
        styles: {
          ...node.styles,
          base: {
            ...(node.styles?.base || {}),
            position: "relative",
          },
          dynamic: node.styles?.dynamic || [],
        },
        children: updatedChildren,
        ...(updatedBranches ? { branches: updatedBranches } : {}),
      };
    }

    return {
      ...node,
      children: updatedChildren,
      ...(updatedBranches ? { branches: updatedBranches } : {}),
    };
  }

  /**
   * absolute positioning을 적용해야 하는지 확인
   */
  private shouldApplyAbsolutePosition(
    parent: InternalNode,
    _child: InternalNode
  ): boolean {
    // 부모가 FRAME, GROUP, 또는 COMPONENT이어야 함
    if (parent.type !== "FRAME" && parent.type !== "GROUP" && parent.type !== "COMPONENT") {
      return false;
    }

    // 부모가 auto-layout이면 적용하지 않음
    if (this.isAutoLayout(parent)) {
      return false;
    }

    return true;
  }

  /**
   * 부모가 auto-layout인지 확인
   */
  private isAutoLayout(node: InternalNode): boolean {
    // DataManager에서 노드 정보 가져오기
    const { node: sceneNode } = this.dataManager.getById(node.id);
    if (!sceneNode) return false;

    const layoutMode = (sceneNode as any).layoutMode;
    return layoutMode && layoutMode !== "NONE";
  }

  /**
   * variant별 position 스타일 계산 → base/dynamic 분리.
   *
   * 각 variant의 원본 bounds에서 parent 대비 상대 좌표를 계산하고,
   * 공통 값은 base, variant별 차이는 dynamic으로 분리한다.
   */
  private calculatePositionStylesPerVariant(
    parent: InternalNode,
    child: InternalNode
  ): { base: Record<string, string>; dynamic: Array<{ condition: ConditionNode; style: Record<string, string> }> } | null {
    // variant별 위치 수집
    const perVariant = this.collectPositionPerVariant(parent, child);

    if (perVariant.length === 0) {
      // fallback: 기존 단일 계산
      const relPos = this.getRelativePositionFromVariant(parent, child);
      if (relPos) {
        return {
          base: { position: "absolute", left: `${relPos.x}px`, top: `${relPos.y}px` },
          dynamic: [],
        };
      }
      const parentBounds = parent.bounds;
      const childBounds = child.bounds;
      if (!parentBounds || !childBounds) return null;
      return {
        base: {
          position: "absolute",
          left: `${Math.round(childBounds.x - parentBounds.x)}px`,
          top: `${Math.round(childBounds.y - parentBounds.y)}px`,
        },
        dynamic: [],
      };
    }

    // 공통 left/top 추출
    const allLefts = perVariant.map((v) => v.left);
    const allTops = perVariant.map((v) => v.top);
    const commonLeft = allLefts.every((l) => l === allLefts[0]) ? allLefts[0] : null;
    const commonTop = allTops.every((t) => t === allTops[0]) ? allTops[0] : null;

    const base: Record<string, string> = { position: "absolute" };
    if (commonLeft !== null) base.left = commonLeft;
    if (commonTop !== null) base.top = commonTop;

    // variant별 차이를 dynamic에 추가
    const dynamic: Array<{ condition: ConditionNode; style: Record<string, string> }> = [];
    if (commonLeft === null || commonTop === null) {
      for (const v of perVariant) {
        const style: Record<string, string> = {};
        if (commonLeft === null && v.left !== allLefts[0]) style.left = v.left;
        if (commonTop === null && v.top !== allTops[0]) style.top = v.top;
        // 첫 번째 variant의 값은 base에 넣음
        if (v === perVariant[0]) {
          if (commonLeft === null) base.left = v.left;
          if (commonTop === null) base.top = v.top;
        } else if (Object.keys(style).length > 0) {
          const condition = this.createConditionFromVariantName(v.variantName);
          if (condition) {
            dynamic.push({ condition, style });
          }
        }
      }
    }

    return { base, dynamic };
  }

  /**
   * 각 variant에서 parent 대비 child의 상대 좌표를 수집.
   */
  private collectPositionPerVariant(
    parent: InternalNode,
    child: InternalNode
  ): Array<{ variantName: string; left: string; top: string }> {
    if (!child.mergedNodes?.length || !parent.mergedNodes?.length) return [];

    const result: Array<{ variantName: string; left: string; top: string }> = [];

    for (const childMerged of child.mergedNodes) {
      const childVariant = childMerged.variantName;
      if (!childVariant) continue;

      const { node: childOriginal } = this.dataManager.getById(childMerged.id);
      if (!childOriginal) continue;
      const childBounds = (childOriginal as any).absoluteBoundingBox as
        | { x: number; y: number } | undefined;
      if (!childBounds) continue;

      // parent에서 같은 variant의 mergedNode 찾기
      const parentSameVariant = parent.mergedNodes.find(
        (m) => m.variantName === childVariant
      );
      if (!parentSameVariant) continue;

      const { node: parentOriginal } = this.dataManager.getById(parentSameVariant.id);
      if (!parentOriginal) continue;
      const parentBounds = (parentOriginal as any).absoluteBoundingBox as
        | { x: number; y: number } | undefined;
      if (!parentBounds) continue;

      const x = Math.round(childBounds.x - parentBounds.x);
      const y = Math.round(childBounds.y - parentBounds.y);

      result.push({
        variantName: childVariant,
        left: `${x}px`,
        top: `${y}px`,
      });
    }

    return result;
  }

  /**
   * position 스타일 계산 (left, top) — 단일 variant용 fallback
   */
  private calculatePositionStyles(
    parent: InternalNode,
    child: InternalNode
  ): Record<string, string | number> | null {
    const relPos = this.getRelativePositionFromVariant(parent, child);
    if (relPos) {
      return {
        position: "absolute",
        left: `${relPos.x}px`,
        top: `${relPos.y}px`,
      };
    }

    const parentBounds = parent.bounds;
    const childBounds = child.bounds;
    if (!parentBounds || !childBounds) return null;

    return {
      position: "absolute",
      left: `${Math.round(childBounds.x - parentBounds.x)}px`,
      top: `${Math.round(childBounds.y - parentBounds.y)}px`,
    };
  }

  /**
   * child의 첫 번째 mergedNode가 속한 variant에서 parent의 원본 bounds를 찾아
   * 정확한 상대 좌표를 반환한다.
   *
   * variant 병합 후 parent.bounds는 variant 0의 절대 좌표이지만,
   * unmatched child.bounds는 다른 variant의 절대 좌표일 수 있다.
   * 같은 variant 내의 parent bounds를 사용해야 올바른 상대 좌표가 나온다.
   */
  private getRelativePositionFromVariant(
    parent: InternalNode,
    child: InternalNode
  ): { x: number; y: number } | null {
    if (!child.mergedNodes?.[0] || !parent.mergedNodes?.length) return null;

    const childFirst = child.mergedNodes[0];
    const childVariant = childFirst.variantName;
    if (!childVariant) return null;

    // child의 원본 bounds 조회
    const { node: childOriginal } = this.dataManager.getById(childFirst.id);
    if (!childOriginal) return null;
    const childBounds = (childOriginal as any).absoluteBoundingBox as
      | { x: number; y: number } | undefined;
    if (!childBounds) return null;

    // parent에서 같은 variant의 mergedNode 찾기
    const parentSameVariant = parent.mergedNodes.find(
      (m) => m.variantName === childVariant
    );
    if (!parentSameVariant) return null;

    // parent의 같은 variant 원본 bounds 조회
    const { node: parentOriginal } = this.dataManager.getById(parentSameVariant.id);
    if (!parentOriginal) return null;
    const parentBounds = (parentOriginal as any).absoluteBoundingBox as
      | { x: number; y: number } | undefined;
    if (!parentBounds) return null;

    return {
      x: Math.round(childBounds.x - parentBounds.x),
      y: Math.round(childBounds.y - parentBounds.y),
    };
  }

  /**
   * mergedNodes → StyleObject 변환
   */
  private createStyleObject(node: InternalNode): StyleObject | undefined {
    if (!node.mergedNodes || node.mergedNodes.length === 0) {
      return undefined;
    }

    // 각 variant의 스타일 수집
    const variantStyles = this.collectVariantStyles(node.mergedNodes);
    if (variantStyles.length === 0) {
      return undefined;
    }

    // squash prune으로 제거된 wrapper의 레이아웃 오버라이드 적용
    if (node.metadata?.layoutOverrides) {
      for (const vs of variantStyles) {
        const overrides = node.metadata.layoutOverrides[vs.variantName];
        if (overrides) {
          Object.assign(vs.cssStyle, overrides);
        }
      }
    }

    // State 기반 스타일 분리
    const { baseVariants, pseudoVariants } =
      this.separateStateVariants(variantStyles);

    // 비-pseudo state 값이 2개 이상일 때만 state 조건을 포함
    // (1개면 모두 같은 state → 조건 불필요, 2개 이상이면 UITreeOptimizer 오병합 방지)
    const nonPseudoStateValues = new Set<string>();
    for (const v of baseVariants) {
      const state = this.extractStateFromVariantName(v.variantName);
      if (state) nonPseudoStateValues.add(state);
    }
    const includeStateInConditions = nonPseudoStateValues.size > 1;

    // base 스타일 계산 (모든 base variant 공통)
    const base = this.extractCommonStyles(
      baseVariants.map((v) => v.cssStyle)
    );

    // dynamic 스타일 계산
    const dynamic = this.extractDynamicStyles(baseVariants, base, includeStateInConditions);

    // pseudo variant → CSS pseudo-class 스타일로 변환
    // 공통 diff → pseudo에 직접 배치 (범용)
    // 비공통 diff → dynamic에 추가하여 heuristic이 compound pseudo로 처리
    const pseudo = this.extractPseudoStyles(pseudoVariants, base);
    const pseudoNonCommonDynamic = this.extractPseudoNonCommonDynamic(pseudoVariants, base);
    dynamic.push(...pseudoNonCommonDynamic);

    return {
      base,
      dynamic,
      ...(Object.keys(pseudo).length > 0 ? { pseudo } : {}),
    };
  }

  /**
   * mergedNodes의 스타일 수집
   */
  private collectVariantStyles(
    mergedNodes: VariantOrigin[]
  ): Array<{ variantName: string; cssStyle: Record<string, string>; nodeId: string }> {
    const result: Array<{
      variantName: string;
      cssStyle: Record<string, string>;
      nodeId: string;
    }> = [];

    for (const merged of mergedNodes) {
      const { node, style } = this.dataManager.getById(merged.id);
      const cssStyle = style ? { ...style.cssStyle } : {};

      // getCSSAsync가 flex cross-axis "HUG" 치수를 누락하는 경우 bbox에서 보충
      // 단, flex main axis(column→height, row→width)는 자식이 결정하므로 보충하지 않음
      // cssStyle이 비어있어도 bbox에서 width/height를 보충 (INSTANCE 노드 등)
      // layoutSizing이 "HUG"이면 콘텐츠 기반 사이징이므로 고정 크기 보충 스킵
      const bbox = (node as any)?.absoluteBoundingBox;
      const isText = (node as any)?.type === "TEXT";
      const isVector = StyleProcessor.VECTOR_TYPES.has((node as any)?.type);
      const isHugW = (node as any)?.layoutSizingHorizontal === "HUG";
      const isHugH = (node as any)?.layoutSizingVertical === "HUG";
      // VECTOR 타입은 flex 레이아웃에 참여하지 않으므로 cssStyle.flex 가드 무시
      if (bbox && (!cssStyle.flex || isVector)) {
        const isFlex = cssStyle.display?.includes("flex");
        const isColumn = cssStyle["flex-direction"] === "column";
        if (!cssStyle.width && !(isFlex && !isColumn) && !isHugW) {
          cssStyle.width = `${Math.round(bbox.width)}px`;
        }
        if (!cssStyle.height && !(isFlex && isColumn) && !isText && !isHugH) {
          cssStyle.height = `${Math.round(bbox.height)}px`;
        }
      }

      // per-variant 노이즈 정규화: near-zero rotation 등
      this.normalizeCssNoise(cssStyle);

      if (Object.keys(cssStyle).length > 0) {
        result.push({
          variantName: merged.variantName || merged.name,
          cssStyle,
          nodeId: merged.id,
        });
      }
    }

    return result;
  }

  /**
   * per-variant CSS 노이즈 정규화.
   * 개별 variant의 CSS에서 렌더링에 무의미한 값을 제거한다.
   *
   * - near-zero transform: rotate → 부동소수점 노이즈 (Figma TEXT rotation ≈ 0)
   */
  private normalizeCssNoise(cssStyle: Record<string, string>): void {
    if (cssStyle.transform) {
      const match = cssStyle.transform.match(/rotate\(([^)]+)deg\)/);
      if (match) {
        const angle = parseFloat(match[1]);
        if (!isNaN(angle) && Math.abs(angle) < 0.01) {
          const stripped = cssStyle.transform
            .replace(/rotate\([^)]*\)\s*/g, "")
            .trim();
          if (stripped) {
            cssStyle.transform = stripped;
          } else {
            delete cssStyle.transform;
          }
        }
      }
    }
  }

  /**
   * State 기반 variant 분리
   *
   * STATE_TO_PSEUDO에 매칭되는 state variant를 분리한다.
   * 분리된 variant는 base/dynamic 계산에서 제외되어 스타일 왜곡 방지.
   * pseudo-class 생성 여부는 heuristic이 결정한다.
   */
  private separateStateVariants(
    variantStyles: Array<{ variantName: string; cssStyle: Record<string, string> }>
  ): {
    baseVariants: Array<{ variantName: string; cssStyle: Record<string, string> }>;
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>;
  } {
    const baseVariants: Array<{
      variantName: string;
      cssStyle: Record<string, string>;
    }> = [];
    const pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }> = [];

    for (const variant of variantStyles) {
      const state = this.extractStateFromVariantName(variant.variantName);

      if (state && StyleProcessor.EAGER_PSEUDO[state]) {
        pseudoVariants.push({
          ...variant,
          state,
        });
      } else {
        baseVariants.push(variant);
      }
    }

    return { baseVariants, pseudoVariants };
  }

  /**
   * variant 이름에서 State 값 추출
   * "Size=Large, State=Hover, ..." → "Hover"
   */
  private extractStateFromVariantName(variantName: string): string | null {
    const stateMatch = variantName.match(/(?:states?|status)=([^,]+)/i);
    if (!stateMatch) return null;

    const raw = stateMatch[1].trim();

    // "Hover/Pressed" 같은 복합값 → 개별 분리 후 첫 매칭 반환
    if (raw.includes("/")) {
      for (const part of raw.split("/")) {
        const trimmed = part.trim();
        if (StyleProcessor.EAGER_PSEUDO[trimmed]) return trimmed;
      }
    }

    return raw;
  }

  /**
   * 모든 variant에 공통된 스타일 추출
   */
  private extractCommonStyles(
    styles: Array<Record<string, string>>
  ): Record<string, string | number> {
    if (styles.length === 0) return {};
    if (styles.length === 1) return styles[0];

    const common: Record<string, string | number> = {};
    const firstStyle = styles[0];

    for (const [key, value] of Object.entries(firstStyle)) {
      const isCommon = styles.every((style) => style[key] === value);
      if (isCommon) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * 조건부 스타일 추출 (base에 없는 스타일)
   */
  private extractDynamicStyles(
    variantStyles: Array<{ variantName: string; cssStyle: Record<string, string>; nodeId?: string }>,
    base: Record<string, string | number>,
    includeStateInConditions: boolean = false
  ): Array<{ condition: ConditionNode; style: Record<string, string | number>; sourceVariantNodeId?: string }> {
    const dynamic: Array<{
      condition: ConditionNode;
      style: Record<string, string | number>;
      sourceVariantNodeId?: string;
    }> = [];

    for (const variant of variantStyles) {
      const uniqueStyles = this.getDifferentStyles(variant.cssStyle, base);

      if (Object.keys(uniqueStyles).length > 0) {
        const condition = this.createConditionFromVariantName(
          variant.variantName,
          includeStateInConditions
        );
        if (condition) {
          dynamic.push({
            condition,
            style: uniqueStyles,
            ...(variant.nodeId ? { sourceVariantNodeId: variant.nodeId } : {}),
          });
        }
      }
    }

    return dynamic;
  }

  /**
   * base와 다른 스타일만 추출
   */
  private getDifferentStyles(
    cssStyle: Record<string, string>,
    base: Record<string, string | number>
  ): Record<string, string | number> {
    const result: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(cssStyle)) {
      if (base[key] !== value) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * variant 이름 → 조건 노드 생성
   * "Size=Large, Left Icon=True" → { type: 'and', conditions: [...] }
   */
  private createConditionFromVariantName(
    variantName: string,
    includeStateInConditions: boolean = false
  ): ConditionNode | null {
    const props = this.parseVariantName(variantName);
    if (props.length === 0) return null;

    const conditions: ConditionNode[] = [];

    for (const { key, value } of props) {
      if (key.toLowerCase() === "state" || key.toLowerCase() === "states") {
        // state 값은 2개 이상일 때만 조건에 포함
        // (1개면 조건 불필요, 2개 이상이면 UITreeOptimizer 오병합 방지)
        // state→pseudo 변환은 heuristic이 결정한다.
        if (includeStateInConditions) {
          conditions.push(this.createCondition(key, value));
        }
        continue;
      }

      conditions.push(this.createCondition(key, value));
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];

    return { type: "and", conditions };
  }

  /**
   * variant 이름 파싱
   * "Size=Large, Left Icon=True" → [{key: "Size", value: "Large"}, ...]
   */
  private parseVariantName(
    variantName: string
  ): Array<{ key: string; value: string }> {
    const result: Array<{ key: string; value: string }> = [];
    const parts = variantName.split(",");

    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result.push({ key, value });
      }
    }

    return result;
  }

  /**
   * prop 조건 노드 생성
   */
  private createCondition(key: string, value: string): ConditionNode {
    // camelCase로 변환
    const propName = this.normalizePropName(key);

    // Boolean 값 처리
    if (value.toLowerCase() === "true") {
      return { type: "truthy", prop: propName };
    }
    if (value.toLowerCase() === "false") {
      return { type: "not", condition: { type: "truthy", prop: propName } };
    }

    // 일반 값
    return { type: "eq", prop: propName, value };
  }

  /**
   * Prop 이름 정규화 (PropsExtractor와 동일한 로직)
   */
  private normalizePropName(key: string): string {
    // 비 ASCII/특수문자를 공백으로 변환 (슬래시, dot 등 JS 식별자 불가 문자)
    const cleaned = key.replace(/[^a-zA-Z0-9\s]/g, " ").trim();

    let propName = cleaned
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        if (index === 0) {
          return word.charAt(0).toLowerCase() + word.slice(1);
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join("");

    if (!propName) propName = "prop";

    // NOTE: Native HTML prop 충돌 rename은 Layer 3(ReactEmitter)에서 처리
    return propName;
  }

  /**
   * pseudo variant → CSS pseudo-class 스타일 변환
   *
   * STATE_TO_PSEUDO 매핑을 사용하여 Hover→:hover, Disabled→:disabled 등
   * CSS pseudo-class 스타일 객체를 생성한다.
   * 같은 state 값의 모든 variant에서 base 대비 공통 diff만 추출.
   */
  private extractPseudoStyles(
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>,
    base: Record<string, string | number>
  ): Record<string, Record<string, string | number>> {
    const result: Record<string, Record<string, string | number>> = {};

    // state 값별 그룹핑
    const stateGroups = new Map<string, Array<Record<string, string>>>();
    for (const variant of pseudoVariants) {
      if (!stateGroups.has(variant.state)) {
        stateGroups.set(variant.state, []);
      }
      stateGroups.get(variant.state)!.push(variant.cssStyle);
    }

    for (const [stateValue, cssList] of stateGroups) {
      const pseudoClass = StyleProcessor.STATE_TO_PSEUDO[stateValue];
      if (!pseudoClass) continue;

      const diffs = cssList.map((css) => this.getDifferentStyles(css, base));
      const commonDiff = this.extractCommonStyles(diffs as Array<Record<string, string>>);

      if (Object.keys(commonDiff).length > 0) {
        result[pseudoClass] = { ...result[pseudoClass], ...commonDiff };
      }
    }

    return result;
  }

  /**
   * pseudo variant → state 조건 dynamic 엔트리 변환
   *
   * 같은 state 값을 가진 모든 variant의 스타일에서:
   * 1. base와의 diff 계산
   * 2. 모든 variant에 공통인 diff만 추출 (customType/size로 달라지는 속성 제외)
   * 3. state 조건 (eq(states, "hover") 등) dynamic 엔트리 생성
   */
  private extractStateDynamicEntries(
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>,
    base: Record<string, string | number>
  ): Array<{ condition: ConditionNode; style: Record<string, string | number> }> {
    // state 값별 그룹핑 (variant 이름도 보존)
    const stateGroups = new Map<string, Array<{variantName: string; cssStyle: Record<string, string>}>>();
    const stateKeys = new Map<string, string>();

    for (const variant of pseudoVariants) {
      if (!stateGroups.has(variant.state)) {
        stateGroups.set(variant.state, []);
      }
      stateGroups.get(variant.state)!.push({
        variantName: variant.variantName,
        cssStyle: variant.cssStyle,
      });

      if (!stateKeys.has(variant.state)) {
        const match = variant.variantName.match(/(State|states)\s*=/i);
        if (match) stateKeys.set(variant.state, match[1]);
      }
    }

    const result: Array<{ condition: ConditionNode; style: Record<string, string | number> }> = [];

    for (const [stateValue, variants] of stateGroups) {
      const diffs = variants.map((v) => this.getDifferentStyles(v.cssStyle, base));

      const commonDiff = this.extractCommonStyles(
        diffs as Array<Record<string, string>>
      );

      // 공통 diff → 단일 state 조건 엔트리
      if (Object.keys(commonDiff).length > 0) {
        const propKey = stateKeys.get(stateValue) || "states";
        const condition = this.createCondition(propKey, stateValue);
        result.push({ condition, style: commonDiff });
      }

      // 비공통 diff → per-variant 엔트리 (compound-varying CSS 보존)
      // tone/style에 따라 다른 background 등이 여기에 해당
      for (let i = 0; i < variants.length; i++) {
        const diff = diffs[i];
        const nonCommonDiff: Record<string, string | number> = {};
        for (const [key, val] of Object.entries(diff)) {
          if (!(key in commonDiff)) {
            nonCommonDiff[key] = val;
          }
        }
        if (Object.keys(nonCommonDiff).length === 0) continue;

        const condition = this.createConditionFromVariantName(
          variants[i].variantName,
          true // state 조건 포함
        );
        if (condition) {
          result.push({ condition, style: nonCommonDiff });
        }
      }
    }

    return result;
  }

  /**
   * pseudo variant의 비공통 diff만 dynamic 엔트리로 변환
   *
   * extractPseudoStyles가 공통 diff → pseudo에 배치한 뒤,
   * 남은 비공통 diff(style+tone에 따라 다른 hover background 등)를
   * per-variant AND 조건 엔트리로 생성하여 heuristic이 compound pseudo로 처리하도록 위임.
   */
  private extractPseudoNonCommonDynamic(
    pseudoVariants: Array<{
      variantName: string;
      state: string;
      cssStyle: Record<string, string>;
    }>,
    base: Record<string, string | number>
  ): Array<{ condition: ConditionNode; style: Record<string, string | number> }> {
    const stateGroups = new Map<string, Array<{variantName: string; cssStyle: Record<string, string>}>>();

    for (const variant of pseudoVariants) {
      if (!stateGroups.has(variant.state)) {
        stateGroups.set(variant.state, []);
      }
      stateGroups.get(variant.state)!.push({
        variantName: variant.variantName,
        cssStyle: variant.cssStyle,
      });
    }

    const result: Array<{ condition: ConditionNode; style: Record<string, string | number> }> = [];

    for (const [, variants] of stateGroups) {
      const diffs = variants.map((v) => this.getDifferentStyles(v.cssStyle, base));
      const commonDiff = this.extractCommonStyles(
        diffs as Array<Record<string, string>>
      );

      // 비공통 diff만 per-variant 엔트리로 생성
      for (let i = 0; i < variants.length; i++) {
        const diff = diffs[i];
        const nonCommonDiff: Record<string, string | number> = {};
        for (const [key, val] of Object.entries(diff)) {
          if (!(key in commonDiff)) {
            nonCommonDiff[key] = val;
          }
        }
        if (Object.keys(nonCommonDiff).length === 0) continue;

        const condition = this.createConditionFromVariantName(
          variants[i].variantName,
          true // state 조건 포함
        );
        if (condition) {
          result.push({ condition, style: nonCommonDiff });
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // vector fill → currentColor 변환
  // ===========================================================================

  /**
   * 동적 fill 스타일이 있는 vector 노드의 SVG fill을 currentColor로 변환 (재귀)
   *
  /**
   * branch 진입 시 노드와 하위 트리의 mergedNodes를 필터링.
   * branchProp=value에 해당하는 variant만 남긴다.
   * 이렇게 하면 DynamicStyleDecomposer가 고정된 prop을 변수로 보지 않는다.
   */
  private filterMergedNodesForBranch(
    node: InternalNode,
    branchProp: string,
    branchValue: string,
  ): InternalNode {
    const normKey = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
    const branchPropNorm = normKey(branchProp);
    const branchValueNorm = normKey(branchValue);

    const filterVariants = (mergedNodes: typeof node.mergedNodes) => {
      if (!mergedNodes) return mergedNodes;
      const filtered = mergedNodes.filter((m) => {
        const vn = m.variantName || "";
        for (const part of vn.split(",").map((s) => s.trim())) {
          const eq = part.indexOf("=");
          if (eq < 0) continue;
          const key = part.slice(0, eq).trim();
          const val = part.slice(eq + 1).trim();
          if (normKey(key) === branchPropNorm) {
            return normKey(val) === branchValueNorm;
          }
        }
        return true; // prop이 없으면 포함
      });
      return filtered.length > 0 ? filtered : mergedNodes;
    };

    const walk = (n: InternalNode): InternalNode => {
      const mergedNodes = filterVariants(n.mergedNodes);
      const children = n.children.map(walk);
      const branches = n.branches
        ? Object.fromEntries(
            Object.entries(n.branches).map(([k, v]) => [k, v.map(walk)])
          )
        : undefined;
      return {
        ...n,
        mergedNodes,
        children,
        ...(branches ? { branches } : {}),
      };
    };

    return walk(node);
  }

  /**
   * variant별로 fill 색상이 다른 ELLIPSE/VECTOR 노드에서:
   * - SVG 내부 fill="..." → fill="currentColor"
   * - CSS fill → color (currentColor가 color를 상속)
   */
  private normalizeVectorFills(node: InternalNode): InternalNode {
    let currentNode = node;

    if (StyleProcessor.VECTOR_TYPES.has(node.type) && node.styles?.dynamic) {
      const hasDynamicFill = node.styles.dynamic.some(
        (d) => "fill" in d.style
      );

      // SVG를 metadata 또는 DataManager에서 가져오기
      const originalSvg = node.metadata?.vectorSvg
        || this.dataManager.getVectorSvgByNodeId(node.id)
        || this.dataManager.getVectorSvgByLastSegment(node.id);

      if (hasDynamicFill && originalSvg) {
        // SVG fill → currentColor
        const fillPattern = /fill="(#[0-9A-Fa-f]{3,8})"/g;
        const normalizedSvg = originalSvg.replace(
          fillPattern,
          'fill="currentColor"'
        );

        // CSS fill → color
        const normalizedDynamic = node.styles.dynamic.map((d) => {
          if (!("fill" in d.style)) return d;
          const { fill, ...rest } = d.style;
          return { ...d, style: { ...rest, color: fill } };
        });

        currentNode = {
          ...node,
          metadata: { ...(node.metadata || {}), vectorSvg: normalizedSvg },
          styles: { ...node.styles, dynamic: normalizedDynamic },
        };
      }
    }

    const newChildren = currentNode.children.map((child) =>
      this.normalizeVectorFills(child)
    );

    // CONDITIONAL_GROUP branches 재귀 처리
    let newBranches = currentNode.branches;
    if (currentNode.branches) {
      newBranches = {};
      for (const [value, children] of Object.entries(currentNode.branches)) {
        newBranches[value] = children.map((child) =>
          this.normalizeVectorFills(child)
        );
      }
    }

    return { ...currentNode, children: newChildren, ...(newBranches ? { branches: newBranches } : {}) };
  }

  // ===========================================================================
  // itemVariant 스타일 (loop 컨텍스트에서만 호출)
  // ===========================================================================

  /**
   * loop 컨테이너의 템플릿 노드에 itemVariant 스타일 적용
   *
   * 노드의 원본 INSTANCE componentId를 조회하여
   * dependency COMPONENT_SET의 boolean variant 스타일 차이를 추출
   *
   * TreeBuilder에서 loop 설정 후 호출
   */
  public applyLoopItemVariant(node: InternalNode): InternalNode | null {
    const { node: figmaNode } = this.dataManager.getById(node.id);
    const componentId = (figmaNode as any)?.componentId as string | undefined;
    if (!componentId) return null;

    const currentDep = this.dataManager.getAllDependencies().get(componentId);
    if (!currentDep) return null;
    const componentSetId = ((currentDep.info as any).components?.[componentId] as any)?.componentSetId;
    if (!componentSetId) return null;

    // COMPONENT_SET의 boolean variant 속성 찾기
    const booleanProp = this.findBooleanVariantProp(componentSetId);
    if (!booleanProp) return null;

    const currentName = currentDep.info?.document?.name as string | undefined;
    if (!currentName) return null;
    const currentProps = this.parseItemVariantProps(currentName);
    const currentValue = currentProps[booleanProp];
    if (!currentValue) return null;

    // 반대 variant 찾기
    const oppositeDep = this.findOppositeVariant(componentId, componentSetId, booleanProp, currentProps);
    if (!oppositeDep) return null;

    const currentStyleTree = currentDep.styleTree;
    const oppositeStyleTree = oppositeDep.styleTree;
    if (!currentStyleTree || !oppositeStyleTree) return null;

    // 매핑: boolean variant에서 "false" 값 = 선택됨/강조 상태 (isActive=true)
    // Figma에서 Selected/Active=false는 강조된 1개 탭, true는 나머지 비선택 탭
    const isCurrentFalse = currentValue.toLowerCase() === "false";
    const activeStyleTree = isCurrentFalse ? currentStyleTree : oppositeStyleTree;
    const inactiveStyleTree = isCurrentFalse ? oppositeStyleTree : currentStyleTree;

    // root 스타일 diff
    const rootVariant = this.computeItemVariantDiff(
      inactiveStyleTree.cssStyle || {},
      activeStyleTree.cssStyle || {}
    );

    let styles = node.styles;
    if (rootVariant) {
      if (!styles) styles = { base: {}, dynamic: [] };
      styles = { ...styles, itemVariant: rootVariant };
    }

    // children 스타일 diff (TEXT 노드 등)
    const updatedChildren = this.applyChildItemVariantDiff(
      node.children,
      inactiveStyleTree.children || [],
      activeStyleTree.children || []
    );

    if (!rootVariant && updatedChildren === node.children) return null;

    return { ...node, styles, children: updatedChildren };
  }

  /**
   * COMPONENT_SET에서 boolean variant 속성 찾기 (true/false 값 쌍)
   */
  private findBooleanVariantProp(componentSetId: string): string | null {
    const grouped = this.dataManager.getDependenciesGroupedByComponentSet();
    const group = grouped[componentSetId];
    if (!group || group.variants.length < 2) return null;

    const allProps: Array<Record<string, string>> = [];
    for (const variant of group.variants) {
      const name = variant.info?.document?.name as string | undefined;
      if (!name) continue;
      allProps.push(this.parseItemVariantProps(name));
    }
    if (allProps.length === 0) return null;

    for (const propName of Object.keys(allProps[0])) {
      const distinctValues = new Set(allProps.map((p) => p[propName]));
      if (distinctValues.size === 2) {
        const vals = [...distinctValues].map((v) => v.toLowerCase());
        if (vals.includes("true") && vals.includes("false")) {
          return propName;
        }
      }
    }
    return null;
  }

  /**
   * 반대 variant 찾기 (boolean prop만 다르고 나머지 동일)
   */
  private findOppositeVariant(
    currentComponentId: string,
    componentSetId: string,
    booleanProp: string,
    currentProps: Record<string, string>
  ): any | null {
    const deps = this.dataManager.getAllDependencies();
    for (const [depId, depData] of deps) {
      if (depId === currentComponentId) continue;
      const depSetId = ((depData.info as any).components?.[depId] as any)?.componentSetId;
      if (depSetId !== componentSetId) continue;

      const depName = depData.info?.document?.name as string | undefined;
      if (!depName) continue;
      const depProps = this.parseItemVariantProps(depName);

      if (depProps[booleanProp] === currentProps[booleanProp]) continue;

      let allOthersMatch = true;
      for (const key of Object.keys(currentProps)) {
        if (key === booleanProp) continue;
        if (depProps[key] !== currentProps[key]) { allOthersMatch = false; break; }
      }
      if (allOthersMatch) return depData;
    }
    return null;
  }

  /**
   * 두 CSS의 차이 → { true, false } 스타일 객체
   */
  private computeItemVariantDiff(
    falseCss: Record<string, string>,
    trueCss: Record<string, string>
  ): { true: Record<string, string | number>; false: Record<string, string | number> } | null {
    const allKeys = new Set([...Object.keys(falseCss), ...Object.keys(trueCss)]);
    const falseStyle: Record<string, string> = {};
    const trueStyle: Record<string, string> = {};

    for (const key of allKeys) {
      if (falseCss[key] === trueCss[key]) continue;
      falseStyle[key] = falseCss[key] || this.getItemVariantResetValue(key);
      trueStyle[key] = trueCss[key] || this.getItemVariantResetValue(key);
    }

    if (Object.keys(trueStyle).length === 0) return null;

    return { true: trueStyle, false: falseStyle };
  }

  private getItemVariantResetValue(prop: string): string {
    if (prop === "background") return "transparent";
    if (prop === "box-shadow") return "none";
    return "initial";
  }

  /**
   * children의 itemVariant 스타일 diff 적용 (재귀)
   */
  private applyChildItemVariantDiff(
    children: InternalNode[],
    falseStyleChildren: any[],
    trueStyleChildren: any[]
  ): InternalNode[] {
    let changed = false;
    const result = children.map((child, idx) => {
      const falseChild = falseStyleChildren[idx];
      const trueChild = trueStyleChildren[idx];
      if (!falseChild && !trueChild) return child;

      const variant = this.computeItemVariantDiff(
        falseChild?.cssStyle || {},
        trueChild?.cssStyle || {}
      );

      let updatedChild = child;
      if (variant) {
        changed = true;
        let styles = child.styles;
        if (!styles) styles = { base: {}, dynamic: [] };
        styles = { ...styles, itemVariant: variant };
        updatedChild = { ...child, styles };
      }

      if (updatedChild.children.length > 0) {
        const deepChildren = this.applyChildItemVariantDiff(
          updatedChild.children,
          falseChild?.children || [],
          trueChild?.children || []
        );
        if (deepChildren !== updatedChild.children) {
          changed = true;
          updatedChild = { ...updatedChild, children: deepChildren };
        }
      }

      return updatedChild;
    });

    return changed ? result : children;
  }

  /**
   * variant 이름 파싱
   */
  private parseItemVariantProps(name: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const part of name.split(", ")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx !== -1) {
        result[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
      }
    }
    return result;
  }

  /**
   * 스타일에 border 관련 속성이 있는지 확인 (base + dynamic)
   */
  private hasBorderInStyles(styles: StyleObject): boolean {
    const hasBorder = (obj: Record<string, any>): boolean =>
      Object.keys(obj).some(k =>
        k === "border" ||
        k === "border-width" || k === "border-color" || k === "border-style" ||
        k === "border-top" || k === "border-right" || k === "border-bottom" || k === "border-left" ||
        k === "borderWidth" || k === "borderColor" || k === "borderStyle"
      );
    if (styles.base && hasBorder(styles.base)) return true;
    if (styles.dynamic) {
      for (const entry of styles.dynamic) {
        if (hasBorder(entry.style)) return true;
      }
    }
    return false;
  }

  /**
   * 노드의 strokeAlign 조회 (DataManager 경유)
   */
  private getStrokeAlign(node: InternalNode): string | undefined {
    const { node: sceneNode } = this.dataManager.getById(node.id);
    if (sceneNode) {
      const align = (sceneNode as any).strokeAlign;
      if (align) return align;
    }
    if (node.mergedNodes?.length) {
      for (const merged of node.mergedNodes) {
        const { node: mergedScene } = this.dataManager.getById(merged.id);
        if (mergedScene) {
          const align = (mergedScene as any).strokeAlign;
          if (align) return align;
        }
      }
    }
    return undefined;
  }
}
