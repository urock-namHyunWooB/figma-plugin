import type { ElementASTNode } from "../../../types";

class SemanticConverter {
  public convert(node: ElementASTNode): ElementASTNode {
    if (this.isButtonLike(node)) {
      return { ...node, tag: "button" };
    }
    return node;
  }
  private isButtonLike(node: ElementASTNode): boolean {
    // 1) 태그가 div 일 때만 (이미 span/text 등은 제외)
    if (node.tag !== "div") return false;

    // 2) Figma 타입 기준: FRAME/RECTANGLE 정도만
    const t = node.originalType;
    if (
      t !== "FRAME" &&
      t !== "RECTANGLE" &&
      t !== "COMPONENT" &&
      t !== "INSTANCE"
    ) {
      return false;
    }

    const style = node.props?.style ?? {};

    // 3) 배경색이 존재해야 "버튼 느낌"이 좀 난다
    if (!style.backgroundColor) return false;

    // 4) 자식 중에 TEXT 노드가 최소 1개 있어야 레이블이 있다고 볼 수 있음
    const hasTextChild = node.children.some(
      (child) =>
        child.originalType === "TEXT" &&
        !!(child.textContent && child.textContent.trim()),
    );
    if (!hasTextChild) return false;

    // 5) 이름에도 약간 힌트가 있는 경우 우선순위 높게
    const name = node.name.toLowerCase();
    const buttonHints = [
      "button",
      "btn",
      "primary",
      "secondary",
      "confirm",
      "cancel",
    ];
    const nameLooksButton = buttonHints.some((hint) => name.includes(hint));

    // 기본 규칙: 텍스트 + 배경색이면 버튼으로 봐도 된다.
    // name에 힌트가 있으면 더 확신.
    return (
      hasTextChild &&
      !!style.backgroundColor &&
      true /* nameLooksButton optional */
    );
  }
}

export default SemanticConverter;

