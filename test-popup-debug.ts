import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import fs from "fs";

async function main() {
  const fixture = JSON.parse(fs.readFileSync("test/fixtures/any/Popup.json", "utf-8"));
  const compiler = new FigmaCodeGenerator(fixture, { styleStrategy: "emotion" });
  const result = await compiler.generate();
  
  console.log("Main component:", result.main.componentName);
  console.log("\nDependencies:");
  for (const [id, dep] of result.dependencies) {
    console.log("  -", dep.componentName);
  }
}

main().catch(console.error);
