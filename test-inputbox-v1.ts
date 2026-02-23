import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator/FigmaCodeGenerator";
import inputBoxOtp from "./test/fixtures/any/InputBoxotp.json";
import { FigmaNodeData } from "./src/frontend/ui/domain/code-generator2/types/types";

async function main() {
  const data = inputBoxOtp as unknown as FigmaNodeData;
  const compiler = new FigmaCodeGenerator(data);
  const result = await compiler.compile();

  if (result) {
    console.log("\n=== v1 Props Interface ===\n");
    const propsMatch = result.match(/export interface \w+Props \{[^}]+\}/s);
    if (propsMatch) {
      console.log(propsMatch[0]);
    }

    console.log("\n=== v1 guideText usage ===\n");
    const lines = result.split('\n').filter(line => line.includes('guideText'));
    console.log(`Found ${lines.length} lines with guideText`);
    if (lines.length > 0) {
      lines.slice(0, 5).forEach(line => console.log(line));
    }
  }
}

main().catch(console.error);
