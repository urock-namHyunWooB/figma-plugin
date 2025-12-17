import { FinalAstTree } from "@compiler";
import { generate } from "astring";
import { traverseBFS } from "@compiler/utils/traverse";

class ReactGenerator {
  constructor(astTree: FinalAstTree) {
    console.log("=== PROPS ===", astTree.props);

    console.log("=== STYLE BASE ===", astTree.style.base);

    console.log("=== STYLE DYNAMIC ===", astTree.style.dynamic);

    console.log("=== VISIBLE ===", astTree.visible);

    console.log(
      "=== CHILDREN ===",
      astTree.children.map((c) => ({
        type: c.type,
        name: c.name,
        visible: c.visible,
        hasChildren: c.children.length > 0,
      }))
    );

    console.log("=== VISIBLE CONDITIONS ===");
    traverseBFS(astTree, (node) => {
      if (node.visible.type === "condition") {
        console.log(node.name, ":", generate(node.visible.condition));
      }
    });
  }
}

export default ReactGenerator;
