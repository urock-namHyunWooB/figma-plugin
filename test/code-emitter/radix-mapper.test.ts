import { describe, it, expect } from "vitest";
import { RadixMapper } from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/radix/RadixMapper";
import type {
  SemanticComponent,
  SemanticNode,
} from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIR";
import type { PropDefinition } from "@frontend/ui/domain/code-generator2/types/types";
import DataManager from "@frontend/ui/domain/code-generator2/layers/data-manager/DataManager";
import TreeBuilder from "@frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder";
import {
  ReactEmitter,
  renameNativeProps,
} from "@frontend/ui/domain/code-generator2/layers/code-emitter/react/ReactEmitter";
import { SemanticIRBuilder } from "@frontend/ui/domain/code-generator2/layers/code-emitter/SemanticIRBuilder";

// Fixtures
import taptapCheckbox from "../fixtures/checkbox/taptap-checkbox.json";
import urockCheckbox from "../fixtures/urock/Checkbox.json";
import switchFixture from "../fixtures/any/Switchswitch.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIR(fixture: any) {
  const dm = new DataManager(fixture as any);
  const tb = new TreeBuilder(dm);
  const uiTree = renameNativeProps(tb.build((fixture as any).info.document));
  return SemanticIRBuilder.build(uiTree);
}

function makeProp(
  overrides: Partial<PropDefinition> & { name: string; type: PropDefinition["type"] }
): PropDefinition {
  return {
    required: false,
    sourceKey: overrides.sourceKey ?? overrides.name,
    ...overrides,
  } as PropDefinition;
}

/** Minimal checkbox SemanticComponent for unit tests */
function makeCheckboxIR(overrides?: {
  props?: PropDefinition[];
  rootStyles?: Record<string, string>;
  indicatorStyles?: Record<string, string>;
  dynamicStyles?: Array<{ condition: any; style: Record<string, string> }>;
  includeVector?: boolean;
}): SemanticComponent {
  const indicatorChildren: SemanticNode[] = [];
  if (overrides?.includeVector) {
    indicatorChildren.push({
      id: "vec1",
      kind: "vector",
      vectorSvg: '<path d="M5 12l5 5L20 7"/>',
    });
  }

  const indicatorNode: SemanticNode = {
    id: "ind1",
    kind: "container",
    visibleCondition: { type: "truthy", prop: "checked" },
    styles: overrides?.indicatorStyles
      ? { base: overrides.indicatorStyles }
      : undefined,
    children: indicatorChildren.length > 0 ? indicatorChildren : undefined,
  };

  const rootNode: SemanticNode = {
    id: "root1",
    kind: "container",
    styles: {
      base: overrides?.rootStyles ?? {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        width: "20px",
        height: "20px",
      },
      dynamic: overrides?.dynamicStyles,
    },
    children: [indicatorNode],
  };

  return {
    name: "Checkbox",
    componentType: "checkbox",
    props: overrides?.props ?? [
      makeProp({ name: "checked", type: "boolean" }),
      makeProp({ name: "onCheckedChange", type: "function" }),
      makeProp({ name: "disabled", type: "boolean" }),
      makeProp({ name: "size", type: "variant", options: ["sm", "md", "lg"] }),
    ],
    state: [],
    derived: [],
    structure: rootNode,
  };
}

