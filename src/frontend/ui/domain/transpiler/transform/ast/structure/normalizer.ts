import { SceneNode } from "../../../types/figma-api";

/**
 * 노드를 비교하기 쉬운 표준 형태로 변환합니다.
 * 원본 노드를 수정하지 않고, 필요한 속성이 보강된 새로운 객체(또는 Proxy)를 반환합니다.
 */
export function normalizeNode(node: SceneNode): SceneNode {
  // 1. Group -> Frame 변환
  if (node.type === "GROUP") {
    return convertGroupToFrame(node);
  }

  // 2. 다양한 벡터 노드 -> VECTOR 타입으로 통합
  // 아이콘이나 일러스트레이션 등 형태만 다르고 역할이 같은 요소들을 매칭시키기 위함
  if (isVectorLike(node)) {
    return convertToGenericVector(node);
  }

  // 자식들도 재귀적으로 정규화 (Frame, Component 등 자식을 가지는 노드)
  if ("children" in node) {
    return {
      ...node,
      children: node.children.map(normalizeNode),
    } as SceneNode;
  }

  return node;
}

/**
 * Group 노드를 Frame 노드처럼 보이게 변환합니다.
 * Layout 관련 속성들을 기본값(None/Zero)으로 채워넣습니다.
 */
function convertGroupToFrame(groupNode: any): any {
  return {
    ...groupNode,
    type: "FRAME", // 타입을 속여서 Frame과 비교 가능하게 함

    // Frame 필수 속성 기본값 주입
    layoutMode: "NONE",
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "AUTO",
    layoutGrow: 0,
    layoutAlign: "INHERIT",

    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    itemSpacing: 0,

    clipsContent: false,

    // Group의 자식들은 그대로 유지 (재귀적 정규화 적용)
    children: groupNode.children ? groupNode.children.map(normalizeNode) : [],
  };
}

/**
 * 벡터류 노드인지 확인
 */
function isVectorLike(node: SceneNode): boolean {
  const vectorTypes = [
    "VECTOR",
    "STAR",
    "LINE",
    "ELLIPSE",
    "POLYGON",
    "RECTANGLE", // 사각형도 단순 도형으로 쓰일 땐 벡터 취급
    "BOOLEAN_OPERATION",
  ];
  return vectorTypes.includes(node.type);
}

/**
 * 벡터 노드를 일반화된 VECTOR 타입으로 변환
 */
function convertToGenericVector(node: any): any {
  return {
    ...node,
    type: "VECTOR", // 타입을 VECTOR로 통일
    // 형태(Shape) 관련 속성은 무시하거나 해시 계산에서 제외됨
    // 스타일(Fills, Strokes)은 유지
  };
}

/**
 * 노드 리스트 전체를 정규화
 */
export function normalizeNodes(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes.map(normalizeNode);
}
