// src/sanitizer.ts
import {
  VirtualNode,
  NodeAttributes,
  SupportedType,
} from "../../../types/type";
import { generateUUID, safeGet } from "../../../utils/util";

/**
 * Figma SceneNode를 순회하며 순수 JSON 객체(VirtualNode)로 변환합니다.
 * 이 과정에서 불필요한 속성을 제거하고, Mixed 타입을 정규화합니다.
 */
export function sanitizeNode(
  node: SceneNode,
  globalStyleMap: Map<string, Record<string, string>>
): VirtualNode | null {
  // 1. Invisible Node Filtering (설정에 따라 변경 가능)
  if (node.visible === false) return null;

  const cssStyle = globalStyleMap?.get(node.id) || {};

  try {
    // 2. Attribute Extraction
    const attrs: NodeAttributes = {
      // Identity
      id: node.id,
      name: node.name,
      visible: node.visible,
      isMask: "isMask" in node ? node.isMask : false,

      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,

      style: cssStyle,
    };

    // C. Vector & Image Data
    if (["VECTOR", "STAR", "POLYGON", "ELLIPSE"].includes(node.type)) {
      if ("vectorNetwork" in node) {
        attrs.vectorNetwork = node.vectorNetwork; // clone needed in strict env? usually copied by value assignment in JS
      }
    }

    // 3. Construct Virtual Node
    const vNode: VirtualNode = {
      id: generateUUID(),
      figmaId: node.id,
      name: node.name,
      type: node.type as SupportedType,
      attributes: attrs,
      children: [],
      isLeaf: false,
    };

    // 4. Recursive Children Traversal
    // Text, Vector 등은 내부 구조가 있어도 코드 변환 시에는 '말단'으로 취급
    const isTerminal = [
      "TEXT",
      "VECTOR",
      "STAR",
      "POLYGON",
      "RECTANGLE",
      "ELLIPSE",
    ].includes(node.type);

    // Component Set이나 Instance는 내부를 파고들어야 함
    if ("children" in node && !isTerminal) {
      for (const child of node.children) {
        const sanitizedChild = sanitizeNode(child);
        if (sanitizedChild) {
          vNode.children.push(sanitizedChild);
        }
      }
    }

    // Leaf Marking (최적화용)
    if (vNode.children.length === 0 || isTerminal) {
      // @ts-ignore: Readonly property writing for initialization
      (vNode as any).isLeaf = true;
    }

    return vNode;
  } catch (error) {
    console.error(
      `[Sanitizer Error] Failed to process node: ${node.name} (ID: ${node.id})`,
      error
    );
    // 에러 발생 시 null을 리턴하여 전체 프로세스가 죽지 않도록 방어
    return null;
  }
}
