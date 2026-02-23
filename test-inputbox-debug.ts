import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import inputBoxOtp from "./test/fixtures/any/InputBoxotp.json";
import { FigmaNodeData } from "./src/frontend/ui/domain/code-generator2/types/types";
import fs from "fs";

async function main() {
  const data = inputBoxOtp as unknown as FigmaNodeData;
  const compiler = new FigmaCodeGenerator(data);
  const result = await compiler.compile();

  if (result) {
    fs.writeFileSync("/tmp/inputbox-generated.tsx", result);
    console.log("Code written to /tmp/inputbox-generated.tsx");

    // Find guideText usage
    const lines = result.split('\n');
    console.log("\n=== guideText usage (with context) ===\n");
    lines.forEach((line, idx) => {
      if (line.includes('guideText')) {
        console.log(`Line ${idx}: ${lines[idx-1]}`);
        console.log(`Line ${idx}: ${line}`);
        console.log(`Line ${idx}: ${lines[idx+1]}`);
        console.log('---');
      }
    });
  }
}

main().catch(console.error);
