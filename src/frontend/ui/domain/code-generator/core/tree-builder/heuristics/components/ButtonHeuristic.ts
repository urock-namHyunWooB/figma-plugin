/**
 * ButtonHeuristic
 *
 * 버튼 컴포넌트 휴리스틱.
 *
 * 판별 기준 (canProcess):
 * 1. 이름 패턴: button, btn, cta
 * 2. State prop에 Pressed/Active가 있음
 * 3. State prop에 Selected + Hover + Disabled 조합이 있음 (Toggle/Select Button)
 * 4. 시각적 특성:
 *    - 사각형 형태 (직사각형/정사각형)
 *    - 적절한 크기 (높이 24~64px)
 *    - 배경색 또는 테두리 존재
 *    - 짧은 텍스트(1~4단어) 또는 아이콘 포함
 *    - 콘텐츠 중앙 정렬
 *
 * 버튼 특화 처리:
 * - 아이콘(INSTANCE/VECTOR)의 fill 색상을 CSS color로 변환
 * - State에 따른 아이콘 색상 변화 지원
 */

import type { BuildContext } from "../../workers/BuildContext";
import type { InternalNode } from "../../workers/VariantProcessor";
import { GenericHeuristic } from "./GenericHeuristic";
import { StyleProcessor } from "../../workers/StyleProcessor";
import { traverseTree } from "../../workers/utils/treeUtils";

export class ButtonHeuristic extends GenericHeuristic {
  readonly componentType = "button" as const;
  readonly name = "ButtonHeuristic";

  /** 매칭 임계점 */
  private static readonly MATCH_THRESHOLD = 10;

  /**
   * Button 컴포넌트 매칭 점수 계산
   *
   * 점수 기준:
   * - 이름 패턴: button, btn, cta → +10
   * - primary, secondary 등 수식어 → +3
   * - State prop에 Pressed/Active → +10 (버튼 고유 특징)
   * - State prop에 Selected + Hover + Disabled → +10 (Toggle/Select Button)
   * - 시각적 특성 (최대 +10):
   *   - 적절한 높이 (24~64px) → +2
   *   - 적절한 가로세로 비율 (1:1 ~ 6:1) → +2
   *   - 배경색 또는 테두리 존재 → +3
   *   - 짧은 텍스트 또는 아이콘 포함 → +2
   *   - 중앙 정렬 → +1
   */
  score(ctx: BuildContext): number {
    let score = 0;
    const name = ctx.data.document.name;
    const doc = ctx.data.document as any;

    // 이름 패턴 매칭
    if (/button/i.test(name)) score += 10;
    if (/^btn$/i.test(name)) score += 10;
    if (/^cta$/i.test(name)) score += 10;

    // 버튼 수식어 가산점
    if (/primary/i.test(name)) score += 3;
    if (/secondary/i.test(name)) score += 3;
    if (/tertiary/i.test(name)) score += 3;

    // State prop 기반 매칭
    const stateOptions = this.getStateVariantOptions(ctx);
    if (stateOptions.length > 0) {
      const normalizedOptions = stateOptions.map((s) => s.toLowerCase());

      // Pressed/Active가 있으면 버튼 (버튼 고유 특징)
      if (normalizedOptions.some((s) => s === "pressed" || s === "active")) {
        score += 10;
      }

      // Selected + Hover + Disabled 조합 → Toggle/Select Button
      const hasSelected = normalizedOptions.some((s) => s.includes("selected"));
      const hasHover = normalizedOptions.some(
        (s) => s === "hover" || s === "hovered"
      );
      const hasDisabled = normalizedOptions.some((s) => s.includes("disabled"));

      if (hasSelected && hasHover && hasDisabled) {
        score += 10;
      }
    }

    // ========================================
    // 시각적 특성 기반 점수 (최대 +10)
    // ========================================
    score += this.calculateVisualScore(doc);

    return score;
  }

