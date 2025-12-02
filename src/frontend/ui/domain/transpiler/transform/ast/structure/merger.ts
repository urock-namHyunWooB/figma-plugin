import { UnifiedNode, VirtualNode, VariantValueMap } from "../../../types/type";
import { matchNodes } from "./matcher";

// Helper: 가상 노드로부터 통합 노드 초기화
export function createUnifiedNode(
  vNode: VirtualNode,
  variantName: string
): UnifiedNode {
  const props: Record<string, VariantValueMap<any>> = {};

  // 모든 속성을 { "Default": value } 형태로 초기화
  Object.keys(vNode.attributes).forEach((key) => {
    // @ts-ignore: Key access
    const val = vNode.attributes[key];
    if (val !== undefined) {
      props[key] = { [variantName]: val };
    }
  });

  return {
    id: vNode.id, // 통합 노드의 ID는 Base 노드의 ID를 따라감
    type: vNode.type,
    name: vNode.name,
    props: props,
    visibleInVariants: new Set([variantName]),
    children: vNode.children.map((c) => createUnifiedNode(c, variantName)),
  };
}

/**
 * [Helper] UnifiedNode를 잠시 VirtualNode 형태로 변환 (매칭 엔진 사용을 위해)
 * 각 속성의 첫 번째 값(대표값)을 추출하여 가상 노드를 만듭니다.
 */
function toRepresentativeVirtualNodes(
  unifiedNodes: UnifiedNode[]
): VirtualNode[] {
  return unifiedNodes.map((u) => {
    const representativeAttrs: any = {};

    Object.keys(u.props).forEach((key) => {
      const variantValues = Object.values(u.props[key]);
      if (variantValues.length > 0) {
        representativeAttrs[key] = variantValues[0]; // 첫 번째 발견된 값 사용
      }
    });

    return {
      id: u.id,
      type: u.type,
      name: u.name,
      attributes: representativeAttrs,
      children: [], // 매칭 단계에서는 자식 깊이까지 안 봐도 됨 (Top-level matching)
      isLeaf: u.children.length === 0,
    } as VirtualNode;
  });
}

/**
 * [Main] Target Variant를 Unified AST에 병합 (The Zipper)
 */
export function mergeVariantIntoUnified(
  unifiedRoot: UnifiedNode,
  targetRoot: VirtualNode,
  variantName: string
) {
  // 1. Root Level Props Merge
  // 현재 노드(Root)는 이미 매칭되었다고 가정하므로 속성만 병합
  // unifiedRoot.visibleInVariants.add(variantName);

  Object.keys(targetRoot.attributes).forEach((key) => {
    // @ts-ignore
    const targetValue = targetRoot.attributes[key];

    if (!unifiedRoot.props[key]) {
      unifiedRoot.props[key] = {};
    }
    // 해당 Variant의 속성값 기록
    unifiedRoot.props[key][variantName] = targetValue;
  });

  // 2. Children Reconciliation (자식 병합 및 삽입)

  // A. 매칭 준비: Unified 자식들과 Target 자식들을 비교
  const unifiedVirtualChildren = toRepresentativeVirtualNodes(
    unifiedRoot.children
  );
  const matches = matchNodes(unifiedVirtualChildren, targetRoot.children); // Map<UnifiedID, TargetNode>

  // B. 순서 보존을 위한 새로운 자식 리스트 생성
  const newUnifiedChildren: UnifiedNode[] = [];
  const processedTargetIds = new Set<string>();

  // C. Base(Unified) 순서를 기준으로 순회하며 매칭 처리
  unifiedRoot.children.forEach((uChild) => {
    const matchedTargetChild = matches.get(uChild.id);

    if (matchedTargetChild) {
      // Case 1: 매칭 성공 (Base에도 있고 Target에도 있음)
      // -> 재귀적으로 내부 병합 수행 (Deep Merge)
      mergeVariantIntoUnified(uChild, matchedTargetChild, variantName);

      newUnifiedChildren.push(uChild);
      processedTargetIds.add(matchedTargetChild.id);
    } else {
      // Case 2: 매칭 실패 (Base에만 있고 Target엔 없음)
      // -> 이 Variant에서는 숨겨야 함 (visibleInVariants에 추가하지 않음)
      // -> 노드는 유지하되, 나중에 코드 생성 시 조건부 렌더링으로 처리됨
      newUnifiedChildren.push(uChild);
    }
  });

  // D. Expansion (Target에만 있는 노드 삽입)
  // Target 자식들을 순회하며 아직 처리 안 된(매칭 안 된) 노드를 적절한 위치에 끼워넣기
  let insertIndex = 0;

  targetRoot.children.forEach((tChild) => {
    if (processedTargetIds.has(tChild.id)) {
      // 이미 매칭되어 처리된 노드라면, 인덱스 커서를 그 다음으로 이동
      // (Unified 리스트에서 해당 노드의 위치를 찾아 그 뒤로 포커스 이동)
      const existingIndex = newUnifiedChildren.findIndex(
        (u) => matches.get(u.id)?.id === tChild.id
      );
      if (existingIndex !== -1) insertIndex = existingIndex + 1;
    } else {
      // Case 3: 새로운 노드 발견 (Base엔 없고 Target에만 있음)
      // -> 새로 UnifiedNode 생성하여 현재 커서 위치에 삽입
      const newUnifiedNode = createUnifiedNode(tChild, variantName);

      // [중요] 삽입 (Splice)
      newUnifiedChildren.splice(insertIndex, 0, newUnifiedNode);
      insertIndex++; // 다음 삽입을 위해 커서 이동
    }
  });

  // 3. Update Children Structure
  unifiedRoot.children = newUnifiedChildren;
}
