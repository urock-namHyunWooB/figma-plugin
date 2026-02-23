import taptapNavigation from "./test/fixtures/item-slot-likes/taptap-navigation.json";
import { FigmaCodeGenerator } from "./src/frontend/ui/domain/code-generator2";
import type { FigmaNodeData } from "./src/frontend/ui/domain/code-generator2";

(async () => {
  const data = taptapNavigation as unknown as FigmaNodeData;
  const compiler = new FigmaCodeGenerator(data);
  const code = await compiler.compile();
  console.log(code);
})();
