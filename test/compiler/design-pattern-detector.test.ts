import { describe, it, expect } from "vitest";
import { DesignPatternDetector } from "@code-generator2/layers/tree-manager/tree-builder/processors/DesignPatternDetector";

const detector = new DesignPatternDetector();

describe("DesignPatternDetector (raw data)", () => {
  describe("alphaMask", () => {
    it("isMask + ALPHA + visible ref → alphaMask pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{
            id: "mask-1", type: "RECTANGLE", name: "Mask",
            isMask: true, maskType: "ALPHA",
            componentPropertyReferences: { visible: "Loading#29474:0" },
            children: [],
          }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({
        type: "alphaMask", nodeId: "mask-1", visibleRef: "Loading#29474:0",
      });
    });

    it("isMask=false → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{
            id: "n1", type: "RECTANGLE", name: "N",
            isMask: false,
            componentPropertyReferences: { visible: "Loading#29474:0" },
            children: [],
          }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "alphaMask")).toHaveLength(0);
    });

    it("no visible ref → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{
            id: "n2", type: "RECTANGLE", name: "N",
            isMask: true, maskType: "ALPHA",
            children: [],
          }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "alphaMask")).toHaveLength(0);
    });

    it("deduplicates across variants", () => {
      const mask = {
        id: "mask-1", type: "RECTANGLE", name: "Mask",
        isMask: true, maskType: "ALPHA",
        componentPropertyReferences: { visible: "Loading#29474:0" },
        children: [],
      };
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [
          { type: "COMPONENT", name: "V1", children: [{ ...mask }] },
          { type: "COMPONENT", name: "V2", children: [{ ...mask }] },
        ],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "alphaMask")).toHaveLength(1);
    });
  });

  describe("interactionFrame", () => {
    it("name=Interaction + type=FRAME → pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{ id: "i-1", type: "FRAME", name: "Interaction", children: [] }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "interactionFrame", nodeId: "i-1" });
    });

    it("type=INSTANCE → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{ id: "i-2", type: "INSTANCE", name: "Interaction", children: [] }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "interactionFrame")).toHaveLength(0);
    });

    it("wrong name → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          children: [{ id: "c1", type: "FRAME", name: "Content", children: [] }],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "interactionFrame")).toHaveLength(0);
    });
  });

  describe("fullCoverBackground", () => {
    it("fills-only child covering parent 99%+ → pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          fills: [],
          children: [
            {
              id: "bg-1", type: "RECTANGLE", name: "BG",
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
              fills: [{ type: "SOLID", visible: true }],
              strokes: [], effects: [], children: [],
            },
            { id: "c-1", type: "FRAME", name: "Content", children: [] },
          ],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "fullCoverBackground", nodeId: "bg-1" });
    });

    it("TEXT node → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          children: [
            { id: "t-1", type: "TEXT", name: "Label", children: [] },
            { id: "c-1", type: "FRAME", name: "Content", children: [] },
          ],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "fullCoverBackground")).toHaveLength(0);
    });

    it("single child → no pattern (not a background, it's content)", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          fills: [],
          children: [
            {
              id: "bg-1", type: "RECTANGLE", name: "BG",
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
              fills: [{ type: "SOLID", visible: true }],
              strokes: [], effects: [], children: [],
            },
          ],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "fullCoverBackground")).toHaveLength(0);
    });

    it("INSTANCE node → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {},
        children: [{
          type: "COMPONENT", name: "Default",
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
          children: [
            {
              id: "i-1", type: "INSTANCE", name: "Icon",
              absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
              fills: [{ type: "SOLID", visible: true }],
              strokes: [], effects: [], children: [],
            },
            { id: "c-1", type: "FRAME", name: "Content", children: [] },
          ],
        }],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "fullCoverBackground")).toHaveLength(0);
    });
  });

  describe("statePseudoClass", () => {
    it("State variant → statePseudoClass pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "State": { type: "VARIANT", variantOptions: ["Default", "Hover", "Active", "Disabled"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({
        type: "statePseudoClass", prop: "state",
        stateMap: { Hover: ":hover", Active: ":active", Disabled: ":disabled" },
      });
    });

    it("States (plural) → statePseudoClass pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "States": { type: "VARIANT", variantOptions: ["Hover", "Focus"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({
        type: "statePseudoClass", prop: "states",
        stateMap: { Hover: ":hover", Focus: ":focus" },
      });
    });

    it("State with #ID suffix → normalized prop name", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "State#12345:0": { type: "VARIANT", variantOptions: ["Default", "Hover"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({
        type: "statePseudoClass", prop: "state",
        stateMap: { Hover: ":hover" },
      });
    });

    it("no State prop → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Size": { type: "VARIANT", variantOptions: ["Large", "Small"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "statePseudoClass")).toHaveLength(0);
    });

    it("State with no CSS-convertible values → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "State": { type: "VARIANT", variantOptions: ["Success", "Error", "Info"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "statePseudoClass")).toHaveLength(0);
    });
  });

  describe("breakpointVariant", () => {
    it("Breakpoint variant → pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Breakpoint": { type: "VARIANT", variantOptions: ["Mobile(xs-sm)", "Desktop(md-lg)"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "breakpointVariant", prop: "breakpoint" });
    });

    it("Device prop name → breakpointVariant pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Device": { type: "VARIANT", variantOptions: ["Mobile", "Desktop"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "breakpointVariant", prop: "device" });
    });

    it("Screen prop name → breakpointVariant pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Screen Size": { type: "VARIANT", variantOptions: ["Small", "Large"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "breakpointVariant", prop: "screenSize" });
    });

    it("non-breakpoint prop → no pattern", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Size": { type: "VARIANT", variantOptions: ["Large"] },
        },
        children: [],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "breakpointVariant")).toHaveLength(0);
    });
  });

  describe("layoutModeSwitch", () => {
    it("variant prop에 의해 자식 구조가 바뀌면 감지", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Icon Only": { type: "VARIANT", variantOptions: ["False", "True"] },
          "Size": { type: "VARIANT", variantOptions: ["Large", "Small"] },
        },
        children: [
          {
            type: "COMPONENT", name: "Icon Only=False, Size=Large",
            children: [{
              id: "content-1", type: "FRAME", name: "Content",
              children: [
                { id: "li-1", type: "FRAME", name: "Leading Icon", children: [] },
                { id: "txt-1", type: "TEXT", name: "텍스트", children: [] },
                { id: "ti-1", type: "FRAME", name: "Trailing Icon", children: [] },
              ],
            }],
          },
          {
            type: "COMPONENT", name: "Icon Only=False, Size=Small",
            children: [{
              id: "content-2", type: "FRAME", name: "Content",
              children: [
                { id: "li-2", type: "FRAME", name: "Leading Icon", children: [] },
                { id: "txt-2", type: "TEXT", name: "텍스트", children: [] },
                { id: "ti-2", type: "FRAME", name: "Trailing Icon", children: [] },
              ],
            }],
          },
          {
            type: "COMPONENT", name: "Icon Only=True, Size=Large",
            children: [{
              id: "content-3", type: "FRAME", name: "Content",
              children: [
                { id: "icon-1", type: "INSTANCE", name: "Icon", children: [] },
              ],
            }],
          },
          {
            type: "COMPONENT", name: "Icon Only=True, Size=Small",
            children: [{
              id: "content-4", type: "FRAME", name: "Content",
              children: [
                { id: "icon-2", type: "INSTANCE", name: "Icon", children: [] },
              ],
            }],
          },
        ],
      } as any;

      const patterns = detector.detect(node);
      const lms = patterns.find(p => p.type === "layoutModeSwitch");
      expect(lms).toBeDefined();
      expect(lms).toMatchObject({
        type: "layoutModeSwitch",
        prop: "iconOnly",
        branches: {
          "False": expect.arrayContaining(["Leading Icon", "텍스트", "Trailing Icon"]),
          "True": expect.arrayContaining(["Icon"]),
        },
      });
    });

    it("모든 variant에서 자식 구조가 같으면 감지하지 않음", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Size": { type: "VARIANT", variantOptions: ["Large", "Small"] },
        },
        children: [
          {
            type: "COMPONENT", name: "Size=Large",
            children: [{
              id: "c-1", type: "FRAME", name: "Content",
              children: [{ id: "a-1", type: "TEXT", name: "Label", children: [] }],
            }],
          },
          {
            type: "COMPONENT", name: "Size=Small",
            children: [{
              id: "c-2", type: "FRAME", name: "Content",
              children: [{ id: "a-2", type: "TEXT", name: "Label", children: [] }],
            }],
          },
        ],
      } as any;

      const patterns = detector.detect(node);
      expect(patterns.filter(p => p.type === "layoutModeSwitch")).toHaveLength(0);
    });

    it("N분기 감지", () => {
      const node = {
        type: "COMPONENT_SET",
        componentPropertyDefinitions: {
          "Type": { type: "VARIANT", variantOptions: ["Default", "Basic", "Minimal"] },
        },
        children: [
          {
            type: "COMPONENT", name: "Type=Default",
            children: [{
              id: "h-1", type: "FRAME", name: "Header",
              children: [
                { id: "n1", type: "FRAME", name: "Nav", children: [] },
                { id: "t1", type: "TEXT", name: "Title", children: [] },
                { id: "a1", type: "FRAME", name: "Actions", children: [] },
              ],
            }],
          },
          {
            type: "COMPONENT", name: "Type=Basic",
            children: [{
              id: "h-2", type: "FRAME", name: "Header",
              children: [
                { id: "n2", type: "FRAME", name: "Nav", children: [] },
                { id: "t2", type: "TEXT", name: "Title", children: [] },
              ],
            }],
          },
          {
            type: "COMPONENT", name: "Type=Minimal",
            children: [{
              id: "h-3", type: "FRAME", name: "Header",
              children: [
                { id: "n3", type: "FRAME", name: "Nav", children: [] },
              ],
            }],
          },
        ],
      } as any;

      const patterns = detector.detect(node);
      const lms = patterns.find(p => p.type === "layoutModeSwitch");
      expect(lms).toBeDefined();
      if (lms && lms.type === "layoutModeSwitch") {
        expect(Object.keys(lms.branches)).toHaveLength(3);
      }
    });
  });

  describe("single COMPONENT (not COMPONENT_SET)", () => {
    it("works on single component", () => {
      const node = {
        type: "COMPONENT", name: "SimpleButton",
        children: [
          { id: "i-1", type: "FRAME", name: "Interaction", children: [] },
        ],
      } as any;
      const patterns = detector.detect(node);
      expect(patterns).toContainEqual({ type: "interactionFrame", nodeId: "i-1" });
    });
  });
});
