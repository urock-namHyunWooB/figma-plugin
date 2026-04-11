import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "../src/frontend/ui/domain/code-generator2/FigmaCodeGenerator.js";

async function debug() {
  const fixturePath = path.join(process.cwd(), "test/fixtures/failing/Buttonsolid.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  
  const compiler = new FigmaCodeGenerator(fixture, { styleStrategy: "emotion" });
  const { main: uiTree } = compiler.buildUITree();
  
  let output = "=== BUTTONSOLID UI TREE DEBUG ===\n\n";
  
  // Find all conditionalGroup nodes recursively
  function findConditionalGroups(node: any, path: string = ""): void {
    const currentPath = path ? `${path} > ${node.name}` : node.name;
    
    if (node.type === "conditionalGroup") {
      output += `\n=== CONDITIONAL GROUP: ${currentPath} ===\n`;
      output += `ID: ${node.id}\n`;
      output += `Prop: ${node.prop}\n`;
      output += `Branches:\n`;
      
      for (const [branchKey, children] of Object.entries(node.branches || {})) {
        output += `  [${branchKey}]:\n`;
        const childArray = children as any[];
        for (const child of childArray) {
          output += `    - ${child.name}\n`;
          if (child.visibleCondition) {
            output += `      visibleCondition: ${JSON.stringify(child.visibleCondition)}\n`;
          }
        }
      }
    }
    
    // Recurse
    if (node.children) {
      for (const child of node.children) {
        findConditionalGroups(child, currentPath);
      }
    }
  }
  
  // Find nodes with "Icon" in name that have visibleCondition outside conditionalGroup
  function findIconsWithConditions(node: any, path: string = "", depth: number = 0): void {
    const currentPath = path ? `${path} > ${node.name}` : node.name;
    
    if (node.name && node.name.includes("Icon") && node.visibleCondition) {
      // Check if we're inside a conditionalGroup
      const isInConditionalGroup = currentPath.includes("_switch");
      if (!isInConditionalGroup) {
        output += `\n=== ICON WITH VISIBLE CONDITION (OUTSIDE CONDITIONAL GROUP) ===\n`;
        output += `Path: ${currentPath}\n`;
        output += `Name: ${node.name}\n`;
        output += `VisibleCondition: ${JSON.stringify(node.visibleCondition)}\n`;
      }
    }
    
    if (node.children) {
      for (const child of node.children) {
        findIconsWithConditions(child, currentPath, depth + 1);
      }
    }
  }
  
  // Also check the structure of the root
  output += `=== ROOT STRUCTURE ===\n`;
  output += `Root name: ${uiTree.root.name}\n`;
  output += `Root type: ${uiTree.root.type}\n`;
  output += `Root children count: ${uiTree.root.children?.length || 0}\n`;
  
  if (uiTree.root.children) {
    output += `Root children:\n`;
    for (const child of uiTree.root.children) {
      output += `  - ${child.name} (type: ${child.type})\n`;
    }
  }
  
  output += "\n";
  
  findConditionalGroups(uiTree.root);
  findIconsWithConditions(uiTree.root);
  
  // Write output
  fs.writeFileSync("/tmp/buttonsolid-cg-debug.txt", output, "utf-8");
  console.log("Debug output written to /tmp/buttonsolid-cg-debug.txt");
  console.log(output);
}

debug().catch(console.error);
