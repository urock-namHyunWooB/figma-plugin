import { ElementASTNode, UnifiedNode } from "../../types";
import { findNodesByPredicate } from "../../utils/ast-tree-utils";

export function isButtonLike(node: UnifiedNode): boolean {
  // 1) Figma 타입 기준: FRAME/RECTANGLE/COMPONENT/INSTANCE만 허용
  const t = node.type;
  if (
    t !== "FRAME" &&
    t !== "RECTANGLE" &&
    t !== "COMPONENT" &&
    t !== "INSTANCE"
  ) {
    return false;
  }

  // 2) 높이 체크: 100px 이하
  const height = node.figmaStyles?.height;
  if (height !== undefined && height > 100) {
    return false;
  }

  // 3) 재귀적으로 모든 자식 요소를 탐색하여 TEXT 노드가 최소 1개 있어야 함
  const textNodes = findNodesByPredicate(
    node,
    (child) =>
      child.originalType === "TEXT" &&
      !!(child.textContent && child.textContent.trim())
  );
  const hasTextChild = textNodes.length > 0;
  if (!hasTextChild) return false;

  // 4) 이름 힌트 체크 (향후 더 정교한 추론을 위해 계산)
  const name = node.name.toLowerCase();
  const buttonHints = [
    "button",
    "btn",
    "primary",
    "secondary",
    "confirm",
    "cancel",
  ];
  const _nameLooksButton = buttonHints.some((hint) => name.includes(hint));

  // 5) 구조 패턴 체크: TEXT + 아이콘 조합 (향후 더 정교한 추론을 위해 계산)
  const _hasIconChild =
    findNodesByPredicate(
      node,
      (child) =>
        (child.originalType === "VECTOR" ||
          child.originalType === "INSTANCE" ||
          child.originalType === "COMPONENT") &&
        child.name.toLowerCase().includes("icon")
    ).length > 0;

  // 기본 규칙: 텍스트가 있으면 버튼으로 인식
  // 이름 힌트나 아이콘이 있으면 더 확신할 수 있음 (향후 활용 예정)
  return hasTextChild;
}
