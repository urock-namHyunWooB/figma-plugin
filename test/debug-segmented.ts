import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

const fixturePath = path.join(
  process.cwd(),
  "test/fixtures/failing/SegmentedControlsegmentedControl.json"
);

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
const compiler = new FigmaCodeGenerator(fixture);

// 먼저 fixture 정보 확인
console.log("\n=== Fixture Info ===");
console.log("Component name:", fixture.info.document.name);
console.log("Component props:");
Object.entries(fixture.info.document.componentPropertyDefinitions || {}).forEach(([key, def]: [string, any]) => {
  console.log(`  - ${key}: ${def.type}`);
});

compiler.compile().then((code) => {
  // compile() 후에 UITree 확인
  const uiTree = compiler.buildUITree();
  console.log("\n=== SegmentedControl UITree Debug (after compile) ===");
  console.log("Root semanticType:", uiTree.main.root.semanticType);
  console.log("Root type:", uiTree.main.root.type);
  console.log("Root name:", uiTree.main.root.name);
  console.log("\nProps:");
  uiTree.main.props.forEach((prop) => {
    console.log(`  - ${prop.name}: ${prop.type}`,
      prop.type === "function" ? `(${(prop as any).functionSignature})` : "");
  });
  console.log("\n=== Generated Code Check ===");
  console.log("Has options prop:", code?.includes("options?:") || false);
  console.log("Has onChange prop:", code?.includes("onChange?:") || false);
  console.log("Has options.map:", code?.includes("options") && code?.includes(".map(") || false);

  // Props interface 부분 출력
  if (code) {
    const interfaceMatch = code.match(/export interface \w+Props \{[\s\S]*?\}/);
    if (interfaceMatch) {
      console.log("\n=== Props Interface ===");
      console.log(interfaceMatch[0]);
    }
  }
});
