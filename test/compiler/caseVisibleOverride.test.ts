import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Case.json visible override 이슈", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/any/Case.json"
  );

  it("should not generate showInteraction when no instance overrides visible", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    const mainCode = result.mainCode;

    // fixture에서 Interaction 노드의 visible override가 없으므로
    // showInteraction이 메인/dependency 어디에도 없어야 함
    // (opacity override만 있음: decorateInteractiveOpacity)
    expect(mainCode).not.toMatch(/showInteraction[={]/);
    expect(mainCode).toContain("decorateInteractiveOpacity");
  });

  // 삭제됨: "should apply correct styles to Large dependency (position: relative)"
  // — Interaction 노드가 sibling으로 렌더되던 OLD 동작을 검증하던 테스트.
  //   Phase 3 InteractionLayerStripper 도입으로 Interaction은 트리에서 제거되며
  //   부모는 absolute 자식이 없어졌으므로 position: relative 불필요.

  // 삭제됨: "should apply transparent background to Decorateinteractive"
  // — InteractionLayerStripper가 Interaction frame을 제거할 때,
  //   그 안의 Decorate/Interactive INSTANCE도 함께 제거됨.
  //   제거된 INSTANCE의 componentId가 dependency 목록에서도 정리되므로
  //   Decorateinteractive dependency 자체가 더 이상 생성되지 않음.

  it("should not generate Decorateinteractive dependency (stripped with Interaction frame)", async () => {
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    const compiler = new FigmaCodeGenerator(fixtureData);
    const result = await compiler.getGeneratedCodeWithDependencies();

    // Interaction frame 내부에서만 사용되던 Decorate/Interactive는
    // dependency로 생성되지 않아야 함
    const deps = result.dependencies || {};
    const hasDecorateInteractive = Object.values(deps).some(
      (dep: any) => dep.code.includes("Decorateinteractive")
    );
    expect(hasDecorateInteractive).toBe(false);
  });

  // 삭제됨: "should apply decorateInteractiveOpacity prop to Large dependency"
  // — Phase 3 stripper가 Interaction을 트리에서 제거하므로 prop 자체가 사라짐.
  //   디자이너 의도(opacity 효과)는 별도 작업으로 부모의 :hover/:active로 흡수
  //   되어야 함. 그 작업은 후속 task.
});
