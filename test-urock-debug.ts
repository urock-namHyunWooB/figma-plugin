import FigmaCodeGenerator from "./src/frontend/ui/domain/code-generator2/FigmaCodeGenerator";
import urockList from "./test/fixtures/any-component-set/urock-list.json";
import { FigmaNodeData } from "./src/frontend/ui/domain/code-generator2/types/types";

async function main() {
  const data = urockList as unknown as FigmaNodeData;
  const compiler = new FigmaCodeGenerator(data);

  console.log("\n=== Starting compilation ===\n");
  const result = await compiler.compile();

  if (result) {
    console.log("\n=== Generated Code ===\n");
    console.log(result);
  } else {
    console.log("\n=== Compilation returned null ===\n");
  }
}

main().catch(console.error);
