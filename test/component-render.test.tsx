// /// <reference types="@testing-library/jest-dom" />
// import { describe, test, expect } from "vitest";
// import { render, screen } from "@testing-library/react";
// import React from "react";
// import { generateReactCode } from "./utils/test-helpers";
// import { compileReactComponent } from "../src/ui/utils/component-compiler";
//
// /**
//  * 생성된 컴포넌트를 실제로 렌더링해서 DOM 검증
//  *
//  * 테스트 목적:
//  * 1. 생성된 코드가 실제로 실행 가능한지
//  * 2. DOM에 올바르게 렌더링되는지
//  * 3. Props가 제대로 적용되는지
//  * 4. 스타일이 올바르게 적용되는지
//  */
// describe("Component Runtime 렌더링 테스트", () => {
//   describe("기본 렌더링", () => {
//     test("생성된 버튼 컴포넌트가 렌더링됨", async () => {
//       const spec = require("./fixtures/aws-button.json");
//
//       const result = await generateReactCode(spec);
//       const Component = compileReactComponent(result.code);
//
//       render(<Component text="Click me" />);
//
//       expect(screen.getByRole("button")).toBeInTheDocument();
//       expect(screen.getByText("Click me")).toBeInTheDocument();
//     });
//   });
// });
