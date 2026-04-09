import type { InternalNode, PseudoClass } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

type PseudoStyles = Partial<Record<PseudoClass, Record<string, string | number>>>;

/**
 * Interaction layer 감지.
 *
 * Spec §4 감지 규칙:
 * - name === "Interaction" (case-sensitive)
 * - type === "FRAME"
 * - children.length <= 1 (defensive: 2+ children은 strip 안 함)
 *
 * children type 제약은 의도적으로 없음 — 중첩 Interaction의 외곽 frame은
 * 자식이 FRAME(또 다른 Interaction)이고, 일반 case는 자식이 INSTANCE.
 * 둘 다 지원.
 */
export function isInteractionLayer(node: InternalNode): boolean {
  if (node.type !== "FRAME") return false;
  if (node.name !== "Interaction") return false;
  const children = node.children ?? [];
  if (children.length > 1) return false;
  return true;
}

/**
 * Figma `State` variant 값을 CSS pseudo-class로 매핑.
 *
 * Spec §5.2 매핑 테이블:
 * - Normal  → null (default state, no pseudo)
 * - Hover   → :hover
 * - Pressed → :active
 * - Focused → :focus
 * - Disabled → :disabled
 *
 * Case-insensitive. 알 수 없는 값은 null 반환.
 */
export function mapFigmaStateToPseudo(state: string): PseudoClass | null {
  const normalized = state.toLowerCase().trim();
  switch (normalized) {
    case "normal":
      return null;
    case "hover":
      return ":hover";
    case "pressed":
      return ":active";
    case "focused":
      return ":focus";
    case "disabled":
      return ":disabled";
    default:
      return null;
  }
}

/**
 * 부모 InternalNode의 styles.pseudo 구조에 pseudo-class entry를 병합.
 *
 * Spec §5.3 병합 규칙:
 * - 부모에 styles가 없으면 빈 StyleObject 생성
 * - styles.pseudo가 없으면 빈 객체 생성
 * - 같은 pseudo entry가 이미 있으면 부모의 기존 값 우선 (디자이너가 직접 작성한 게 명시적)
 * - 새 속성만 추가
 * - 빈 style 맵은 효과 없음 (entry 자체는 생성)
 */
export function mergePseudoIntoParent(
  parent: InternalNode,
  pseudo: PseudoClass,
  style: Record<string, string | number>,
): void {
  if (!parent.styles) {
    parent.styles = { base: {}, dynamic: [] };
  }
  if (!parent.styles.pseudo) {
    parent.styles.pseudo = {};
  }
  const existing = parent.styles.pseudo[pseudo] ?? {};
  const merged: Record<string, string | number> = { ...existing };
  for (const [key, value] of Object.entries(style)) {
    if (!(key in merged)) {
      merged[key] = value;
    }
  }
  parent.styles.pseudo[pseudo] = merged;
}

/**
 * Interaction frame에서 디자이너 의도 스타일을 추출.
 *
 * 1. 자식 INSTANCE의 raw Figma 노드를 DataManager에서 조회
 * 2. componentId의 componentSetId를 찾고 같은 set의 다른 variants 수집
 * 3. 각 variant의 State value를 pseudo-class로 매핑
 * 4. variant의 fills에서 색을 추출해 background로 변환
 * 5. State=Normal은 default이므로 pseudo entry로 변환하지 않음
 *
 * 반환: pseudo-class별 style map. State variants가 없거나 색이 없으면 빈 객체.
 */
export function extractInteractionStyles(
  interactionFrame: InternalNode,
  dataManager: DataManager,
): PseudoStyles {
  const result: PseudoStyles = {};
  const child = interactionFrame.children?.[0];
  if (!child || child.type !== "INSTANCE") return result;

  // 자식 INSTANCE의 원본 노드 조회 (mergedNodes로 raw id 얻음)
  const rawId = child.mergedNodes?.[0]?.id;
  if (!rawId) return result;
  const lookup = dataManager.getById(rawId);
  const rawInst = lookup?.node;
  const spec = lookup?.spec;
  if (!rawInst || !spec) return result;

  const componentId = (rawInst as any).componentId as string | undefined;
  if (!componentId) return result;

  const components = (spec as any).info?.components ?? {};
  const baseComponent = components[componentId];
  if (!baseComponent) return result;

  const componentSetId = baseComponent.componentSetId;
  if (!componentSetId) return result;

  // 같은 set에 속한 모든 variants 찾기
  const setVariants: Array<{ id: string; name: string }> = [];
  for (const [cid, comp] of Object.entries(components)) {
    if ((comp as any).componentSetId === componentSetId) {
      setVariants.push({ id: cid, name: (comp as any).name });
    }
  }

  // 각 variant의 State 값 → pseudo-class 매핑 → 색 추출
  for (const variant of setVariants) {
    const stateValue = parseStateValue(variant.name);
    if (!stateValue) continue;
    const pseudo = mapFigmaStateToPseudo(stateValue);
    if (!pseudo) continue; // Normal은 default

    const variantNode = dataManager.getById(variant.id)?.node;
    const color = extractFirstSolidColor(variantNode ?? rawInst);
    if (!color) continue;

    result[pseudo] = { background: color };
  }

  return result;
}

/** "State=Hover, Size=Large" 같은 variant 이름에서 State 값 추출 */
function parseStateValue(variantName: string): string | null {
  const parts = variantName.split(",").map((s) => s.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key.toLowerCase() === "state") {
      return part.slice(eq + 1).trim();
    }
  }
  // State 단독 (variant 이름이 "Hover" 같은 경우)
  if (parts.length === 1) return parts[0];
  return null;
}

/**
 * 트리 전체에서 Interaction layer를 제거.
 *
 * Post-order 순회로 자식부터 처리 → 중첩 Interaction의 안쪽부터 제거됨.
 * 매칭된 노드를 만나면:
 *   1. extractInteractionStyles로 스타일 추출
 *   2. 추출된 pseudo entry를 부모의 styles.pseudo에 병합
 *   3. 부모의 children에서 해당 노드 제거
 *
 * 트리는 in-place로 수정됨.
 */
export function stripInteractionLayers(
  root: InternalNode,
  dataManager: DataManager,
): void {
  walkAndStrip(root, dataManager);
}

function walkAndStrip(node: InternalNode, dataManager: DataManager): void {
  // 1. 먼저 자식들을 재귀 처리 (post-order)
  for (const child of [...(node.children ?? [])]) {
    walkAndStrip(child, dataManager);
  }

  // 2. 자기 children 중 Interaction layer 제거
  const children = node.children ?? [];
  const survivors: InternalNode[] = [];
  for (const child of children) {
    if (isInteractionLayer(child)) {
      // 제거 전에 스타일 추출 + 부모(=node)에 병합
      const extracted = extractInteractionStyles(child, dataManager);
      for (const [pseudo, style] of Object.entries(extracted)) {
        mergePseudoIntoParent(node, pseudo as PseudoClass, style ?? {});
      }
      // child는 survivors에 안 넣음 → 제거됨
      continue;
    }
    survivors.push(child);
  }
  node.children = survivors;
}

/** Figma 노드의 첫 SOLID fill을 CSS rgba 문자열로 변환 */
function extractFirstSolidColor(node: any): string | null {
  const fills = node?.fills;
  if (!Array.isArray(fills)) return null;
  for (const fill of fills) {
    if (fill?.type === "SOLID" && fill.color) {
      const r = Math.round(fill.color.r * 255);
      const g = Math.round(fill.color.g * 255);
      const b = Math.round(fill.color.b * 255);
      const a = fill.color.a ?? 1;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return null;
}
