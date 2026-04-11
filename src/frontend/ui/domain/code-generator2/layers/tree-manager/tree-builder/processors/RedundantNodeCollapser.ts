import type { InternalNode } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * RedundantNodeCollapser
 *
 * 시각적 결과를 바꾸지 않으면서 불필요한 중간 노드를 제거하는 트리 최적화.
 *
 * Pattern 1 — 풀커버 스타일 노드 흡수:
 *   children 없이 부모를 완전히 덮는 노드의 스타일(fills 등)을 부모에 흡수하고 제거.
 *   예: Buttonsolid의 Background(RECTANGLE) — ABSOLUTE로 부모 전체를 덮는 배경 레이어.
 *
 * Pattern 2 — 유일한 자식 래퍼 합침:
 *   부모의 유일한 자식이면서, 시각 스타일이 없고, 레이아웃이 같거나 없는 래퍼 노드 제거.
 *   래퍼의 children과 layout 속성을 부모로 이전.
 *   예: Wrapper(FRAME) → Content(FRAME) 사이의 불필요한 depth.
 *
 * 확장: 새 패턴은 별도 함수로 추가하고 collapseRedundantNodes에서 호출.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 트리 전체에서 불필요한 노드를 제거 (in-place).
 * post-order 순회로 자식부터 처리.
 */
