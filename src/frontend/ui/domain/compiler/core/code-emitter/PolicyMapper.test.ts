/**
 * PolicyMapper Tests
 */

import { describe, it, expect } from "vitest";
import { mapPolicy, createDefaultPolicy } from "./PolicyMapper";
import type { CodeEmitterPolicy } from "@compiler/types/architecture";

describe("PolicyMapper", () => {
  describe("mapPolicy", () => {
    it("should map emotion strategy", () => {
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "emotion",
      };

      const result = mapPolicy(policy);

      expect(result.styleStrategy).toEqual({ type: "emotion" });
      expect(result.debug).toBe(false);
    });

    it("should map tailwind strategy with defaults", () => {
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "tailwind",
      };

      const result = mapPolicy(policy);

      expect(result.styleStrategy).toEqual({
        type: "tailwind",
        tailwind: {
          inlineCn: true,
          useArbitraryValues: true,
        },
      });
    });

    it("should default to emotion for unknown strategies", () => {
      const policy: CodeEmitterPolicy = {
        platform: "react",
        styleStrategy: "unknown-strategy" as any,
      };

      const result = mapPolicy(policy);

      expect(result.styleStrategy).toEqual({ type: "emotion" });
    });
  });

  describe("createDefaultPolicy", () => {
    it("should create default policy with React and Emotion", () => {
      const result = createDefaultPolicy();

      expect(result).toEqual({
        platform: "react",
        styleStrategy: "emotion",
      });
    });
  });
});
