import FigmaCompiler, { RenderTree } from "@compiler";
import ComponentSetCompiler from "@compiler/core/componentSetNode/ComponentSetCompiler";
import NodeMatcher from "@compiler/core/NodeMatcher";

class Engine {
  constructor(root: FigmaCompiler, renderTree: RenderTree) {
    const node = root.SpecDataManager.getSpecById(renderTree.id);
    const specManager = root.SpecDataManager;

    if (node.type === "COMPONENT_SET") {
      const componentSetCompiler = new ComponentSetCompiler(
        renderTree,
        specManager,
        new NodeMatcher(specManager)
      );
    }
  }
}

export default Engine;
