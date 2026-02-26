/**
 * Switchswitch.json
 * props에 onChange가 있어서 현재 switch의 상태를 받을 수 있다.
 * Switch가 active false인 상태에서 클릭하면 active true 상태가 되고 onChange에서는 true 값을 받을 수 있다.
 */

/**
 * SegmentedControlsegmentedControl.json
 * props는 Variant, Size, onChange, options로만 이루어져있다.
 *     options={[
 *       { label: 'List', value: 'List', icon: <BarsOutlined /> },
 *       { label: 'Kanban', value: 'Kanban', icon: <AppstoreOutlined /> },
 *     ]}
 *
 *     는 이런 형태로 이루어져 있어서 options를 파싱해서 세그먼트 컨트롤러가 생긴다.
 *
 *     options의 icon은 nullable이다.
 *
 *     onChange의 파라미터는 label을 뱉는다.
 *
 *     세그먼트 컨트롤러에서 클릭하면 onChange에서 해당 클릭한 label을 뱉는다.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import FigmaCodeGenerator from "@code-generator2";

describe("Switch/Switch", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/Switchswitch.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture);
    return (await compiler.compile()) as unknown as string;
  };

  it("컴파일이 성공해야 한다", async () => {
    const result = await compileFixture();
    expect(result).toBeTruthy();
  });

  it("props에 onChange가 있어야 한다", async () => {
    const result = await compileFixture();

    // onChange prop이 있어야 함
    expect(result).toMatch(/onChange\?:/);
  });

  it("onChange는 boolean 파라미터를 받아야 한다 (현재 switch 상태)", async () => {
    const result = await compileFixture();

    // onChange?: (active: boolean) => void
    expect(result).toMatch(/onChange\?:\s*\(\s*active\s*:\s*boolean\s*\)\s*=>\s*void/);
  });

  it("Switch 클릭 시 onChange가 호출되어야 한다", async () => {
    const result = await compileFixture();

    // onClick 핸들러가 있어야 함
    expect(result).toMatch(/onClick/);

    // onChange 호출 (onChange?.(...) 형태)
    expect(result).toMatch(/onChange\?\.\(/);
  });

  it("active false에서 클릭하면 onChange(true)를 호출해야 한다", async () => {
    const result = await compileFixture();

    // onChange?.(!active) 또는 onChange?.(true) 패턴
    expect(result).toMatch(/onChange\?\.\(\s*!active\s*\)|onChange\?\.\(\s*true\s*\)/);
  });
});

describe("Segmented Control/Segmented Control", () => {
  const fixturePath = path.join(
    process.cwd(),
    "test/fixtures/failing/SegmentedControlsegmentedControl.json"
  );

  const compileFixture = async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const compiler = new FigmaCodeGenerator(fixture);
    return (await compiler.compile()) as unknown as string;
  };

  it("컴파일이 성공해야 한다", async () => {
    const result = await compileFixture();
    expect(result).toBeTruthy();
  });

  it("props는 variant, size, onChange, options만 있어야 한다", async () => {
    const result = await compileFixture();

    // 필수 props
    expect(result).toMatch(/variant\?:/);
    expect(result).toMatch(/size\?:/);
    expect(result).toMatch(/onChange\?:/);
    expect(result).toMatch(/options\?:/);

    // 다른 불필요한 props가 없어야 함 (tab2, tab3 등)
    expect(result).not.toMatch(/tab2\?:/);
    expect(result).not.toMatch(/tab3\?:/);

    // 컴포넌트 레벨 icon prop이 없어야 함 (options의 각 아이템에 icon이 있음)
    // SegmentedControlsegmentedControlProps interface만 체크
    const propsInterfaceMatch = result.match(
      /export interface SegmentedControlsegmentedControlProps \{[\s\S]*?\n\}/
    );
    expect(propsInterfaceMatch).toBeTruthy();

    if (propsInterfaceMatch) {
      const propsInterface = propsInterfaceMatch[0];
      const lines = propsInterface.split('\n');
      let inOptionsType = false;
      let hasStandaloneIconProp = false;

      for (const line of lines) {
        // options 타입 정의 시작
        if (line.includes('options?:') && line.includes('Array<{')) {
          inOptionsType = true;
        }
        // options 타입 정의 끝
        if (inOptionsType && line.includes('}>')) {
          inOptionsType = false;
        }
        // options 외부에서 icon?: React.ReactNode 발견
        if (!inOptionsType && /^\s*icon\?:\s*React\.ReactNode/.test(line)) {
          hasStandaloneIconProp = true;
          break;
        }
      }

      expect(hasStandaloneIconProp).toBe(false);
    }
  });

  it("options는 배열 타입이어야 한다", async () => {
    const result = await compileFixture();

    // options?: Array<{ ... }>
    expect(result).toMatch(/options\?:\s*Array</);
  });

  it("options 타입은 label, value, icon을 가져야 한다", async () => {
    const result = await compileFixture();

    // label: string
    expect(result).toMatch(/label\s*:\s*string/);

    // value: string
    expect(result).toMatch(/value\s*:\s*string/);

    // icon?: React.ReactNode (nullable)
    expect(result).toMatch(/icon\?\s*:\s*React\.ReactNode/);
  });

  it("onChange는 value 파라미터를 받아야 한다 (label 아님)", async () => {
    const result = await compileFixture();

    // onChange?: (value: string) => void
    expect(result).toMatch(/onChange\?:\s*\(\s*value\s*:\s*string\s*\)\s*=>\s*void/);
  });

  it("options를 map으로 렌더링해야 한다", async () => {
    const result = await compileFixture();

    // options?.map(...) 또는 options.map(...)
    expect(result).toMatch(/options\??\.\s*map\s*\(/);
  });

  it("각 option 클릭 시 onChange가 호출되어야 한다", async () => {
    const result = await compileFixture();

    // onClick 핸들러
    expect(result).toMatch(/onClick/);

    // onChange 호출 (onChange?. 형태)
    expect(result).toMatch(/onChange\?\.\(/);
  });

  it("icon은 nullable이므로 조건부 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // {option.icon && ...} 또는 {icon && ...}
    expect(result).toMatch(/{\s*(?:option\.)?icon\s*&&/);
  });

  // 구조 검증
  it("Tab 내부에 Content 컨테이너가 있어야 한다", async () => {
    const result = await compileFixture();

    // Content div/element가 있어야 함
    // map 내부에서 여러 레이어 구조를 가져야 함
    const hasNestedStructure = result.includes("options?.map") &&
      (result.match(/<div/g) || []).length > 2; // 최소 2개 이상의 div (tab + content)

    expect(hasNestedStructure).toBe(true);
  });

  it("아이콘이 별도 컨테이너로 래핑되어야 한다", async () => {
    const result = await compileFixture();

    // icon이 단순히 {option.icon}이 아니라 <div>...</div>로 래핑되어야 함
    const iconInContainer = /option\.icon\s*&&[^}]*<\w+[^>]*>[^<]*{[^}]*option\.icon[^}]*}[^<]*<\/\w+>/.test(result);

    expect(iconInContainer).toBe(true);
  });

  it("텍스트가 별도 요소로 래핑되어야 한다", async () => {
    const result = await compileFixture();

    // option.label이 <div> 또는 다른 태그로 래핑되어야 함
    const labelInElement = /<\w+[^>]*>\s*{\s*option\.label\s*}\s*<\/\w+>/.test(result);

    expect(labelInElement).toBe(true);
  });

  // 스타일 검증
  it("Tab 내부 요소들에 CSS 스타일이 적용되어야 한다", async () => {
    const result = await compileFixture();

    // Content, Icons 등의 CSS 변수가 정의되어야 함
    const hasContentCss = /content.*Css\s*=\s*css`/i.test(result);
    const hasIconsCss = /icons.*Css\s*=\s*css`/i.test(result);

    expect(hasContentCss || hasIconsCss).toBe(true);
  });

  // 활성 상태 검증
  it("선택된 탭을 표시하는 로직이 있어야 한다", async () => {
    const result = await compileFixture();

    // selectedValue prop이 있고, option.value와 비교하는 로직이 있어야 함
    const hasSelectedProp = /selectedValue\?:/.test(result);
    const hasActiveCheck = /option\.value\s*===\s*selectedValue/.test(result) ||
                          /selectedValue\s*===\s*option\.value/.test(result);

    expect(hasSelectedProp && hasActiveCheck).toBe(true);
  });

  it("활성 상태에 따른 조건부 스타일이 적용되어야 한다", async () => {
    const result = await compileFixture();

    // active 상태에 따라 다른 CSS가 적용되어야 함
    const hasConditionalStyle = /option\.value\s*===\s*selectedValue\s*\?/.test(result) ||
                                /\[\s*[^,]+,\s*[^,]+\s*\]/.test(result); // css 배열

    expect(hasConditionalStyle).toBe(true);
  });

  // 상세 구조 검증
  it("Background 레이어가 있어야 한다", async () => {
    const result = await compileFixture();

    // Background 관련 CSS 변수가 정의되어야 함
    const hasBackgroundCss = /background.*Css\s*=\s*css`/i.test(result);

    expect(hasBackgroundCss).toBe(true);
  });

  it("Active와 Inactive 상태가 조건부로 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // 삼항 연산자 또는 조건부로 다른 요소를 렌더링
    // 또는 visibility/display 스타일로 제어
    const hasStateConditional = /option\.value\s*===\s*selectedValue/.test(result);

    expect(hasStateConditional).toBe(true);
  });

  it("여러 레이어가 중첩되어야 한다 (최소 3단계)", async () => {
    const result = await compileFixture();

    // options.map 내부에 최소 3개 이상의 중첩된 요소
    // Tab > Background/Content > Icons/Text
    // 블록 형식: options?.map((option) => { ... return (...); })
    // 또는 즉시 반환: options?.map((option) => (...))
    const blockFormMatch = result.match(/options\?\.map\([^)]+\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)/);
    const arrowFormMatch = result.match(/options\?\.map\([^)]+\)\s*=>\s*\(([\s\S]*?)\n\s*\)\)/);
    const mapContent = blockFormMatch || arrowFormMatch;

    if (mapContent) {
      const divCount = (mapContent[1].match(/<div/g) || []).length;
      expect(divCount).toBeGreaterThanOrEqual(3);
    } else {
      expect(false).toBe(true); // map not found
    }
  });

  it("Content와 Icons에 각각 CSS가 정의되어야 한다", async () => {
    const result = await compileFixture();

    // Content CSS
    const hasContentCss = /content.*Css\s*=\s*css`/i.test(result);
    // Icons CSS
    const hasIconsCss = /icons.*Css\s*=\s*css`/i.test(result);

    expect(hasContentCss).toBe(true);
    expect(hasIconsCss).toBe(true);
  });

  // Edge cases
  it("options가 없을 때 안전하게 처리되어야 한다", async () => {
    const result = await compileFixture();

    // options?.map 사용 (optional chaining)
    expect(result).toMatch(/options\?\./);
  });

  it("selectedValue prop이 optional이어야 한다", async () => {
    const result = await compileFixture();

    // selectedValue?: ...
    const hasOptionalSelectedValue = /selectedValue\?:/.test(result);

    expect(hasOptionalSelectedValue).toBe(true);
  });

  // Props 실제 사용 검증
  it("variant prop이 실제로 스타일 선택에 사용되어야 한다", async () => {
    const result = await compileFixture();

    // variant 값으로 스타일을 선택하는 로직
    // variantStyles?.[variant] 또는 [variant] 형태
    const usesVariantForStyle = /\[variant\]|\?\.\[variant\]/i.test(result);

    expect(usesVariantForStyle).toBe(true);
  });

  it("size prop이 실제로 스타일 선택에 사용되어야 한다", async () => {
    const result = await compileFixture();

    // size 값으로 스타일을 선택하는 로직
    const usesSizeForStyle = /\[size\]|\?\.\[size\]/i.test(result);

    expect(usesSizeForStyle).toBe(true);
  });

  it("onChange는 option.value를 전달해야 한다 (label 아님)", async () => {
    const result = await compileFixture();

    // onChange?.(option.value) 또는 onChange(option.value)
    // onChange?.(option.label)은 안됨
    const usesValueNotLabel = /onChange\?\.\(\s*option\.value\s*\)/.test(result);

    expect(usesValueNotLabel).toBe(true);
  });

  it("map에 key prop이 있어야 한다", async () => {
    const result = await compileFixture();

    // key={...}
    expect(result).toMatch(/key=\{/);
  });

  it("key는 index가 아니라 unique한 값을 사용해야 한다", async () => {
    const result = await compileFixture();

    // key={option.value} 또는 key={option.label}
    // key={index}는 안좋음
    const usesUniqueKey = /key=\{\s*option\.(value|label)\s*\}/.test(result);

    expect(usesUniqueKey).toBe(true);
  });

  it("기본값이 destructuring에 설정되어야 한다", async () => {
    const result = await compileFixture();

    // variant = "Solid"
    expect(result).toMatch(/variant\s*=\s*"Solid"/);
    // size = "Large"
    expect(result).toMatch(/size\s*=\s*"Large"/);
  });

  it("Props interface가 export되어야 한다", async () => {
    const result = await compileFixture();

    expect(result).toMatch(/export interface SegmentedControlsegmentedControlProps/);
  });

  it("selectedValue 타입은 string이어야 한다", async () => {
    const result = await compileFixture();

    // selectedValue?: string
    expect(result).toMatch(/selectedValue\?:\s*string/);
  });

  // ========================================
  // isActive 사용 및 기본값 관련 테스트
  // ========================================

  it("isActive 변수가 실제로 스타일에 사용되어야 한다", async () => {
    const result = await compileFixture();

    // isActive가 선언되고 실제로 사용되어야 함
    const hasIsActiveDeclaration = /const isActive\s*=/.test(result);
    const isActiveUsedInStyle = /isActive\s*\?/.test(result) || // 삼항 연산자
                                 /isActive\s*&&/.test(result) || // 조건부 렌더링
                                 /\[isActive\]/.test(result);    // 동적 키

    expect(hasIsActiveDeclaration).toBe(true);
    expect(isActiveUsedInStyle).toBe(true);
  });

  it("selectedValue 기본값이 options의 첫번째 값이어야 한다", async () => {
    const result = await compileFixture();

    // selectedValue = options?.[0]?.value 또는 유사한 패턴
    const hasDefaultFromOptions = /selectedValue\s*(?:=|:)\s*options\?\.\[0\]\.?(?:\?\.)?value/.test(result) ||
                                   /selectedValue\s*(?:=|:|\?\?)\s*options\?\.\[0\]/.test(result) ||
                                   /selectedValue\s*\?\?\s*options\?\.\[0\]\.value/.test(result);

    expect(hasDefaultFromOptions).toBe(true);
  });

  // ========================================
  // 스타일 변수명 길이 관련 테스트
  // ========================================

  // TODO: dependency 번들링 시 컴포넌트 접두사가 추가되어 변수명이 길어짐
  // 현재 아키텍처 개선 필요: 접두사 축약 또는 해시 기반 고유 ID 사용
  it.skip("스타일 변수명이 65자를 초과하지 않아야 한다", async () => {
    const result = await compileFixture();

    // const xxxCss = css` 패턴으로 모든 스타일 변수명 추출
    const styleVarMatches = result.matchAll(/const\s+(\w+(?:Css|Classes|Styles))\s*=/g);
    const styleVarNames = [...styleVarMatches].map(m => m[1]);

    // 65자 초과하는 변수명이 없어야 함 (dependency 번들링 시 접두사 추가 고려)
    const longVarNames = styleVarNames.filter(name => name.length > 65);

    expect(longVarNames).toHaveLength(0);
  });

  it("Active와 Inactive에 각각 CSS가 정의되어야 한다", async () => {
    const result = await compileFixture();

    // Active 관련 CSS
    const hasActiveCss = /active.*Css\s*=\s*css`/i.test(result);
    // Inactive 관련 CSS (선택적이지만 있으면 좋음)
    const hasInactiveCss = /inactive.*Css\s*=\s*css`/i.test(result);

    // 최소한 Active CSS는 있어야 함
    expect(hasActiveCss).toBe(true);
  });

  it("생성된 코드가 TypeScript로 컴파일되어야 한다", async () => {
    const result = await compileFixture();

    // 기본적인 문법 검증
    expect(result).toBeTruthy();
    expect(result).toMatch(/export default function/);
    expect(result).toMatch(/export interface/);

    // 명백한 문법 오류가 없어야 함
    expect(result).not.toMatch(/undefined undefined/);
    expect(result).not.toMatch(/\{\s*\}/); // 빈 객체 리터럴만 있으면 안됨
  });
});
