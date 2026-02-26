import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "../src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";

async function debug() {
  const fixturePath = path.join(process.cwd(), "test/fixtures/button/urockButton.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  
  const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
  
  // Access the internal uiTree
  const uiTree = await (compiler as any).buildUITree();
  
  // Find nodes named icon_arrow or button and check their bindings
  function findNodes(node: any, path: string = ""): void {
    const currentPath = path ? `${path} > ${node.name}` : node.name;
    
    if (node.name === "icon_arrow" || node.name === "button") {
      console.log("\n=== Node:", currentPath, "===");
      console.log("ID:", node.id);
      console.log("Type:", node.type);
      console.log("Bindings:", JSON.stringify(node.bindings, null, 2));
      console.log("Has styles:", !!node.styles);
      console.log("VisibleCondition:", JSON.stringify(node.visibleCondition, null, 2));
    }
    
    if (node.children) {
      for (const child of node.children) {
        findNodes(child, currentPath);
      }
    }
  }
  
  findNodes(uiTree.root);
}

debug().catch(console.error);
