import { describe, it, expect } from "vitest";
import { FigmaCodeGenerator } from "../../src/frontend/ui/domain/code-generator2";
import ButtonsolidFixture from "../fixtures/failing/Buttonsolid.json";

describe("Buttonsolid gap", () => {
  it("Content 노드에 gap이 존재해야 한다", () => {
    const gen = new FigmaCodeGenerator(ButtonsolidFixture as any);
    const { main } = gen.buildUITree();

    // Content 노드 찾기 (root의 자식 중)
    const contentNode = (main.root as any).children?.find(
      (c: any) => c.name === "Content"
    );

    // Content 노드의 base 또는 dynamic 스타일에 gap이 있어야 함
    const baseGap = contentNode?.styles?.base?.gap;
    const dynamicGap = (contentNode?.styles?.dynamic || []).some(
      (d: any) => "gap" in d.style
    );

    expect(baseGap || dynamicGap).toBeTruthy();
  });
});