/** Minimal switch/toggle SemanticComponent for unit tests */
function makeSwitchIR(overrides?: {
  props?: PropDefinition[];
  rootStyles?: Record<string, string>;
  thumbStyles?: Record<string, string>;
  dynamicStyles?: Array<{ condition: any; style: Record<string, string> }>;
}): SemanticComponent {
  const thumbNode: SemanticNode = {
    id: "thumb1",
    kind: "container",
    styles: {
      base: overrides?.thumbStyles ?? {
        borderRadius: "9999px",
        width: "16px",
        height: "16px",
        backgroundColor: "#ffffff",
      },
    },
  };

  const rootNode: SemanticNode = {
    id: "root1",
    kind: "container",
    styles: {
      base: overrides?.rootStyles ?? {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "9999px",
        width: "44px",
        height: "24px",
        backgroundColor: "#e2e8f0",
      },
      dynamic: overrides?.dynamicStyles,
    },
    children: [thumbNode],
  };

  return {
    name: "Switch",
    componentType: "toggle",
    props: overrides?.props ?? [
      makeProp({ name: "checked", type: "boolean" }),
      makeProp({ name: "onCheckedChange", type: "function" }),
      makeProp({ name: "disabled", type: "boolean" }),
      makeProp({ name: "active", type: "boolean" }),
    ],
    state: [],
    derived: [],
    structure: rootNode,
  };
}

// ===========================================================================
// Task 7: Unit Tests
// ===========================================================================

describe("RadixMapper — Checkbox", () => {
  it("generates Radix checkbox primitive import", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain(
      'import * as CheckboxPrimitive from "@radix-ui/react-checkbox"'
    );
  });

  it("generates cn import with default path", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain('import { cn } from "@/lib/utils"');
  });

  it("supports custom cnImportPath", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
      cnImportPath: "@/utils/cn",
    });
    expect(code).toContain('import { cn } from "@/utils/cn"');
    expect(code).not.toContain("@/lib/utils");
  });

  it("generates React.forwardRef with typeof CheckboxPrimitive.Root", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("React.forwardRef<");
    expect(code).toContain("typeof CheckboxPrimitive.Root");
  });

  it("renders CheckboxPrimitive.Root and CheckboxPrimitive.Indicator", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("<CheckboxPrimitive.Root");
    expect(code).toContain("<CheckboxPrimitive.Indicator");
  });

  it("uses cn( with className on root", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("cn(");
    expect(code).toContain("className");
  });

  it("does NOT include ARIA attrs (role=, aria-checked, onClick)", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).not.toContain('role=');
    expect(code).not.toContain("aria-checked");
    expect(code).not.toMatch(/onClick\s*=/);
  });

  it("excludes nativeRadixProps from props interface", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    // nativeRadixProps: checked, onCheckedChange, disabled, disable
    // The props interface should only have custom props (size)
    // It should NOT declare checked/onCheckedChange/disabled as custom props
    expect(code).toContain("size?:");
    // The type line extends ComponentPropsWithoutRef which covers native props
    expect(code).toContain("ComponentPropsWithoutRef");
  });

  it("includes Tailwind classes from base styles", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("inline-flex");
    expect(code).toMatch(/rounded/);
  });

  it("sets displayName", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("Checkbox.displayName");
  });

  it("exports component with export { Checkbox }", () => {
    const code = RadixMapper.emit(makeCheckboxIR(), {
      componentName: "Checkbox",
    });
    expect(code).toContain("export { Checkbox }");
  });

  it("uses lucide-react Check when no vector child found", () => {
    // No vector child in indicator → fallback to lucide-react Check
    const code = RadixMapper.emit(makeCheckboxIR({ includeVector: false }), {
      componentName: "Checkbox",
    });
    expect(code).toContain('import { Check } from "lucide-react"');
  });

  it("skips lucide-react import when vector child exists", () => {
    const code = RadixMapper.emit(makeCheckboxIR({ includeVector: true }), {
      componentName: "Checkbox",
    });
    expect(code).not.toContain("lucide-react");
  });
});

