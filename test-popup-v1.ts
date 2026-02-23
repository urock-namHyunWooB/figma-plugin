import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator/FigmaCodeGenerator";
import fs from "fs";

async function main() {
  const fixture = JSON.parse(fs.readFileSync("test/fixtures/any/Popup.json", "utf-8"));
  const compiler = new FigmaCodeGenerator(fixture, { styleStrategy: { type: "emotion" } });
  const result = await compiler.compile();
  
  if (result) {
    // Check for Popupbottom
    const hasPopupbottom = result.includes("Popupbottom:");
    console.log("Has Popupbottom:", hasPopupbottom);
    
    // Check for DoubleButtontrue
    const hasDoubleButton = result.includes("DoubleButtontrue") || result.includes("DoubleButton");
    console.log("Has DoubleButton:", hasDoubleButton);
    
    // Find all component declarations
    const components = result.match(/const \w+: React\.FC/g);
    console.log("\nComponents found:", components?.length);
    if (components) {
      components.slice(0, 10).forEach(c => console.log("  -", c));
    }
  }
}

main().catch(console.error);
