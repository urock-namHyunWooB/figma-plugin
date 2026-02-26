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

  it("onChange는 label 파라미터를 받아야 한다", async () => {
    const result = await compileFixture();

    // onChange?: (label: string) => void
    expect(result).toMatch(/onChange\?:\s*\(\s*label\s*:\s*string\s*\)\s*=>\s*void/);
  });

  it("options를 map으로 렌더링해야 한다", async () => {
    const result = await compileFixture();

    // options?.map(...) 또는 options.map(...)
    expect(result).toMatch(/options\??\.\s*map\s*\(/);
  });

  it("각 option 클릭 시 onChange(label)을 호출해야 한다", async () => {
    const result = await compileFixture();

    // onClick 핸들러
    expect(result).toMatch(/onClick/);

    // onChange 호출 시 label 전달 (onChange?.(label) 형태)
    expect(result).toMatch(/onChange\?\.\(\s*(?:option\.)?label\s*\)/);
  });

  it("icon은 nullable이므로 조건부 렌더링되어야 한다", async () => {
    const result = await compileFixture();

    // {option.icon && ...} 또는 {icon && ...}
    expect(result).toMatch(/{\s*(?:option\.)?icon\s*&&/);
  });
});
