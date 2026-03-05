/**
 * Controlcheckbox 브라우저 렌더링 검증 테스트
 * 
 * 검증 항목:
 * 1. Unchecked 상태: Box가 회색 테두리, 투명 배경
 * 2. Checked 상태: Box가 파란 테두리, 파란 배경
 * 3. Indeterminate 상태: Box가 파란 테두리, 파란 배경
 * 
 * CSS variables --Primary-Normal: #0066FF → fallback이 #06F = rgb(0, 102, 255)
 */
import { describe, test, expect, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import FigmaCodeGenerator from "@code-generator2";
import { renderReactComponent } from "@frontend/ui/domain/renderer/component-render";

import controlcheckboxMockData from "../../fixtures/any/Controlcheckbox.json";

describe("Controlcheckbox 브라우저 렌더링 검증", () => {
  let Component: React.ComponentType<any>;
  let compiledCode: string;

  beforeAll(async () => {
    const compiler = new FigmaCodeGenerator(controlcheckboxMockData as any);
    const code = await compiler.compile();
    expect(code).toBeTruthy();
    compiledCode = code!;
    console.log("=== Compiled Controlcheckbox code ===");
    console.log(code);
    Component = await renderReactComponent(code!);
  });

  function renderCheckbox(props?: Record<string, any>) {
    return render(React.createElement(Component, props ?? {}));
  }

  function getBoxElement(container: HTMLElement): HTMLElement {
    let box = container.querySelector('[data-figma-id="16215:34461"]') as HTMLElement;
    if (box) return box;
    
    const button = container.querySelector("button");
    if (!button) throw new Error("Button not found");
    
    const divs = button.querySelectorAll("div");
    for (const div of divs) {
      const style = getComputedStyle(div);
      const radius = parseFloat(style.borderRadius);
      // interaction wrapper는 border-radius: 1000px (pill shape) → 제외
      // checkbox box는 border-radius: ~5px → 포함
      if (radius > 0 && radius < 100) {
        return div as HTMLElement;
      }
    }
    
    throw new Error("Box element not found");
  }

  /** 전체 DOM 구조와 스타일 덤프 */
  function dumpStyles(container: HTMLElement, label: string) {
    const allElements = container.querySelectorAll("*");
    console.log(`\n=== ${label}: DOM dump (${allElements.length} elements) ===`);
    allElements.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      const figmaId = htmlEl.getAttribute("data-figma-id") || "";
      if (figmaId) {
        console.log(`[${i}] <${el.tagName.toLowerCase()} data-figma-id="${figmaId}">`);
        console.log(`    bg: ${style.backgroundColor}, border: ${style.borderColor}, borderWidth: ${style.borderWidth}, borderRadius: ${style.borderRadius}`);
      }
    });
  }

  describe("1. Unchecked 상태 (기본)", () => {
    test("Box의 스타일 검증 - 배경색은 투명, 테두리는 회색이어야 한다", () => {
      const { container } = renderCheckbox({
        checked: false,
        indeterminate: false,
      });
      
      dumpStyles(container, "Unchecked");
      
      const box = getBoxElement(container);
      const styles = getComputedStyle(box);
      
      console.log("\n[Unchecked] Box computed styles:");
      console.log("  backgroundColor:", styles.backgroundColor);
      console.log("  borderColor:", styles.borderColor);
      console.log("  borderWidth:", styles.borderWidth);
      console.log("  borderStyle:", styles.borderStyle);
      console.log("  borderRadius:", styles.borderRadius);
      console.log("  width:", styles.width);
      console.log("  height:", styles.height);
      
      // 핵심 버그 검증: Unchecked 상태에서 배경이 파란색이면 안됨
      // CSS에서 checkboxBoxCss에 background: var(--Primary-Normal, #06F) 가 
      // 항상 적용되고 있음 (checked/unchecked 조건 분기 없음)
      // 
      // Figma 원본에서 Unchecked 상태:
      // - 배경: 투명 또는 흰색
      // - 테두리: 회색 (#B0B0B0 등)
      //
      // 현재 컴파일된 코드의 checkboxBoxCss:
      //   border: 1.5px solid var(--Primary-Normal, #06F);  ← 항상 파란색
      //   background: var(--Primary-Normal, #06F);           ← 항상 파란색
      //
      // 이것이 버그: checked/indeterminate에 따라 조건부여야 함
      
      // 실제 값 기록 (CSS variable fallback 사용 시 #06F = rgb(0, 102, 255))
      // CSS variable이 정의되지 않은 환경에서 fallback인 #06F가 적용됨
      // = rgb(0, 102, 255)
      
      // 버그 확인: 배경이 파란색(#06F fallback)인지 확인
      const bgIsPrimaryBlue = styles.backgroundColor === "rgb(0, 102, 255)";
      // 또는 CSS variable이 #171719로 resolve 되었을 수 있음 (Label-Normal fallback)
      const bgIsDark = styles.backgroundColor === "rgb(23, 23, 25)";
      
      console.log("  bgIsPrimaryBlue:", bgIsPrimaryBlue);
      console.log("  bgIsDark:", bgIsDark);
      
      // Unchecked 상태에서 배경이 투명/흰색이어야 함
      const bgIsCorrect = 
        styles.backgroundColor === "rgba(0, 0, 0, 0)" || 
        styles.backgroundColor === "transparent" ||
        styles.backgroundColor === "rgb(255, 255, 255)";
        
      // 현재 상태 기록 (실패 예상)
      if (!bgIsCorrect) {
        console.log("\n  *** BUG: Unchecked 상태에서 배경색이 투명/흰색이 아님 ***");
        console.log("  실제 배경색:", styles.backgroundColor);
        console.log("  원인: checkboxBoxCss에 background가 무조건 적용됨");
        console.log("  수정: checked/indeterminate 조건에 따라 배경색 분기 필요");
      }
      
      expect(bgIsCorrect).toBe(true);
    });
  });

  describe("2. Checked 상태", () => {
    test("Box의 배경색과 테두리가 파란색이어야 한다", () => {
      const { container } = renderCheckbox({
        checked: true,
        indeterminate: false,
      });
      
      dumpStyles(container, "Checked");
      
      const box = getBoxElement(container);
      const styles = getComputedStyle(box);
      
      console.log("\n[Checked] Box computed styles:");
      console.log("  backgroundColor:", styles.backgroundColor);
      console.log("  borderColor:", styles.borderColor);
      
      // CSS variable --Primary-Normal의 fallback은 #06F = rgb(0, 102, 255)
      // 만약 CSS variable이 정의 안되면 fallback이 적용
      const bgIsPrimaryBlue = 
        styles.backgroundColor === "rgb(0, 102, 255)" || // #06F fallback
        styles.backgroundColor === "rgb(0, 80, 255)";     // #0050FF
      
      const borderIsPrimaryBlue = 
        styles.borderColor === "rgb(0, 102, 255)" || 
        styles.borderColor === "rgb(0, 80, 255)";
      
      console.log("  bgIsPrimaryBlue:", bgIsPrimaryBlue);
      console.log("  borderIsPrimaryBlue:", borderIsPrimaryBlue);
      
      if (!bgIsPrimaryBlue) {
        console.log("\n  *** BUG: Checked 상태에서 배경색이 파란색이 아님 ***");
        console.log("  실제 배경색:", styles.backgroundColor);
      }
      
      expect(bgIsPrimaryBlue).toBe(true);
    });
  });

  describe("3. Indeterminate 상태", () => {
    test("Box의 배경색과 테두리가 파란색이어야 한다", () => {
      const { container } = renderCheckbox({
        checked: false,
        indeterminate: true,
      });
      
      dumpStyles(container, "Indeterminate");
      
      const box = getBoxElement(container);
      const styles = getComputedStyle(box);
      
      console.log("\n[Indeterminate] Box computed styles:");
      console.log("  backgroundColor:", styles.backgroundColor);
      console.log("  borderColor:", styles.borderColor);
      
      const bgIsPrimaryBlue = 
        styles.backgroundColor === "rgb(0, 102, 255)" ||
        styles.backgroundColor === "rgb(0, 80, 255)";
      
      console.log("  bgIsPrimaryBlue:", bgIsPrimaryBlue);
      
      if (!bgIsPrimaryBlue) {
        console.log("\n  *** BUG: Indeterminate 상태에서 배경색이 파란색이 아님 ***");
        console.log("  실제 배경색:", styles.backgroundColor);
      }
      
      expect(bgIsPrimaryBlue).toBe(true);
    });
  });

  test("컴파일된 코드에서 checked/unchecked 조건부 스타일 존재 여부 확인", () => {
    console.log("\n=== 컴파일된 코드 분석 ===");
    
    // checkboxBoxCss에 조건부 스타일이 있는지 확인
    const hasCheckedConditionalBg = compiledCode.includes("checked") && 
      (compiledCode.includes("checkboxBoxCss_checkedStyles") || 
       compiledCode.includes("_checkedStyles"));
    
    console.log("  checked 조건부 배경 스타일 존재:", hasCheckedConditionalBg);
    
    // border와 background가 무조건 Primary-Normal로 설정되어 있는지
    const boxCssMatch = compiledCode.match(/checkboxBoxCss\s*=\s*css`([^`]+)`/s);
    if (boxCssMatch) {
      console.log("\n  checkboxBoxCss 내용:");
      console.log("  ", boxCssMatch[1].trim());
    }
    
    // 조건부 스타일 객체 확인
    const conditionalMatches = compiledCode.match(/checkboxBoxCss_\w+/g);
    console.log("\n  checkboxBoxCss 관련 조건부 스타일:", conditionalMatches || "없음");
    
    // checked prop이 Box의 조건부 스타일에 사용되는지 확인
    // 현재 코드에서 checked는 아이콘 표시만 제어하고 Box 배경색은 제어하지 않음
    const checkedUsagePattern = /checked.*checkboxBoxCss|checkboxBoxCss.*checked/;
    const checkedControlsBox = checkedUsagePattern.test(compiledCode);
    console.log("  checked가 Box 스타일 제어:", checkedControlsBox);
    
    // 실제로 렌더링에서 Box에 전달되는 css 배열 확인
    const boxRenderPattern = compiledCode.match(/<div\s+css=\{[^}]+\}[^>]*data-figma-id="16215:34461"[^>]*/s);
    if (boxRenderPattern) {
      console.log("\n  Box 렌더링 코드:", boxRenderPattern[0]);
    }
    
    // 이 테스트는 진단용이므로 pass
    expect(true).toBe(true);
  });
});
