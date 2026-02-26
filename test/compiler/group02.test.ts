import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import group02 from "../fixtures/any/group-02.json";
import type { FigmaNodeData } from "@code-generator2";

describe("group-02 TEXT 노드 렌더링 테스트", () => {
  test("TEXT 노드가 렌더링되어야 한다", async () => {
    const data = group02 as unknown as FigmaNodeData;
    
    console.log("=== Document Info ===");
    console.log("Type:", data.info.document.type);
    console.log("Name:", data.info.document.name);
    console.log("Children:", data.info.document.children?.map(c => ({ 
      name: c.name, 
      type: c.type,
      characters: (c as any).characters 
    })));
    
    const compiler = new FigmaCodeGenerator(data);
    const code = await compiler.compile("Group21737");
    
    console.log("=== Generated Code ===");
    console.log(code);
    
    expect(code).not.toBeNull();
    
    // TEXT 노드의 characters가 포함되어야 함
    expect(code).toContain("Zero Commission");
  });
});

