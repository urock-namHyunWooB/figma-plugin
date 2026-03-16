import { describe, test, expect } from "vitest";
import FigmaCodeGenerator from "@code-generator2";
import * as fs from "fs";
import * as path from "path";

describe("HUG layoutSizing은 고정 width/height를 생성하지 않아야 한다", () => {
  let code: string;

  beforeAll(async () => {
    const fixturePath = path.join(
      __dirname,
      "../fixtures/button/Button.json"
    );
    const figmaData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(figmaData);
    code = (await compiler.compile())!;
  });

  test("HUG 텍스트 노드에 고정 width가 설정되지 않아야 한다", () => {
    // Label 텍스트(layoutSizingHorizontal: "HUG")에 고정 width가 들어가면
    // 아이콘-텍스트 간격이 비정상적으로 넓어지는 버그 발생
    expect(code).not.toMatch(/buttonLabelCss.*width:\s*\d+px/s);
  });

  test("HUG 루트 노드에 고정 height가 설정되지 않아야 한다", () => {
    // 루트 Button(layoutSizingVertical: "HUG")에 고정 height가 들어가면
    // 콘텐츠 기반 사이징이 깨짐
    // buttonCss_sizeStyles 블록만 추출하여 검사 (Icon 스타일의 height와 구분)
    const sizeBlock = code.match(
      /const buttonCss_sizeStyles[\s\S]*?^};/m
    )?.[0];
    expect(sizeBlock).toBeDefined();
    expect(sizeBlock).not.toMatch(/height:\s*\d+px/);
  });

  test("FIXED 크기 노드(Icon)는 width/height가 유지되어야 한다", () => {
    // Icon INSTANCE(layoutSizingHorizontal: "FIXED")는 고정 크기 필요
    expect(code).toMatch(/buttonIconCss_sizeStyles[\s\S]*?width:\s*14px/);
    expect(code).toMatch(/buttonIconCss_sizeStyles[\s\S]*?height:\s*14px/);
  });
});