export function collapseRedundantNodes(
  root: InternalNode,
  dataManager: DataManager,
): void {
  walkAndCollapse(root, dataManager);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core traversal
// ─────────────────────────────────────────────────────────────────────────────

function walkAndCollapse(
  node: InternalNode,
  dataManager: DataManager,
): void {
  // post-order: 자식부터 처리
  for (const child of [...(node.children ?? [])]) {
    walkAndCollapse(child, dataManager);
  }

  // Pattern 1: 풀커버 스타일 노드 흡수
  absorbFullCoverChildren(node, dataManager);

  // Pattern 2: 유일한 자식 래퍼 합침
  collapseOnlyChildWrapper(node, dataManager);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 1: 풀커버 스타일 노드 흡수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * node의 children 중, 자식이 없고 부모를 완전히 덮으며
 * 스타일이 배경 역할만 하는 노드를 찾아 부모에 흡수.
 */
function absorbFullCoverChildren(
  node: InternalNode,
  dataManager: DataManager,
): void {
  const children = node.children ?? [];
  if (children.length === 0) return;

  const survivors: InternalNode[] = [];

  for (const child of children) {
    if (child.metadata?.designPatterns?.some(p => p.type === "fullCoverBackground")) {
      // child의 fills를 부모의 mergedNodes 원본에 마킹 (StyleProcessor에서 활용)
      absorbFillsIntoParent(child, node, dataManager);
      // child는 survivors에 안 넣음 → 제거
      continue;
    }
    survivors.push(child);
  }

  node.children = survivors;
}

/**
 * 자식이 풀커버 스타일 전용 노드인지 판별.
 *
 * 조건:
 * 1. children이 없음
 * 2. TEXT, INSTANCE가 아님
 * 3. 부모에 다른 형제가 있음 (유일한 자식이면 콘텐츠이지 배경이 아님)
 * 4. 모든 variant에서 부모를 완전히 커버 (coverage ≥ 99%)
 * 5. fills만 있고 strokes/effects 없음 (순수 배경 역할)
 * 6. 부모에 기존 fills가 없거나, 있더라도 같은 값
 */
export function isFullCoverStyleOnly(
  child: InternalNode,
  parent: InternalNode,
  dataManager: DataManager,
): boolean {
  // children이 있으면 스타일 전용이 아님
  if (child.children && child.children.length > 0) return false;
  // TEXT, INSTANCE는 콘텐츠 노드
  if (child.type === "TEXT" || child.type === "INSTANCE") return false;
  // 부모의 유일한 자식이면 콘텐츠이지 배경이 아님
  const siblings = parent.children ?? [];
  if (siblings.length <= 1) return false;

  const mergedNodes = child.mergedNodes ?? [];
  if (mergedNodes.length === 0) return false;

  for (const merged of mergedNodes) {
    const rawChild = dataManager.getById(merged.id)?.node as any;
    if (!rawChild) return false;

    // fills 외에 strokes/effects가 있으면 단순 배경이 아님
    if (hasVisibleStrokes(rawChild)) return false;
    if (hasVisibleEffects(rawChild)) return false;
    if (!hasVisibleFills(rawChild)) return false;

    // 부모 variant 노드 찾기
    const parentRaw = findParentRawNode(merged.id, parent, dataManager);
    if (!parentRaw) return false;

    // coverage 확인
    if (!isFullyCovering(rawChild, parentRaw)) return false;

    // 부모에 이미 fills가 있고 다른 값이면 충돌
    if (hasVisibleFills(parentRaw) && !sameFills(rawChild, parentRaw)) return false;
  }

  return true;
}

/**
 * 풀커버 자식의 fills를 부모에 흡수.
 *
 * StyleProcessor가 사용하는 styleMap(cssStyle)을 직접 수정하여
 * child의 background를 parent의 cssStyle로 이전.
 * raw fills도 함께 복사하여 다른 프로세서와의 정합성 유지.
 */
function absorbFillsIntoParent(
  child: InternalNode,
  parent: InternalNode,
  dataManager: DataManager,
): void {
  const childMerged = child.mergedNodes ?? [];

  for (const cm of childMerged) {
    const childLookup = dataManager.getById(cm.id);
    const rawChild = childLookup?.node as any;
    const childStyle = childLookup?.style;
    if (!rawChild?.fills) continue;

    const parentRaw = findParentRawNode(cm.id, parent, dataManager);
    if (!parentRaw) continue;

    // raw fills 복사
    if (!hasVisibleFills(parentRaw)) {
      parentRaw.fills = [...rawChild.fills];
      if (rawChild.boundVariables?.fills) {
        if (!parentRaw.boundVariables) parentRaw.boundVariables = {};
        parentRaw.boundVariables.fills = rawChild.boundVariables.fills;
      }
    }

    // cssStyle의 background도 부모로 이전
    const parentMerged = parent.mergedNodes ?? [];
    const childOrigin = (parent.children ?? [])
      .flatMap((c) => c.mergedNodes ?? [])
      .find((m) => m.id === cm.id);

    if (childOrigin?.variantName) {
      const parentMatch = parentMerged.find(
        (pm) => pm.variantName === childOrigin.variantName,
      );
      if (parentMatch) {
        const parentStyle = dataManager.getById(parentMatch.id)?.style;
        if (parentStyle?.cssStyle && childStyle?.cssStyle) {
          const bg = childStyle.cssStyle.background;
          if (bg && !parentStyle.cssStyle.background) {
            parentStyle.cssStyle.background = bg;
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 2: 유일한 자식 래퍼 합침
// ─────────────────────────────────────────────────────────────────────────────

/**
 * node의 유일한 자식이 불필요한 래퍼이면 합침.
 *
 * 조건:
 * 1. node의 children이 정확히 1개
 * 2. 그 자식이 FRAME (INSTANCE, TEXT 등은 불가)
 * 3. 자식에 시각적 스타일 없음 (fills, strokes, effects)
 * 4. 자식에 clipsContent 없음
 * 5. 레이아웃 방향이 부모와 같거나, 래퍼에 layoutMode가 없음
 *
 * 합침 동작:
 * - 래퍼의 children을 부모로 올림
 * - 래퍼의 layout 속성(gap, padding 등)을 부모에 이전
 * - 래퍼의 mergedNodes를 보존 (부모 mergedNodes에 추가하지 않음 — 별도 depth)
 */
function collapseOnlyChildWrapper(
  node: InternalNode,
  dataManager: DataManager,
): void {
  const children = node.children ?? [];
  if (children.length !== 1) return;

  const wrapper = children[0];
  if (!isCollapsibleWrapper(wrapper, node, dataManager)) return;

  // 래퍼의 layout 속성을 부모로 이전
  transferLayoutProperties(wrapper, node, dataManager);

  // 래퍼의 children을 부모로 올림
  const wrapperChildren = wrapper.children ?? [];
  for (const grandChild of wrapperChildren) {
    grandChild.parent = node;
  }
  node.children = wrapperChildren;
}

function isCollapsibleWrapper(
  wrapper: InternalNode,
  parent: InternalNode,
  dataManager: DataManager,
): boolean {
  // FRAME만 래퍼로 취급
  if (wrapper.type !== "FRAME") return false;
  // children이 없으면 래퍼가 아님 (빈 노드)
  if (!wrapper.children || wrapper.children.length === 0) return false;

  const mergedNodes = wrapper.mergedNodes ?? [];
  if (mergedNodes.length === 0) return false;

  for (const merged of mergedNodes) {
    const rawWrapper = dataManager.getById(merged.id)?.node as any;
    if (!rawWrapper) return false;

    // 시각적 스타일 확인
    if (hasVisibleFills(rawWrapper)) return false;
    if (hasVisibleStrokes(rawWrapper)) return false;
    if (hasVisibleEffects(rawWrapper)) return false;

    // clipsContent 확인
    if (rawWrapper.clipsContent) return false;

    // 레이아웃 방향 확인
    const parentRaw = findParentRawNode(merged.id, parent, dataManager);
    if (!parentRaw) return false;

    const parentLayout = parentRaw.layoutMode ?? "NONE";
    const wrapperLayout = rawWrapper.layoutMode ?? "NONE";

    // 둘 다 layout이 있는데 방향이 다르면 합칠 수 없음
    if (
      parentLayout !== "NONE" &&
      wrapperLayout !== "NONE" &&
      parentLayout !== wrapperLayout
    ) {
      return false;
    }
  }

  return true;
}

/**
 * 래퍼의 layout 속성(gap, padding 등)을 부모 원본 노드로 이전.
 *
 * 래퍼가 유일한 자식이므로 부모의 기존 layout 속성을 래퍼 것으로 대체해도
 * 시각적 결과가 달라지지 않음.
 */
function transferLayoutProperties(
  wrapper: InternalNode,
  parent: InternalNode,
  dataManager: DataManager,
): void {
  const wrapperMerged = wrapper.mergedNodes ?? [];

  for (const wm of wrapperMerged) {
    const rawWrapper = dataManager.getById(wm.id)?.node as any;
    if (!rawWrapper) continue;

    const parentRaw = findParentRawNode(wm.id, parent, dataManager);
    if (!parentRaw) continue;

    const wrapperLayout = rawWrapper.layoutMode ?? "NONE";

    // 래퍼에 layout이 있으면 부모로 이전
    if (wrapperLayout !== "NONE") {
      // 부모에 layout이 없으면 래퍼의 layout을 그대로 가져감
      if (!parentRaw.layoutMode || parentRaw.layoutMode === "NONE") {
        parentRaw.layoutMode = rawWrapper.layoutMode;
      }

      // gap, padding, counterAxisAlignItems, primaryAxisAlignItems 등 이전
      const layoutProps = [
        "itemSpacing", "counterAxisSpacing",
        "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
        "primaryAxisAlignItems", "counterAxisAlignItems",
        "layoutWrap",
      ] as const;

      for (const prop of layoutProps) {
        if (rawWrapper[prop] !== undefined) {
          parentRaw[prop] = rawWrapper[prop];
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hasVisibleFills(node: any): boolean {
  return (
    Array.isArray(node?.fills) &&
    node.fills.some((f: any) => f.type && f.visible !== false)
  );
}

function hasVisibleStrokes(node: any): boolean {
  return (
    Array.isArray(node?.strokes) &&
    node.strokes.some((s: any) => s.type && s.visible !== false)
  );
}

function hasVisibleEffects(node: any): boolean {
  return (
    Array.isArray(node?.effects) &&
    node.effects.some((e: any) => e.visible !== false)
  );
}

function isFullyCovering(child: any, parent: any): boolean {
  const cBox = child.absoluteBoundingBox;
  const pBox = parent.absoluteBoundingBox;
  if (!cBox || !pBox || pBox.width === 0 || pBox.height === 0) return false;

  const covW = cBox.width / pBox.width;
  const covH = cBox.height / pBox.height;
  return covW >= 0.99 && covH >= 0.99;
}

function sameFills(a: any, b: any): boolean {
  return JSON.stringify(a.fills) === JSON.stringify(b.fills);
}

/**
 * child mergedNode의 ID로 같은 variant에 속하는 parent의 원본 노드를 찾는다.
 *
 * child와 parent의 mergedNodes를 variantName으로 매칭.
 */
function findParentRawNode(
  childMergedId: string,
  parent: InternalNode,
  dataManager: DataManager,
): any | null {
  const parentMerged = parent.mergedNodes ?? [];

  // child의 variantName 찾기
  // child가 속한 variant를 식별하기 위해 child의 raw 노드에서
  // 같은 variant root를 공유하는 parent mergedNode를 찾음
  const childRaw = dataManager.getById(childMergedId)?.node as any;
  if (!childRaw) return null;

  // 방법 1: parent mergedNodes 중 child의 부모 ID와 일치하는 것
  const childParentId = childRaw.parentId ?? (childRaw as any).parent?.id;

  for (const pm of parentMerged) {
    if (pm.id === childParentId) {
      return dataManager.getById(pm.id)?.node ?? null;
    }
  }

  // 방법 2: variantName으로 매칭 (mergedNodes의 variantName이 같은 것)
  const childOrigin = (parent.children ?? [])
    .flatMap((c) => c.mergedNodes ?? [])
    .find((m) => m.id === childMergedId);

  if (childOrigin?.variantName) {
    const parentMatch = parentMerged.find(
      (pm) => pm.variantName === childOrigin.variantName,
    );
    if (parentMatch) {
      return dataManager.getById(parentMatch.id)?.node ?? null;
    }
  }

  // 방법 3: 인덱스 기반 폴백 (순서가 같다고 가정)
  // child의 인덱스를 찾아서 parent mergedNodes의 같은 인덱스
  const allChildMerged = (parent.children ?? []).flatMap(
    (c) => c.mergedNodes ?? [],
  );
  const childIdx = allChildMerged.findIndex((m) => m.id === childMergedId);
  if (childIdx >= 0 && childIdx < parentMerged.length) {
    return dataManager.getById(parentMerged[childIdx].id)?.node ?? null;
  }

  return null;
}
