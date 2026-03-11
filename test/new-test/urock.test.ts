import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

/**
 * urock-button 컴파일 테스트
 *
 * 기대 스펙:
 * - props에는 타입값이 적용되어 있어야 한다.
 * - iconLeft는 하나만 있어야 한다.
 * - iconRight는 하나만 있어야 한다.
 * - text prop은 하나여야 한다.
 * - btnCss_customTypeStyles 스타일이 적용되어야 한다.
 * - btnCss_customTypeStyles에 variant 값 받아서 적용되어야 한다.
 * - 사용되지 않을 불필요한 style은 생성되지 않아야 한다.
 */
describe("urock-button", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/button/urockButton.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("props에는 타입값이 적용되어 있어야 한다", async () => {
    const result = await compileFixture();

    // size는 union type이어야 함
    expect(result).toMatch(/size\?:\s*"L"\s*\|\s*"M"\s*\|\s*"S"/);

    // customType은 union type이어야 함
    expect(result).toMatch(/customType\?:/);
    expect(result).toMatch(/"filled"/);
    expect(result).toMatch(/"outlined_black"/);
    expect(result).toMatch(/"outlined_blue"/);
    expect(result).toMatch(/"text"/);

    // iconLeft, iconRight는 React.ReactNode
    expect(result).toMatch(/iconLeft\?:\s*React\.ReactNode/);
    expect(result).toMatch(/iconRight\?:\s*React\.ReactNode/);
  });

  it("iconLeft는 JSX에서 하나만 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // JSX 영역에서 {iconLeft} 출현 횟수 카운트
    const iconLeftMatches = result.match(/\{iconLeft\}/g);
    expect(iconLeftMatches).toBeTruthy();
    expect(iconLeftMatches!.length).toBe(1);
  });

  it("iconRight는 JSX에서 하나만 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // JSX 영역에서 {iconRight} 출현 횟수 카운트
    const iconRightMatches = result.match(/\{iconRight\}/g);
    expect(iconRightMatches).toBeTruthy();
    expect(iconRightMatches!.length).toBe(1);
  });

  it("text prop은 하나여야 한다", async () => {
    const result = await compileFixture();

    // interface에서 text 관련 prop 추출
    const interfaceMatch = result.match(
      /interface\s+\w+Props\s*\{([^}]+)\}/s
    );
    expect(interfaceMatch).toBeTruthy();

    const interfaceBody = interfaceMatch![1];

    // text 또는 buttonText 중 하나만 있어야 함 (둘 다 있으면 안 됨)
    const textProps = interfaceBody.match(/\b\w*[Tt]ext\w*\?:/g) || [];
    expect(textProps.length).toBe(1);
  });

  it("btnCss_customTypeStyles 스타일이 JSX에 적용되어야 한다", async () => {
    const result = await compileFixture();

    // btnCss_customTypeStyles가 정의되어야 함
    expect(result).toMatch(/btnCss_customTypeStyles/);

    // JSX에서 customTypeStyles가 사용되어야 함 (optional chaining)
    expect(result).toMatch(/btnCss_customTypeStyles\?\.\[customType\]/);
  });

  it("btnCss_customTypeStyles에 고유 CSS가 있는 customType variant 키들이 있어야 한다", async () => {
    const result = await compileFixture();

    // customTypeStyles 객체에 box-shadow 등 고유 CSS가 있는 variant 키가 있어야 함
    const customTypeStylesMatch = result.match(
      /btnCss_customTypeStyles\s*=\s*\{([\s\S]*?)\n\};/
    );
    expect(customTypeStylesMatch).toBeTruthy();

    const stylesBody = customTypeStylesMatch![1];
    expect(stylesBody).toMatch(/filled:/);
    expect(stylesBody).toMatch(/outlined_black:/);
    expect(stylesBody).toMatch(/outlined_blue:/);
    // text, text-black: box-shadow 없는 텍스트 버튼이므로 고유 CSS 없음 → 미포함이 정상
  });

  it("사용되지 않는 불필요한 style 변수가 생성되지 않아야 한다", async () => {
    const result = await compileFixture();

    // JSX return 부분 추출
    const jsxMatch = result.match(/return\s*\(([\s\S]*)\);\s*\}$/m);
    expect(jsxMatch).toBeTruthy();
    const jsx = jsxMatch![1];

    // 정의된 모든 const 스타일 변수 추출
    const styleVarDefs = result.match(/const\s+(\w+)\s*=\s*(?:css`|\{)/g) || [];
    const definedVars = styleVarDefs.map((m) => m.match(/const\s+(\w+)/)![1]);

    // 각 정의된 변수가 JSX에서 참조되는지 확인
    const unusedVars = definedVars.filter((v) => !jsx.includes(v));
    expect(unusedVars).toEqual([]);
  });

  it("iconLeft는 조건부 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // {iconLeft && ( ... )} 패턴이 있어야 함
    expect(result).toMatch(/\{iconLeft\s*&&\s*\(/);

    // iconLeft wrapper div가 조건부로 렌더링되어야 함
    const iconLeftPattern = /\{iconLeft\s*&&\s*\(\s*<div[\s\S]*?\{iconLeft\}[\s\S]*?<\/div>\s*\)\}/;
    expect(result).toMatch(iconLeftPattern);
  });

  it("iconRight는 조건부 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // {iconRight && ( ... )} 패턴이 있어야 함
    expect(result).toMatch(/\{iconRight\s*&&\s*\(/);

    // iconRight wrapper div가 조건부로 렌더링되어야 함
    const iconRightPattern = /\{iconRight\s*&&\s*\(\s*<div[\s\S]*?\{iconRight\}[\s\S]*?<\/div>\s*\)\}/;
    expect(result).toMatch(iconRightPattern);
  });

  it("slot이 비어있을 때 wrapper div가 렌더링되지 않아야 한다", async () => {
    const result = await compileFixture();

    // JSX 부분 추출
    const jsxMatch = result.match(/return\s*\(([\s\S]*)\);/);
    expect(jsxMatch).toBeTruthy();
    const jsx = jsxMatch![1];

    // 조건부 렌더링 패턴 확인 (iconLeft, iconRight 모두)
    const conditionalSlots = jsx.match(/\{(iconLeft|iconRight)\s*&&\s*\(/g);
    expect(conditionalSlots).toBeTruthy();
    expect(conditionalSlots!.length).toBe(2); // iconLeft, iconRight 2개
  });
});


/**
 * Chips.json 대상
 *
 * props color가 바뀌면 색상이 바뀌어야한다.
 * props에 text를 주입할 수 있어야 한다.
 */
describe("Chips", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/chip/Chips.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("color prop이 variant union 타입으로 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/color\?:/);
    for (const color of ["blue", "cyan", "gray", "navy", "red", "skyblue", "white-black", "white-blue"]) {
      expect(result).toContain(`"${color}"`);
    }
  });

  it("color prop이 스타일에 바인딩되어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/colorStyles\?\.\[color\]/);
  });

  it("text prop이 string 타입으로 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/text\?:\s*string/);
  });

  it("텍스트가 하드코딩이 아닌 prop으로 렌더링되어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/\{text\}/);
  });

  it("colorStyles에 background가 포함되어야 한다 (color별 배경색 변경)", async () => {
    const result = await compileFixture();
    const colorStylesMatch = result.match(
      /colorStyles\s*=\s*\{([\s\S]*?)\n\};/
    );
    expect(colorStylesMatch).toBeTruthy();
    const body = colorStylesMatch![1];
    expect(body).toMatch(/background/);
  });
});

/**
 * Badgesicon.json
 * 레이아웃 잘 렌더링 되어야 한다.
 * props에 숫자를 넣어서 표시 할 수 있어야 한다.
 */
describe("Badgesicon", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/urock/Badgesicon.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("레이아웃이 겹침(overlay)으로 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // 루트에 position: relative
    expect(result).toMatch(/position:\s*relative/);

    // 자식에 position: absolute + left/top
    expect(result).toMatch(/position:\s*absolute/);
    expect(result).toMatch(/left:\s*\d+px/);
    expect(result).toMatch(/top:\s*\d+px/);
  });

  it("count prop이 string 타입으로 있어야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/count\?:\s*string/);
  });

  it("count prop이 의존 컴포넌트에 바인딩으로 전달되어야 한다", async () => {
    const result = await compileFixture();

    // <Badges count={count} /> 형태 (리터럴이 아닌 바인딩)
    expect(result).toMatch(/count=\{count\}/);
  });

  it("불필요한 color override prop이 노출되지 않아야 한다", async () => {
    const result = await compileFixture();

    // BadgesiconProps에 vectorBg, _12Bg 없어야 함
    const propsMatch = result.match(
      /export interface BadgesiconProps\s*\{([^}]*)\}/s
    );
    expect(propsMatch).toBeTruthy();
    const propsBody = propsMatch![1];
    expect(propsBody).not.toMatch(/vectorBg/);
    expect(propsBody).not.toMatch(/_12Bg/);
  });

  it("count prop이 중복 전달되지 않아야 한다", async () => {
    const result = await compileFixture();

    // <Badges ... /> 호출 부분에서 count가 1번만 나와야 함
    const badgesCallMatch = result.match(/<Badges[^/]*\/>/);
    expect(badgesCallMatch).toBeTruthy();
    const countOccurrences = (badgesCallMatch![0].match(/count=/g) || []).length;
    expect(countOccurrences).toBe(1);
  });
});

/**
 * Dropdowngeneric.json
 *
 * prop에 label을 주입받을 수 있다.
 * placeholder도 주입받을 수 있다.
 * Dropdown이므로 해당 드랍다운을 클릭하면 리스트로 나타내질 아이템들을 prop으로 주입 받을 수 있다.
 * 드랍다운을 클릭하면 아래 리스트가 노출된다.
 * 호버하면 states=hover일때의 스타일이 된다.
 */
describe("Dropdowngeneric", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/urock/Dropdowngeneric.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  // ── label prop ──

  it("label prop이 string 타입으로 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/label\?:\s*string/);
  });

  it("label이 prop으로 렌더링되어야 한다 (하드코딩 X)", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/\{label\}/);
    // "label" 리터럴이 JSX에 하드코딩되면 안 됨
    const jsxMatch = result.match(/return\s*\(([\s\S]*)\);/);
    expect(jsxMatch).toBeTruthy();
    // JSX 내에서 >label< 하드코딩이 없어야 함 (css 변수명 제외)
  });

  // ── placeholder prop ──

  it("placeholder prop이 string 타입으로 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/placeholder\?:\s*string/);
  });

  it("placeholder가 prop으로 렌더링되어야 한다 (하드코딩 X)", async () => {
    const result = await compileFixture();
    // selectedValue || placeholder 표현식 또는 {placeholder} 직접 참조
    expect(result).toMatch(/selectedValue\s*\|\|\s*placeholder|{placeholder}/);
  });

  // ── items prop ──

  it("items prop이 배열 타입이어야 한다", async () => {
    const result = await compileFixture();
    // items?: Array<{id: ..., content: ...}> 또는 items?: {id: ..., content: ...}[]
    expect(result).toMatch(/items\?:/);
  });

  it("리스트 아이템이 items.map으로 렌더링되어야 한다", async () => {
    const result = await compileFixture();
    // items.map(item => ...) 패턴
    expect(result).toMatch(/items\.map/);
  });

  // ── open/close 토글 ──

  it("내부 useState로 open 상태를 관리해야 한다", async () => {
    const result = await compileFixture();
    // useState 훅 사용
    expect(result).toMatch(/useState/);
    // open 상태 변수
    expect(result).toMatch(/\bopen\b/);
  });

  it("클릭하면 리스트가 토글되어야 한다", async () => {
    const result = await compileFixture();
    // onClick 핸들러가 있어야 함
    expect(result).toMatch(/onClick/);
  });

  it("리스트가 open 상태일 때만 렌더링되어야 한다", async () => {
    const result = await compileFixture();
    // {open && (...)} 조건부 렌더링 패턴
    expect(result).toMatch(/\{open\s*&&/);
  });

  // ── onChange 콜백 ──

  it("onChange 콜백 prop이 있어야 한다", async () => {
    const result = await compileFixture();
    // onChange?: (value: string) => void
    expect(result).toMatch(/onChange\?:\s*\(value:\s*string\)\s*=>\s*void/);
  });

  it("아이템 클릭 시 onChange가 호출되어야 한다", async () => {
    const result = await compileFixture();
    // onChange?.(item.content)
    expect(result).toMatch(/onChange\?\.\(item\.content\)/);
  });

  // ── 선택 상태 관리 ──

  it("selectedValue 내부 상태가 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/useState\(""\)/);
    expect(result).toMatch(/selectedValue/);
    expect(result).toMatch(/setSelectedValue/);
  });

  it("아이템 클릭 시 selectedValue가 업데이트되어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/setSelectedValue\(item\.content\)/);
  });

  it("아이템 클릭 시 리스트가 닫혀야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/setOpen\(false\)/);
  });

  it("선택된 값이 trigger에 표시되어야 한다 (placeholder 대체)", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/selectedValue\s*\|\|\s*placeholder/);
  });

  it("선택 후 텍스트 색상이 검정으로 변경되어야 한다", async () => {
    const result = await compileFixture();
    // selectedValue ? "var(--Color-text-03-high, ...)" : undefined
    expect(result).toMatch(/selectedValue\s*\?\s*"var\(--Color-text-03-high/);
  });

  // ── hover 스타일 ──

  it("trigger에 hover border-color가 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/&:hover\s*\{[^}]*border-color/);
  });

  it("리스트 아이템에 hover background가 있어야 한다", async () => {
    const result = await compileFixture();
    // 아이템 래퍼 CSS에 &:hover { background: ... } 존재
    expect(result).toMatch(/cursor:\s*pointer[\s\S]*?&:hover\s*\{[^}]*background/);
  });

  it("hover에서 font-size가 변경되지 않아야 한다 (Size variant 오염 방지)", async () => {
    const result = await compileFixture();
    // &:hover { ... } 블록들에서 font-size가 없어야 함
    const hoverBlocks = result.match(/&:hover\s*\{[^}]*\}/g) || [];
    for (const block of hoverBlocks) {
      expect(block).not.toMatch(/font-size/);
    }
  });

  // ── 아이템 렌더링 품질 ──

  it("아이템에 텍스트 색상이 적용되어야 한다", async () => {
    const result = await compileFixture();
    // 래퍼 CSS에 color: var(--Color-text-03-high, ...) 포함
    expect(result).toMatch(/color:\s*var\(--Color-text-03-high/);
  });

  it("아이템에 padding이 적용되어야 한다", async () => {
    const result = await compileFixture();
    // 래퍼 CSS에 padding: 12px 20px 포함
    expect(result).toMatch(/padding:\s*12px\s*20px/);
  });

  it("items.map에 Array.isArray 가드가 있어야 한다", async () => {
    const result = await compileFixture();
    expect(result).toMatch(/Array\.isArray\(items\)\s*&&\s*items\.map/);
  });

  // ── open 상태 gap ──

  it("open 상태일 때 root gap이 8px로 변경되어야 한다", async () => {
    const result = await compileFixture();
    // openStyles가 정의되어야 함
    expect(result).toMatch(/_openStyles/);
    // JSX css 배열에서 openStyles가 참조되어야 함
    expect(result).toMatch(/css=\{?\[.*_openStyles\?\.\[open\]/s);
  });

  // ── 불필요 prop 미노출 ──

  it("list 1~6 개별 boolean prop이 노출되지 않아야 한다", async () => {
    const result = await compileFixture();
    const propsMatch = result.match(
      /export interface \w+Props\s*\{([^}]*)\}/s
    );
    expect(propsMatch).toBeTruthy();
    const propsBody = propsMatch![1];
    // list1, list2, ... 개별 prop 대신 items 배열이어야 함
    expect(propsBody).not.toMatch(/list\s*\d/);
  });

  // ── states variant prop 미노출 ──

  it("states variant prop이 외부에 노출되지 않아야 한다", async () => {
    const result = await compileFixture();
    const propsMatch = result.match(
      /export interface \w+Props\s*\{([^}]*)\}/s
    );
    expect(propsMatch).toBeTruthy();
    const propsBody = propsMatch![1];
    // states는 내부 동작(hover/:hover, active/open)으로 처리되어야 함
    expect(propsBody).not.toMatch(/\bstates\b/);
  });
});

/**
 * Fab.json
 *
 * FAB(Floating Action Button) 컴포넌트.
 * ELLIPSE + INSTANCE(icon-fab) 구조로, icon-fab은 vector-only 의존 컴포넌트.
 * states=default/hover/active 3가지 variant.
 *
 * - vector-only 의존 컴포넌트가 merged SVG로 인라인되어야 한다.
 * - 아이콘이 올바른 크기로 렌더링되어야 한다 (CSS/SVG 스케일 불일치 없음).
 * - states가 pseudo-class(:hover, :active)로 매핑되어야 한다.
 */
describe("Fab", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/urock/Fab.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture, { strategy: "emotion" });
    return (await compiler.compile()) as unknown as string;
  };

  it("vector-only 의존 컴포넌트(icon-fab)가 인라인 SVG로 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // icon-fab이 별도 컴포넌트로 분리되면 안 됨
    expect(result).not.toMatch(/const Iconfab/);
    expect(result).not.toMatch(/<Iconfab/);

    // 대신 SVG가 직접 포함되어야 함
    expect(result).toContain("<svg");
    expect(result).toContain("<path");
  });

  it("states가 CSS pseudo-class로 매핑되어야 한다", async () => {
    const result = await compileFixture();

    // :hover, :active pseudo-class가 있어야 함
    expect(result).toMatch(/&:hover\s*\{/);
    expect(result).toMatch(/&:active\s*\{/);
  });

  it("states variant prop이 외부에 노출되지 않아야 한다", async () => {
    const result = await compileFixture();

    const propsMatch = result.match(
      /export interface \w+Props\s*\{([^}]*)\}/s
    );
    if (propsMatch) {
      expect(propsMatch[1]).not.toMatch(/\bstates\b/);
    }
  });

  it("ELLIPSE가 SVG로 렌더링되어야 한다", async () => {
    const result = await compileFixture();
    // ELLIPSE는 vector 타입 → SVG로 렌더링 (원형은 SVG viewBox로 표현)
    expect(result).toMatch(/<svg[^>]*viewBox/);
  });

  it("hover/active 시 아이콘 stroke 색상이 변경되어야 한다", async () => {
    const result = await compileFixture();
    // root button에 & > div svg path stroke 변경 CSS (FAB 전체 영역 호버)
    expect(result).toMatch(/&:hover\s*\{\s*& > div svg path\s*\{\s*stroke:/);
    expect(result).toMatch(/&:active\s*\{\s*& > div svg path\s*\{\s*stroke:/);
  });

  it("아이콘 SVG가 컨테이너에 맞게 100% 크기여야 한다", async () => {
    const result = await compileFixture();
    // merged SVG는 width="100%" height="100%"로 변환됨
    expect(result).toMatch(/width="100%"/);
    expect(result).toMatch(/height="100%"/);
  });
});
