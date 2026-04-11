import type { InternalTree, InternalNode, DesignPattern, PropDefinition } from "../../../../types/types";
import type DataManager from "../../../data-manager/DataManager";
import { isFullCoverStyleOnly } from "./RedundantNodeCollapser";

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

  detect(tree: InternalTree, props?: PropDefinition[]): void {
    this.walk(tree, (node) => {
      this.detectAlphaMask(node);
      this.detectInteractionFrame(node);
    });
    this.detectFullCoverBackgrounds(tree);
    if (props) {
      this.detectStatePseudoClass(tree, props);
      this.detectBreakpointVariant(tree, props);
    }
  }

  private static readonly STATE_TO_PSEUDO: Record<string, string> = {
    Hover: ":hover",     Active: ":active",     Pressed: ":active",
    hover: ":hover",     active: ":active",     pressed: ":active",
    Focus: ":focus",     Disabled: ":disabled",  Visited: ":visited",
    focus: ":focus",     disabled: ":disabled",  visited: ":visited",
    disable: ":disabled",
  };

  private detectStatePseudoClass(tree: InternalTree, props: PropDefinition[]): void {
    const stateProp = props.find(
      (p) => p.sourceKey.toLowerCase() === "state" || p.sourceKey.toLowerCase() === "states"
    );
    if (!stateProp || stateProp.type !== "variant" || !stateProp.options?.length) return;

    const stateMap: Record<string, string> = {};
    for (const opt of stateProp.options) {
      const pseudo = DesignPatternDetector.STATE_TO_PSEUDO[opt];
      if (pseudo) stateMap[opt] = pseudo;
    }
    if (Object.keys(stateMap).length === 0) return;

    this.addPattern(tree, { type: "statePseudoClass", prop: stateProp.name, stateMap });
  }

  private static readonly BP_NAME_RE = /breakpoint|device|screen/i;

  private detectBreakpointVariant(tree: InternalTree, props: PropDefinition[]): void {
    const bpProp = props.find(
      (p) => p.type === "variant" && DesignPatternDetector.BP_NAME_RE.test(p.name)
    );
    if (!bpProp) return;

    this.addPattern(tree, { type: "breakpointVariant", prop: bpProp.name });
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

    this.addPattern(node, { type: "alphaMask", nodeId: node.id, visibleRef });
  }

  private detectInteractionFrame(node: InternalNode): void {
    if (node.type !== "FRAME") return;
    if (node.name !== "Interaction") return;
    this.addPattern(node, { type: "interactionFrame", nodeId: node.id });
  }

  private detectFullCoverBackgrounds(node: InternalNode): void {
    // bottom-up: process children first
    for (const child of node.children ?? []) {
      this.detectFullCoverBackgrounds(child);
    }

    const siblings = node.children ?? [];
    if (siblings.length < 2) return;

    for (const child of siblings) {
      if (isFullCoverStyleOnly(child, node, this.dataManager)) {
        this.addPattern(child, { type: "fullCoverBackground", nodeId: child.id });
      }
    }
  }
}
