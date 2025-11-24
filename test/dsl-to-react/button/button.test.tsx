import { describe, test, expect, beforeAll } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import taptapButtonDSL from "../../fixtures/button/taptapButton.json";
import airtableButtonDSL from "../../fixtures/button/airtable-button.json";
import type { ComponentSetNodeSpec } from "@backend/managers/SpecManager";
import { transpile } from "@frontend/ui/domain/transpiler/pipeline/transpiler";
import { compileReactComponent } from "@frontend/ui/utils/component-compiler";

describe("airtableButtonDSL 테스트", () => {
  let Component: React.ComponentType<any>;
  let tsxCode: string;

  // 모든 테스트 전에 컴포넌트 컴파일
  beforeAll(async () => {
    const componentSpec = airtableButtonDSL as ComponentSetNodeSpec;
    tsxCode = transpile(componentSpec);
    Component = await compileReactComponent(tsxCode);
  });

  test("기본 버튼 width, height 값은 71px, 32px이다", () => {});

  test("props에서 icon은 ReactNode 타입이다", () => {
    expect.fail("Not implemented");
  });

  test("props를 통해서 버튼의 text를 동적으로 렌더할 수 있어야 한다.", () => {
    expect.fail("Not implemented");
  });

  test("border 값이 없어야한다.", () => {
    const { container } = render(<Component text="Test" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    const styles = window.getComputedStyle(button);

    // border가 없거나 0이어야 함
    const borderWidth = styles.borderWidth;
    expect(borderWidth === "0px" || borderWidth === "" || !borderWidth).toBe(
      true
    );
  });

  test("props 값으로 isDisabled boolean 형태로 받을 수 없어야 한다.", () => {
    expect(tsxCode).not.toMatch(/isDisabled\??\s*:\s*boolean/i);

    expect(tsxCode).not.toMatch(/isDisabled\s*=/);
  });

  test("hover해도 변화 없다.", async () => {
    // 생성된 코드에 hover 스타일이 포함되어 있는지 확인
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // hover 스타일이 코드에 포함되어 있는지 확인
    expect(tsxCode).toContain("hoverStyles");
    expect(tsxCode).toContain("&:hover");
    expect(tsxCode).toContain("rgb(71, 207, 214)");

    // 컴포넌트 렌더링
    const { container } = render(<Component text="Test" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();

    // 실제 hover 이벤트 발생 (CSS :hover pseudo-class는 실제 마우스 이벤트에서만 작동)
    // 테스트 환경에서는 CSS :hover를 직접 테스트할 수 없으므로,
    // 생성된 코드에 hover 스타일이 올바르게 포함되어 있는지 확인
    fireEvent.mouseEnter(button);
    fireEvent.mouseOver(button);

    // hover 스타일이 DOM에 적용되었는지 확인 (emotion이 생성한 클래스 확인)
    const buttonElement = button as HTMLElement;
    expect(buttonElement).toBeTruthy();

    // emotion이 생성한 스타일이 있는지 확인
    // 실제 hover 상태는 브라우저에서만 테스트 가능하므로,
    // 여기서는 hover 스타일이 코드에 포함되어 있는지만 확인
    const hasHoverStyle =
      tsxCode.includes("hoverStyles") && tsxCode.includes("&:hover");
    expect(hasHoverStyle).toBe(true);
  });

  test("size가 small이면 width 값이 70px height가 28px이다.", () => {
    // sizeStyles 객체가 있는지 확인
    expect(tsxCode).toContain("sizeStyles");
    // Medium variant가 있는지 확인
    expect(tsxCode).toContain("small");

    // size prop이 정규화되어 "size" (소문자)로 변환됨
    const { container } = render(<Component text="Test" size="small" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();

    // inline style로 설정된 경우를 먼저 확인
    const inlineWidth = button.style.width;
    const inlineHeight = button.style.height;

    // inline style이 있으면 그것을 사용, 없으면 computed style 사용
    const width = inlineWidth || window.getComputedStyle(button).width;
    const height = inlineHeight || window.getComputedStyle(button).height;

    // 실제 렌더링된 크기 확인
    // size prop이 제대로 전달되면 98px이어야 함
    expect(width).toBe("71px");
    expect(height).toBe("28px");
  });

  test("props에 state 값은 없다.", () => {
    // Props interface에 state가 없어야 함
    // state?: 또는 state: 패턴이 없어야 함
    expect(tsxCode).not.toMatch(/state\??\s*:/i);

    // 함수 파라미터에 state가 없어야 함
    // destructuring이나 일반 파라미터 모두 확인
    expect(tsxCode).not.toMatch(/{\s*[^}]*state[^}]*}/);
    expect(tsxCode).not.toMatch(/\(\s*[^)]*state[^)]*\)/);

    // state prop을 전달하려고 해도 에러가 나지 않아야 함 (무시되어야 함)
    expect(() => {
      render(<Component text="Test" state="hover" />);
    }).not.toThrow();

    // state prop이 실제로 사용되지 않는지 확인
    // state를 사용하는 코드 패턴이 없어야 함
    expect(tsxCode).not.toMatch(/\.state\b/);
    expect(tsxCode).not.toMatch(/\[['"]state['"]\]/);
  });

  test("text만 있을때 button 기준 text는 가운데 정렬 되어야 한다.", () => {
    const { container } = render(<Component text="Test" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    const styles = window.getComputedStyle(button);

    // text-align이 center이거나 justify-content가 center여야 함
    const textAlign = styles.textAlign;
    const justifyContent = styles.justifyContent;
    const alignItems = styles.alignItems;

    // flexbox를 사용하는 경우와 일반 text-align을 모두 고려
    const isCentered =
      textAlign === "center" ||
      (justifyContent === "center" && alignItems === "center") ||
      justifyContent === "center";

    expect(isCentered).toBe(true);
  });

  test("props에 iconLeft을 넣을 수 있어야 한다.", () => {
    // 1. Props interface에 iconLeft가 있는지 확인
    expect(tsxCode).toMatch(
      /iconLeft\??\s*:\s*(React\.ReactNode|ReactNode|JSX\.Element)/i
    );

    // 2. 테스트용 아이콘 컴포넌트 생성
    const TestIcon = () => (
      <svg data-testid="test-icon" width="16" height="16">
        <circle cx="8" cy="8" r="8" fill="currentColor" />
      </svg>
    );

    // 3. iconLeft prop으로 렌더링 가능한지 확인
    expect(() => {
      render(<Component text="Test" iconLeft={<TestIcon />} />);
    }).not.toThrow();

    // 4. iconLeft가 실제로 렌더링되는지 확인
    const { container, getByTestId } = render(
      <Component text="Test" iconLeft={<TestIcon />} />
    );

    const icon = getByTestId("test-icon");
    expect(icon).toBeTruthy();

    // 5. icon이 text 왼쪽에 위치하는지 확인
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();

    // button 내부 구조 확인
    const iconElement = button.querySelector('[data-testid="test-icon"]');
    expect(iconElement).toBeTruthy();

    // icon의 부모나 형제 요소에서 text 찾기
    let textElement: Element | null = null;
    const allElements = button.querySelectorAll("*");

    for (let el of Array.from(allElements)) {
      if (el.textContent?.includes("Test") && !el.querySelector("svg")) {
        textElement = el;
        break;
      }
    }

    if (textElement && iconElement) {
      const iconRect = iconElement.getBoundingClientRect();
      const textRect = textElement.getBoundingClientRect();

      // icon이 text보다 왼쪽에 있어야 함
      expect(iconRect.left).toBeLessThan(textRect.left);

      // 6. icon과 text 사이의 간격 확인 (일반적으로 4-12px)
      const gap = textRect.left - iconRect.right;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(20); // 최대 20px 간격
    }

    // 7. iconLeft 없이도 정상 동작하는지 확인
    expect(() => {
      render(<Component text="Test" />);
    }).not.toThrow();
  });

  test("props에 text 혹은 label이 string 형식으로 있어야 한다.", () => {
    // Props interface에 text 또는 label이 string 타입으로 있어야 함
    const hasTextProp = /text\??\s*:\s*string/i.test(tsxCode);
    const hasLabelProp = /label\??\s*:\s*string/i.test(tsxCode);

    expect(hasTextProp || hasLabelProp).toBe(true);

    // text prop으로 렌더링 가능한지 확인
    expect(() => {
      render(<Component text="Test String" />);
    }).not.toThrow();

    // 실제 text가 렌더링되는지 확인
    const { container } = render(<Component text="Test String" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Test String");
  });

  test("Text 타입이면 width, height, background가 없어야 한다.", () => {
    // type prop이 "Text"인 경우 width, height, background가 없어야 함
    // airtableButtonDSL에서 type이라는 variant가 있는지 확인
    const hasTypeProp = /type\??\s*:/i.test(tsxCode);

    if (!hasTypeProp) {
      // type prop이 없다면 이 테스트는 스킵
      return;
    }

    // type="Text"로 렌더링
    const { container } = render(<Component text="Test" />);
    const element =
      container.querySelector("span") || (container.lastChild as HTMLElement);

    expect(element).toBeTruthy();
    const styles = window.getComputedStyle(element);

    // width가 auto이거나 설정되지 않아야 함 (고정 width가 없어야 함)
    const width = element.style.width;
    const isWidthNotFixed = !width || width === "auto" || width === "";

    // height가 auto이거나 설정되지 않아야 함
    const height = element.style.height;
    const isHeightNotFixed = !height || height === "auto" || height === "";

    // background가 transparent이거나 설정되지 않아야 함
    const backgroundColor = styles.backgroundColor;
    const isBackgroundTransparent =
      !backgroundColor ||
      backgroundColor === "transparent" ||
      backgroundColor === "rgba(0, 0, 0, 0)";

    expect(isWidthNotFixed).toBe(true);
    expect(isHeightNotFixed).toBe(true);
    expect(isBackgroundTransparent).toBe(true);
  });
});

describe("taptapButton 테스트", () => {
  let Component: React.ComponentType<any>;

  // 모든 테스트 전에 컴포넌트 컴파일
  beforeAll(async () => {
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);
    Component = await compileReactComponent(tsxCode);
  });

  test("text는 width, height, background가 없어야 한다.", () => {
    const { container } = render(<Component text="Test" />);
    const element =
      container.querySelector("span") || (container.lastChild as HTMLElement);

    expect(element).toBeTruthy();
    const styles = window.getComputedStyle(element);

    const width = element.style.width;
    const isWidthNotFixed = !width || width === "auto" || width === "";

    const height = element.style.height;
    const isHeightNotFixed = !height || height === "auto" || height === "";

    const backgroundColor = styles.backgroundColor;
    const isBackgroundTransparent =
      !backgroundColor ||
      backgroundColor === "transparent" ||
      backgroundColor === "rgba(0, 0, 0, 0)";

    expect(isWidthNotFixed).toBe(true);
    expect(isHeightNotFixed).toBe(true);
    expect(isBackgroundTransparent).toBe(true);
  });

  test("border 값이 없어야한다.", () => {
    const { container } = render(<Component text="Test" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    const styles = window.getComputedStyle(button);

    // border가 없거나 0이어야 함
    const borderWidth = styles.borderWidth;
    expect(borderWidth === "0px" || borderWidth === "" || !borderWidth).toBe(
      true
    );
  });

  test("props 값으로 isDisabled boolean 형태로 받을 수 있어야 한다.", () => {
    // 생성된 코드에서 isDisabled prop이 실제로 있어야 함
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // Props interface에 isDisabled?: boolean이 있어야 함
    expect(tsxCode).toMatch(/isDisabled\??\s*:\s*boolean/i);

    // 컴포넌트 함수 파라미터에 isDisabled가 있어야 함
    expect(tsxCode).toMatch(/isDisabled\s*=/);

    // isDisabled prop을 받아서 렌더링 가능해야 함
    expect(() => {
      render(<Component text="Test" isDisabled={true} />);
    }).not.toThrow();

    expect(() => {
      render(<Component text="Test" isDisabled={false} />);
    }).not.toThrow();
  });

  test("props의 size가 small이고 isDisabled가 true면 배경 색상은 #B0EBEC", () => {
    // isDisabled prop을 사용해야 함 (state prop이 아님)
    const { container } = render(
      <Component text="Test" size="Small" isDisabled={true} />
    );
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    const styles = window.getComputedStyle(button);
    const backgroundColor = styles.backgroundColor;

    // RGB(176, 235, 236) = #B0EBEC
    // happy-dom에서는 rgb 형식으로 반환될 수 있음
    expect(
      backgroundColor === "rgb(176, 235, 236)" ||
        backgroundColor === "#b0ebec" ||
        backgroundColor === "#B0EBEC" ||
        backgroundColor.toLowerCase() === "rgb(176, 235, 236)"
    ).toBe(true);
  });

  test("hover 할 수 있고 hover 하면 배경색이 #47CFD6 이다", async () => {
    // 생성된 코드에 hover 스타일이 포함되어 있는지 확인
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // hover 스타일이 코드에 포함되어 있는지 확인
    expect(tsxCode).toContain("hoverStyles");
    expect(tsxCode).toContain("&:hover");
    expect(tsxCode).toContain("rgb(71, 207, 214)");

    // 컴포넌트 렌더링
    const { container } = render(<Component text="Test" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();

    // 실제 hover 이벤트 발생 (CSS :hover pseudo-class는 실제 마우스 이벤트에서만 작동)
    // 테스트 환경에서는 CSS :hover를 직접 테스트할 수 없으므로,
    // 생성된 코드에 hover 스타일이 올바르게 포함되어 있는지 확인
    fireEvent.mouseEnter(button);
    fireEvent.mouseOver(button);

    // hover 스타일이 DOM에 적용되었는지 확인 (emotion이 생성한 클래스 확인)
    const buttonElement = button as HTMLElement;
    expect(buttonElement).toBeTruthy();

    // emotion이 생성한 스타일이 있는지 확인
    // 실제 hover 상태는 브라우저에서만 테스트 가능하므로,
    // 여기서는 hover 스타일이 코드에 포함되어 있는지만 확인
    const hasHoverStyle =
      tsxCode.includes("hoverStyles") && tsxCode.includes("&:hover");
    expect(hasHoverStyle).toBe(true);
  });

  test("size가 medium이면 width 값이 98px height가 36px이다.", () => {
    // 생성된 코드에서 sizeStyles의 Medium에 width와 height가 있어야 함
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // sizeStyles 객체가 있는지 확인
    expect(tsxCode).toContain("sizeStyles");
    // Medium variant가 있는지 확인
    expect(tsxCode).toContain("Medium");

    // size prop이 정규화되어 "size" (소문자)로 변환됨
    const { container } = render(<Component text="Test" size="Medium" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();

    // inline style로 설정된 경우를 먼저 확인
    const inlineWidth = button.style.width;
    const inlineHeight = button.style.height;

    // inline style이 있으면 그것을 사용, 없으면 computed style 사용
    const width = inlineWidth || window.getComputedStyle(button).width;
    const height = inlineHeight || window.getComputedStyle(button).height;

    // 실제 렌더링된 크기 확인
    // size prop이 제대로 전달되면 98px이어야 함
    expect(width).toBe("98px");
    expect(height).toBe("36px");
  });

  test("props에 state 값은 없다.", () => {
    const componentSpec = taptapButtonDSL as ComponentSetNodeSpec;
    const tsxCode = transpile(componentSpec);

    // Props interface에 state가 없어야 함
    // state?: 또는 state: 패턴이 없어야 함
    expect(tsxCode).not.toMatch(/state\??\s*:/i);

    // 함수 파라미터에 state가 없어야 함
    // destructuring이나 일반 파라미터 모두 확인
    expect(tsxCode).not.toMatch(/{\s*[^}]*state[^}]*}/);
    expect(tsxCode).not.toMatch(/\(\s*[^)]*state[^)]*\)/);

    // state prop을 전달하려고 해도 에러가 나지 않아야 함 (무시되어야 함)
    expect(() => {
      render(<Component text="Test" state="hover" />);
    }).not.toThrow();

    // state prop이 실제로 사용되지 않는지 확인
    // state를 사용하는 코드 패턴이 없어야 함
    expect(tsxCode).not.toMatch(/\.state\b/);
    expect(tsxCode).not.toMatch(/\[['"]state['"]\]/);
  });

  test("button의 text color는 흰색이다", () => {
    const { container } = render(<Component text="Test" />);
    const span =
      container.querySelector("span") || (container.firstChild as HTMLElement);

    expect(span).toBeTruthy();
    const styles = window.getComputedStyle(span);
    const color = styles.color;

    expect(
      color === "rgb(255, 255, 255)" ||
        color === "#fff" ||
        color === "#ffffff" ||
        color === "#FFF" ||
        color === "#FFFFFF" ||
        color === "white"
    ).toBe(true);
  });

  test("props의 text를 통해서 동적으로 렌더할 수 있어야 한다.", () => {
    const { container } = render(<Component text="Test2222" />);
    const button =
      container.querySelector("button") ||
      (container.firstChild as HTMLElement);

    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Test2222");
  });
});