  /**
   * 시각적 특성 기반 점수 계산
   *
   * NOTE: ctx.data.document는 COMPONENT_SET이므로,
   * 실제 버튼의 시각적 특성은 첫 번째 variant(COMPONENT)에서 확인해야 함.
   */
  private calculateVisualScore(doc: any): number {
    // COMPONENT_SET의 첫 번째 variant를 대표로 사용
    const firstVariant = this.getFirstVariant(doc);
    if (!firstVariant) return 0;

    let visualScore = 0;

    // 1. 적절한 높이 (24~64px) → +2
    if (this.hasProperHeight(firstVariant)) {
      visualScore += 2;
    }

    // 2. 적절한 가로세로 비율 (정사각형 ~ 6:1) → +2
    if (this.hasProperAspectRatio(firstVariant)) {
      visualScore += 2;
    }

    // 3. 배경색 또는 테두리 존재 → +3
    if (this.hasFillOrBorder(firstVariant)) {
      visualScore += 3;
    }

    // 4. 짧은 텍스트 또는 아이콘 포함 → +2
    if (this.hasShortTextOrIcon(firstVariant)) {
      visualScore += 2;
    }

    // 5. 중앙 정렬 → +1
    if (this.isCenterAligned(firstVariant)) {
      visualScore += 1;
    }

    return visualScore;
  }

  /**
   * COMPONENT_SET에서 첫 번째 variant(COMPONENT) 가져오기
   */
  private getFirstVariant(doc: any): any {
    // COMPONENT_SET인 경우 첫 번째 children
    if (doc.type === "COMPONENT_SET" && doc.children?.length > 0) {
      return doc.children[0];
    }
    // 이미 COMPONENT인 경우 그대로 반환
    if (doc.type === "COMPONENT") {
      return doc;
    }
    // 그 외 (FRAME 등)도 그대로 반환
    return doc;
  }

  /**
   * 적절한 높이인지 확인 (24~64px)
   */
  private hasProperHeight(doc: any): boolean {
    const height = doc.absoluteBoundingBox?.height;
    if (!height) return false;
    return height >= 24 && height <= 64;
  }

  /**
   * 적절한 가로세로 비율인지 확인 (1:1 ~ 6:1)
   */
  private hasProperAspectRatio(doc: any): boolean {
    const box = doc.absoluteBoundingBox;
    if (!box || !box.width || !box.height) return false;

    const ratio = box.width / box.height;
    // 정사각형(1:1)부터 가로로 긴 버튼(6:1)까지 허용
    return ratio >= 1 && ratio <= 6;
  }

  /**
   * 배경색 또는 테두리가 있는지 확인
   */
  private hasFillOrBorder(doc: any): boolean {
    // 배경색 확인 (fills)
    const fills = doc.fills;
    if (fills && Array.isArray(fills)) {
      const hasVisibleFill = fills.some(
        (fill: any) => fill.visible !== false && fill.type === "SOLID"
      );
      if (hasVisibleFill) return true;
    }

    // 테두리 확인 (strokes)
    const strokes = doc.strokes;
    if (strokes && Array.isArray(strokes)) {
      const hasVisibleStroke = strokes.some(
        (stroke: any) => stroke.visible !== false
      );
      if (hasVisibleStroke) return true;
    }

    return false;
  }