describe("RadixMapper — Switch", () => {
  it("generates Radix switch primitive import", () => {
    const code = RadixMapper.emit(makeSwitchIR(), {
      componentName: "Switch",
    });
    expect(code).toContain(
      'import * as SwitchPrimitives from "@radix-ui/react-switch"'
    );
  });

  it("renders SwitchPrimitives.Root and SwitchPrimitives.Thumb", () => {
    const code = RadixMapper.emit(makeSwitchIR(), {
      componentName: "Switch",
    });
    expect(code).toContain("<SwitchPrimitives.Root");
    expect(code).toContain("<SwitchPrimitives.Thumb");
  });

  it("converts dynamic active condition to data-[state=checked]: prefix", () => {
    const code = RadixMapper.emit(
      makeSwitchIR({
        dynamicStyles: [
          {
            condition: { type: "truthy", prop: "active" },
            style: { backgroundColor: "#3b82f6" },
          },
        ],
      }),
      { componentName: "Switch" }
    );
    expect(code).toContain("data-[state=checked]:");
  });

  it("does NOT include ARIA attrs", () => {
    const code = RadixMapper.emit(makeSwitchIR(), {
      componentName: "Switch",
    });
    expect(code).not.toContain('role=');
    expect(code).not.toContain("aria-checked");
  });

  it("includes thumb border-radius classes (rounded-full)", () => {
    const code = RadixMapper.emit(makeSwitchIR(), {
      componentName: "Switch",
    });
    // The thumb node has borderRadius: 9999px → rounded-full or rounded-[9999px]
    expect(code).toMatch(/rounded/);
  });

  it("sets displayName and exports", () => {
    const code = RadixMapper.emit(makeSwitchIR(), {
      componentName: "Switch",
    });
    expect(code).toContain("Switch.displayName");
    expect(code).toContain("export { Switch }");
  });

  it("maps disabled condition to data-[disabled]: prefix", () => {
    const code = RadixMapper.emit(
      makeSwitchIR({
        dynamicStyles: [
          {
            condition: { type: "truthy", prop: "disabled" },
            style: { opacity: "0.5" },
          },
        ],
      }),
      { componentName: "Switch" }
    );
    expect(code).toContain("data-[disabled]:");
  });
});

// ===========================================================================
// Task 8: Fixture Integration Tests
// ===========================================================================

describe("RadixMapper — Fixture Integration", () => {
  it("taptap-checkbox + shadcn → Radix Checkbox output", async () => {
    const ir = buildIR(taptapCheckbox);
    const emitter = new ReactEmitter({ styleStrategy: "shadcn" });
    const result = await emitter.emit(ir);

    expect(result.code).toContain("CheckboxPrimitive");
    expect(result.code).toContain("forwardRef");
    expect(result.code).toContain("cn(");
    expect(result.code).not.toContain('role="checkbox"');
  });

  it("urock-checkbox + shadcn → Radix Checkbox output", async () => {
    const ir = buildIR(urockCheckbox);
    const emitter = new ReactEmitter({ styleStrategy: "shadcn" });
    const result = await emitter.emit(ir);

    expect(result.code).toContain("CheckboxPrimitive");
    expect(result.code).toContain("forwardRef");
  });

  it("taptap-checkbox + emotion → standard Emotion output (no Radix)", async () => {
    const ir = buildIR(taptapCheckbox);
    const emitter = new ReactEmitter({ styleStrategy: "emotion" });
    const result = await emitter.emit(ir);

    expect(result.code).not.toContain("CheckboxPrimitive");
    expect(result.code).toContain("css");
  });

  it("switch fixture + shadcn → Radix Switch output", async () => {
    const ir = buildIR(switchFixture);
    const emitter = new ReactEmitter({ styleStrategy: "shadcn" });
    const result = await emitter.emit(ir);

    expect(result.code).toContain("SwitchPrimitives");
    expect(result.code).toContain("forwardRef");
    expect(result.code).toContain("cn(");
  });

  it("switch fixture + tailwind → standard Tailwind output (no Radix)", async () => {
    const ir = buildIR(switchFixture);
    const emitter = new ReactEmitter({ styleStrategy: "tailwind" });
    const result = await emitter.emit(ir);

    expect(result.code).not.toContain("SwitchPrimitives");
  });
});
