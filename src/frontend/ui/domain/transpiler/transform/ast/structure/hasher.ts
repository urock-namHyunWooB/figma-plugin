/**
 * 간단한 문자열 해시 함수 (DJB2 알고리즘 변형)
 * 브라우저 호환성을 위해 crypto 모듈 대신 사용
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) + hash + char; /* hash * 33 + c */
  }
  return (hash >>> 0).toString(16); // Unsigned 32bit integer -> Hex string
}

/**
 * 노드의 구조적 해시를 계산합니다.
 *
 * 해시 포함 요소:
 * 1. 노드 타입 (FRAME, TEXT 등)
 * 2. 구조적 속성 (LayoutMode, Padding, Align 등)
 * 3. 자식 노드들의 해시 (재귀)
 *
 * 제외 요소:
 * 1. ID, Name (이름은 달라도 구조가 같으면 같은 것으로 취급)
 * 2. 색상, 폰트 등 시각적 스타일 (구조와 무관)
 * 3. 텍스트 내용 (내용은 달라도 텍스트 노드라는 구조는 동일)
 */
export function computeStructureHash(node: SceneNode): string {
  const parts: string[] = [];

  // 1. 기본 타입
  parts.push(node.type);

  // 2. 구조적 속성 (값이 있는 경우에만 추가)
  if ("layoutMode" in node) parts.push(`lm:${node.layoutMode}`);
  if ("primaryAxisAlignItems" in node)
    parts.push(`pa:${node.primaryAxisAlignItems}`);
  if ("counterAxisAlignItems" in node)
    parts.push(`ca:${node.counterAxisAlignItems}`);
  if ("layoutSizingHorizontal" in node)
    parts.push(`lsh:${node.layoutSizingHorizontal}`);
  if ("layoutSizingVertical" in node)
    parts.push(`lsv:${node.layoutSizingVertical}`);
  if ("itemSpacing" in node) parts.push(`gap:${node.itemSpacing}`);
  if ("paddingTop" in node) parts.push(`pt:${node.paddingTop}`);
  if ("paddingBottom" in node) parts.push(`pb:${node.paddingBottom}`);
  if ("paddingLeft" in node) parts.push(`pl:${node.paddingLeft}`);
  if ("paddingRight" in node) parts.push(`pr:${node.paddingRight}`);

  // 3. 자식 노드 해시 (Bottom-Up)
  if ("children" in node) {
    const childrenHashes = node.children.map((child) =>
      computeStructureHash(child)
    );
    parts.push(`children:[${childrenHashes.join(",")}]`);
  } else {
    parts.push("children:[]");
  }

  // 해시 생성
  return simpleHash(parts.join("|"));
}
