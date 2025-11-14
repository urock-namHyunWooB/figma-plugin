import { describe, test, expect } from "vitest";
import {
  generateReactCode,
  validateGeneratedCode,
  findInCode,
} from "./utils/test-helpers";

import awsButtonSpec from "./fixtures/aws-button.json";

describe("Wasm Engine", () => {
  describe("리액트 제너레이터 테스트", () => {
    test("AWS Button: 모든 필수 요소 포함", async () => {
      const result = await generateReactCode(awsButtonSpec);
      console.log(result.code);
      const validation = validateGeneratedCode(result.code);

      expect(validation.hasInterface).toBe(true);
      expect(validation.hasFunction).toBe(true);
      expect(validation.hasStyles).toBe(true);
    });
  });
});
