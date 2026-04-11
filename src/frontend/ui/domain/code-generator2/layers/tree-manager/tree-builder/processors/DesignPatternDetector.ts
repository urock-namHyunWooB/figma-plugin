import type { InternalTree, InternalNode, DesignPattern } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";

/**
 * DesignPatternDetector
 *
 * InternalTree를 순회하며 디자이너가 사용한 시각 기법(디자인 패턴)을 감지하고
 * 해당 노드의 metadata.designPatterns에 annotation을 부착한다.
 *
 * 감지만 수행하며, 처리(transform)는 후속 processor가 annotation을 읽어 수행한다.
 */
export class DesignPatternDetector {
  constructor(private readonly dataManager: DataManager) {}

  detect(tree: InternalTree): void {
    this.walk(tree, (node) => {
      this.detectAlphaMask(node);
      this.detectInteractionFrame(node);
    });
  }

  private walk(node: InternalNode, visitor: (n: InternalNode) => void): void {
    visitor(node);
    for (const child of node.children ?? []) {
      this.walk(child, visitor);
    }
  }

  private addPattern(node: InternalNode, pattern: DesignPattern): void {
    if (!node.metadata) node.metadata = {};
    if (!node.metadata.designPatterns) node.metadata.designPatterns = [];
    node.metadata.designPatterns.push(pattern);
  }

  private detectAlphaMask(node: InternalNode): void {
    const visibleRef = node.componentPropertyReferences?.visible;
    if (!visibleRef) return;

    const { node: origNode } = this.dataManager.getById(node.id);
    if (!origNode) return;

    const orig = origNode as any;
    if (orig.isMask !== true) return;
    if (orig.maskType !== "ALPHA") return;

    this.addPattern(node, { type: "alphaMask", visibleRef });
  }

  private detectInteractionFrame(node: InternalNode): void {
    if (node.type !== "FRAME") return;
    if (node.name !== "Interaction") return;
    this.addPattern(node, { type: "interactionFrame" });
  }
}
