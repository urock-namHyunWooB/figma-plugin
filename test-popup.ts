import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import fs from "fs";

async function main() {
  const fixture = JSON.parse(fs.readFileSync("test/fixtures/any/Popup.json", "utf-8"));
  const compiler = new FigmaCodeGenerator(fixture, { styleStrategy: "emotion" });
  const result = await compiler.compile();
  
  if (result) {
    fs.writeFileSync("/tmp/popup-generated.tsx", result);
    console.log("Generated Popup code");
    
    // Check for interfaces
    const interfaces = result.match(/export interface \w+Props/g);
    console.log("\nInterfaces found:", interfaces);
    
    // Check for function declarations
    const functions = result.match(/function \w+\(/g);
    console.log("\nFunctions found:", functions);
  }
}

main().catch(console.error);