  /**
   * 짧은 텍스트(1~4단어) 또는 아이콘이 있는지 확인
   *
   * @param variant - COMPONENT 노드 (variant)
   */
  private hasShortTextOrIcon(variant: any): boolean {
    const children = variant.children;
    if (!children || !Array.isArray(children)) return false;

    let hasShortText = false;
    let hasIcon = false;

    const checkNode = (node: any): void => {
      // 텍스트 노드 확인
      if (node.type === "TEXT") {
        const text = node.characters || "";
        const wordCount = text.trim().split(/\s+/).length;
        // 1~4 단어 또는 20자 이하
        if (wordCount <= 4 || text.length <= 20) {
          hasShortText = true;
        }
      }

      // 아이콘 확인 (INSTANCE, VECTOR, 또는 작은 이미지)
      if (node.type === "INSTANCE" || node.type === "VECTOR") {
        const box = node.absoluteBoundingBox;
        if (box && box.width <= 32 && box.height <= 32) {
          hasIcon = true;
        }
      }

      // 재귀적으로 자식 탐색
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          checkNode(child);
        }
      }
    };

    for (const child of children) {
      checkNode(child);
    }

    return hasShortText || hasIcon;
  }

  /**
   * 콘텐츠가 중앙 정렬인지 확인
   */
  private isCenterAligned(doc: any): boolean {
    // Auto Layout 사용 시
    if (doc.layoutMode === "HORIZONTAL" || doc.layoutMode === "VERTICAL") {
      // primaryAxisAlignItems가 CENTER이거나
      // counterAxisAlignItems가 CENTER인 경우
      const primaryAlign = doc.primaryAxisAlignItems;
      const counterAlign = doc.counterAxisAlignItems;

      return primaryAlign === "CENTER" || counterAlign === "CENTER";
    }

    // Auto Layout이 아닌 경우, 자식이 중앙에 위치하는지 확인
    const children = doc.children;
    const parentBox = doc.absoluteBoundingBox;

    if (!children || !parentBox || children.length === 0) return false;

    // 첫 번째 자식의 위치로 중앙 정렬 여부 추정
    const firstChild = children[0];
    const childBox = firstChild?.absoluteBoundingBox;

    if (!childBox) return false;

    // 부모 중앙과 자식 중앙의 차이 계산
    const parentCenterX = parentBox.x + parentBox.width / 2;
    const childCenterX = childBox.x + childBox.width / 2;
    const tolerance = parentBox.width * 0.1; // 10% 허용 오차

    return Math.abs(parentCenterX - childCenterX) <= tolerance;
  }

  canProcess(ctx: BuildContext): boolean {
    return this.score(ctx) >= ButtonHeuristic.MATCH_THRESHOLD;
  }

  /**
   * State prop의 variantOptions 추출
   */
  private getStateVariantOptions(ctx: BuildContext): string[] {
    const doc = ctx.data.document as {
      componentPropertyDefinitions?: Record<
        string,
        { type?: string; variantOptions?: string[] }
      >;
    };

    const propDefs = doc.componentPropertyDefinitions;
    if (!propDefs) return [];

    // "State" prop 찾기 (대소문자 무시)
    for (const [key, def] of Object.entries(propDefs)) {
      if (key.toLowerCase() === "state" && def.type === "VARIANT") {
        return def.variantOptions || [];
      }
    }

    return [];
  }

  /**
   * 버튼 스타일 처리 (override)
   *
   * 1. 부모의 스타일 처리 실행
   * 2. 아이콘의 fill 색상을 루트 노드의 CSS color로 추가
   */
  processStyles(ctx: BuildContext): BuildContext {
    // 1. 부모의 스타일 처리
    let result = StyleProcessor.build(ctx);

    // 2. 아이콘 fill 색상을 CSS color로 변환
    result = this.addIconColorStyles(result);

    return result;
  }

  /**
   * 아이콘(INSTANCE/VECTOR)의 fill 색상을 루트 노드의 CSS color로 추가
   *
   * - 버튼 내 첫 번째 아이콘 노드를 찾음
   * - 각 variant별 fill 색상을 추출
   * - State별로 다른 색상이 있으면 루트의 dynamic 스타일에 color 추가
   */
  private addIconColorStyles(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree || !ctx.nodeStyles) return ctx;

    // 아이콘 노드 찾기 (INSTANCE 또는 VECTOR)
    const iconNode = this.findIconNode(ctx.internalTree);
    if (!iconNode || iconNode.mergedNode.length === 0) return ctx;

    // 각 variant별 fill 색상 추출
    const variantColors = this.extractVariantFillColors(iconNode, ctx);
    if (variantColors.size === 0) return ctx;

    // 모든 variant의 색상이 같으면 base에 추가, 다르면 dynamic에 추가
    const uniqueColors = new Set(variantColors.values());
    const rootId = ctx.internalTree.id;
    const rootStyles = ctx.nodeStyles.get(rootId) || { base: {}, dynamic: [] };

    const newNodeStyles = new Map(ctx.nodeStyles);

    if (uniqueColors.size === 1) {
      // 단일 색상 → base에 추가
      const color = [...uniqueColors][0];
      newNodeStyles.set(rootId, {
        ...rootStyles,
        base: { ...rootStyles.base, color },
      });
    } else {
      // State별 색상 맵 생성 (중복 제거)
      const stateColorMap = new Map<string, string>();
      for (const [variantName, color] of variantColors) {
        const stateMatch = variantName.match(/State=([^,]+)/i);
        if (stateMatch) {
          const state = stateMatch[1].trim();
          stateColorMap.set(state, color);
        }
      }

      // State를 pseudo-class/base/dynamic으로 분류
      const newDynamic = [...(rootStyles.dynamic || [])];
      const newPseudo = { ...(rootStyles.pseudo || {}) };
      let newBase = { ...rootStyles.base };
      const processedStates = new Set<string>();

      // Default 색상은 항상 base에 추가 (기본 상태)
      const defaultColor =
        stateColorMap.get("Default") || stateColorMap.get("default");
      if (defaultColor) {
        newBase = { ...newBase, color: defaultColor };
      }

      // 기존 dynamic 업데이트 (같은 State를 가진 모든 엔트리에 color 추가)
      for (let i = 0; i < newDynamic.length; i++) {
        const stateInCondition = this.extractStateFromCondition(
          newDynamic[i].condition
        );
        if (stateInCondition && stateColorMap.has(stateInCondition)) {
          const color = stateColorMap.get(stateInCondition)!;
          newDynamic[i] = {
            ...newDynamic[i],
            style: { ...newDynamic[i].style, color },
          };
          processedStates.add(stateInCondition);
        }
      }

      // 기존 dynamic에 없는 State 처리
      for (const [state, color] of stateColorMap) {
        if (processedStates.has(state)) continue;

        // Default는 이미 base에 추가됨
        const lowerState = state.toLowerCase();
        if (lowerState === "default" || lowerState === "normal") continue;

        const pseudoClass = this.stateToPseudo(state);
        if (pseudoClass) {
          // Hover, Active 등 → CSS pseudo-class
          newPseudo[pseudoClass] = { ...(newPseudo[pseudoClass] || {}), color };
        } else {
          // Selected, Selected disabled 등 → dynamic (prop 제어)
          const condition = this.createStateConditionFromState(state);
          if (condition) {
            newDynamic.push({ condition, style: { color } });
          }
        }
      }

      newNodeStyles.set(rootId, {
        ...rootStyles,
        base: newBase,
        dynamic: newDynamic,
        ...(Object.keys(newPseudo).length > 0 ? { pseudo: newPseudo } : {}),
      });
    }

    return { ...ctx, nodeStyles: newNodeStyles };
  }

  /**
   * condition에서 State 값 추출
   */
  private extractStateFromCondition(condition: any): string | null {
    if (!condition) return null;

    if (condition.type === "BinaryExpression") {
      if (condition.left?.property?.name === "state") {
        return condition.right?.value;
      }
    }

    if (condition.type === "LogicalExpression") {
      return (
        this.extractStateFromCondition(condition.left) ||
        this.extractStateFromCondition(condition.right)
      );
    }

    return null;
  }

  /**
   * State 값으로 조건 생성
   */
  private createStateConditionFromState(state: string): any {
    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { name: "props" },
        property: { name: "state" },
      },
      right: {
        type: "Literal",
        value: state,
      },
    };
  }

  /**
   * 버튼 내 첫 번째 아이콘 노드 찾기
   */
  private findIconNode(root: InternalNode): InternalNode | null {
    let iconNode: InternalNode | null = null;

    traverseTree(root, (node) => {
      if (iconNode) return; // 이미 찾았으면 중단

      // INSTANCE 또는 VECTOR 타입
      if (node.type === "INSTANCE" || node.type === "VECTOR") {
        // 루트가 아닌 경우에만
        if (node.id !== root.id) {
          iconNode = node;
        }
      }
    });

    return iconNode;
  }

  /**
   * 각 variant별 fill 색상 추출
   */
  private extractVariantFillColors(
    iconNode: InternalNode,
    ctx: BuildContext
  ): Map<string, string> {
    const variantColors = new Map<string, string>();

    for (const merged of iconNode.mergedNode) {
      const variantName = merged.variantName;
      if (!variantName) continue;

      // 노드 스펙에서 fills 가져오기
      const nodeSpec = ctx.data.getNodeById(merged.id);
      if (!nodeSpec) continue;

      // INSTANCE인 경우 내부 VECTOR의 fills 찾기
      const fills = this.getFillsFromNode(nodeSpec, ctx);
      const color = this.extractColorFromFills(fills);

      if (color) {
        variantColors.set(variantName, color);
      }
    }

    return variantColors;
  }

  /**
   * 노드에서 fills 가져오기 (INSTANCE인 경우 내부 VECTOR 탐색)
   */
  private getFillsFromNode(node: any, ctx: BuildContext): any[] {
    // VECTOR/RECTANGLE 등 직접 fills가 있는 경우
    if (node.fills && node.fills.length > 0) {
      return node.fills;
    }

    // INSTANCE인 경우 children에서 VECTOR 찾기
    if (node.type === "INSTANCE" && node.children) {
      for (const child of node.children) {
        if (child.fills && child.fills.length > 0) {
          return child.fills;
        }
      }
    }

    return [];
  }

  /**
   * fills 배열에서 색상 추출
   */
  private extractColorFromFills(fills: any[]): string | null {
    if (!fills || fills.length === 0) return null;

    const fill = fills[0];
    if (fill.type !== "SOLID" || !fill.color) return null;

    const { r, g, b } = fill.color;
    const toHex = (n: number) =>
      Math.round(n * 255)
        .toString(16)
        .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * variant 이름에서 State 조건 생성
   */
  private createStateCondition(variantName: string): any {
    // "Size=Large, State=Default, Position=Left" → State=Default 추출
    const stateMatch = variantName.match(/State=([^,]+)/i);
    if (!stateMatch) return null;

    const stateValue = stateMatch[1].trim();

    return {
      type: "BinaryExpression",
      operator: "===",
      left: {
        type: "MemberExpression",
        object: { name: "props" },
        property: { name: "state" },
      },
      right: {
        type: "Literal",
        value: stateValue,
      },
    };
  }

  /**
   * 조건이 특정 variant 이름과 매칭되는지 확인
   */
  private matchesVariantName(condition: any, variantName: string): boolean {
    if (!condition) return false;

    // State 값 추출해서 비교
    const stateMatch = variantName.match(/State=([^,]+)/i);
    if (!stateMatch) return false;

    const stateValue = stateMatch[1].trim();

    // BinaryExpression인 경우
    if (condition.type === "BinaryExpression") {
      const propName = condition.left?.property?.name;
      const value = condition.right?.value;
      return propName === "state" && value === stateValue;
    }

    // LogicalExpression인 경우 재귀 확인
    if (condition.type === "LogicalExpression") {
      return (
        this.matchesVariantName(condition.left, variantName) ||
        this.matchesVariantName(condition.right, variantName)
      );
    }

    return false;
  }
}
