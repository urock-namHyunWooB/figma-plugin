/**
 * RadixMapper.ts
 *
 * SemanticComponent → Radix UI primitive-based React component code.
 * Used by ReactEmitter when the shadcn strategy is active and
 * the component matches a registered Radix config (checkbox, toggle, etc.).
 */

import type { SemanticComponent, SemanticNode } from "../../SemanticIR";
import type { RadixComponentConfig, RadixSubPrimitive } from "./RadixComponentConfig";
import { getRadixConfig } from "./RadixComponentConfig";
import {
  cssObjectToTailwind,
  getDiffStyles,
  PSEUDO_TO_PREFIX,
} from "../style-strategy/tailwindUtils";
import type { PseudoClass, ConditionNode, PropDefinition } from "../../../../types/types";

// config 등록을 위해 side-effect import
import "./checkboxConfig";
import "./switchConfig";

export interface RadixMapperOptions {
  cnImportPath?: string;
  componentName: string;
}

export class RadixMapper {
  static emit(ir: SemanticComponent, options: RadixMapperOptions): string {
    const config = getRadixConfig(ir.componentType ?? "");
    if (!config) {
      throw new Error(`No Radix config for componentType: ${ir.componentType}`);
    }

    const { componentName } = options;
    const cnImportPath = options.cnImportPath ?? "@/lib/utils";

    const rootClasses = this.extractNodeClasses(ir.structure);
    const subPrimitiveStyles = this.extractSubPrimitiveStyles(ir.structure, config);
    const hasVectorChild = this.hasVectorChildContent(ir.structure, config);
    const customProps = ir.props.filter((p) => !config.nativeRadixProps.has(p.name));

    const imports = this.generateImports(config, cnImportPath, hasVectorChild);
    const propsInterface = this.generatePropsInterface(componentName, config, customProps);
    const jsx = this.generateJsx(componentName, config, rootClasses, subPrimitiveStyles, hasVectorChild);

    return [imports, "", propsInterface, "", jsx].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Style extraction
  // ---------------------------------------------------------------------------

  private static extractNodeClasses(node: SemanticNode): string {
    if (!node.styles) return "";
    const classes: string[] = [];

    if (node.styles.base) {
      classes.push(...cssObjectToTailwind(node.styles.base));
    }

    if (node.styles.pseudo) {
      for (const [pseudo, styles] of Object.entries(node.styles.pseudo)) {
        const prefix = PSEUDO_TO_PREFIX[pseudo as PseudoClass];
        if (!prefix) continue;
        const diffStyles = node.styles.base
          ? getDiffStyles(node.styles.base, styles)
          : styles;
        if (Object.keys(diffStyles).length === 0) continue;
        const pseudoClasses = cssObjectToTailwind(diffStyles);
        for (const cls of pseudoClasses) {
          classes.push(`${prefix}${cls}`);
        }
      }
    }

    if (node.styles.dynamic) {
      for (const entry of node.styles.dynamic) {
        const prefix = this.conditionToDataPrefix(entry.condition);
        if (!prefix) continue;
        const dynClasses = cssObjectToTailwind(entry.style);
        for (const cls of dynClasses) {
          classes.push(`${prefix}${cls}`);
        }
      }
    }

    return classes.join(" ");
  }

  /**
   * Maps a ConditionNode (checked/disabled) to a Radix data-attribute selector prefix.
   * Returns null for conditions we can't map to Radix data attributes.
   */
  private static conditionToDataPrefix(condition: ConditionNode): string | null {
    if (!condition) return null;

    if (condition.type === "truthy") {
      if (condition.prop === "checked" || condition.prop === "active") {
        return "data-[state=checked]:";
      }
      if (condition.prop === "disable" || condition.prop === "disabled") {
        return "data-[disabled]:";
      }
    }

    if (condition.type === "eq") {
      if (
        (condition.prop === "checked" || condition.prop === "active") &&
        (condition.value === true || condition.value === "true")
      ) {
        return "data-[state=checked]:";
      }
      if (
        (condition.prop === "disable" || condition.prop === "disabled") &&
        (condition.value === true || condition.value === "true")
      ) {
        return "data-[disabled]:";
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Sub-primitive matching
  // ---------------------------------------------------------------------------

  private static extractSubPrimitiveStyles(
    root: SemanticNode,
    config: RadixComponentConfig
  ): Map<string, string> {
    const result = new Map<string, string>();
    if (!root.children) return result;

    for (const sub of config.subPrimitives) {
      const node = this.findSubPrimitiveNode(root, sub);
      if (node) {
        result.set(sub.role, this.extractNodeClasses(node));
      }
    }
    return result;
  }

  private static findSubPrimitiveNode(
    parent: SemanticNode,
    sub: RadixSubPrimitive
  ): SemanticNode | null {
    if (!parent.children) return null;
    for (const child of parent.children) {
      if (sub.identify(child)) return child;
      const found = this.findSubPrimitiveNode(child, sub);
      if (found) return found;
    }
    return null;
  }

  private static hasVectorChildContent(
    root: SemanticNode,
    config: RadixComponentConfig
  ): boolean {
    for (const sub of config.subPrimitives) {
      if (sub.childContent !== "vector-child") continue;
      const node = this.findSubPrimitiveNode(root, sub);
      if (node && this.findVector(node)) return true;
    }
    return false;
  }

  private static findVector(node: SemanticNode): boolean {
    if (node.kind === "vector" && node.vectorSvg) return true;
    if (node.children) {
      for (const child of node.children) {
        if (this.findVector(child)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Code generation
  // ---------------------------------------------------------------------------

  private static generateImports(
    config: RadixComponentConfig,
    cnImportPath: string,
    hasVectorChild: boolean
  ): string {
    const lines: string[] = [
      'import * as React from "react"',
      `import * as ${config.importAlias} from "${config.packageName}"`,
    ];

    const needsLucideCheck = config.subPrimitives.some(
      (s) => s.childContent === "vector-child" && !hasVectorChild
    );
    if (needsLucideCheck) {
      lines.push('import { Check } from "lucide-react"');
    }

    if (config.extraImports) {
      lines.push(...config.extraImports);
    }

    lines.push(`import { cn } from "${cnImportPath}"`);

    return lines.join("\n");
  }

  private static generatePropsInterface(
    componentName: string,
    config: RadixComponentConfig,
    customProps: PropDefinition[]
  ): string {
    const baseType = `React.ComponentPropsWithoutRef<typeof ${config.rootPrimitive}>`;

    if (customProps.length === 0) {
      return `type ${componentName}Props = ${baseType}`;
    }

    const propLines = customProps.map((p) => {
      const tsType =
        p.type === "boolean" ? "boolean"
        : p.type === "string" ? "string"
        : p.type === "slot" ? "React.ReactNode"
        : p.type === "function" ? "(...args: any[]) => void"
        : "any";
      return `  ${p.name}?: ${tsType};`;
    });

    return `interface ${componentName}Props extends ${baseType} {\n${propLines.join("\n")}\n}`;
  }

  private static generateJsx(
    componentName: string,
    config: RadixComponentConfig,
    rootClasses: string,
    subPrimitiveStyles: Map<string, string>,
    hasVectorChild: boolean
  ): string {
    const subJsx = config.subPrimitives
      .map((sub) => {
        const classes = subPrimitiveStyles.get(sub.role) || "";
        const classAttr = classes ? ` className={cn("${classes}")}` : "";

        let childJsx = "";
        if (sub.childContent === "vector-child") {
          childJsx = '\n        <Check className="h-4 w-4" />';
        }

        if (childJsx) {
          return `      <${sub.primitive}${classAttr}>${childJsx}\n      </${sub.primitive}>`;
        }
        return `      <${sub.primitive}${classAttr} />`;
      })
      .join("\n");

    const rootClassAttr = rootClasses
      ? `\n        className={cn("${rootClasses}", className)}`
      : "\n        className={className}";

    return `const ${componentName} = React.forwardRef<
  React.ElementRef<typeof ${config.rootPrimitive}>,
  ${componentName}Props
>(({ className, ...props }, ref) => (
  <${config.rootPrimitive}
    ref={ref}${rootClassAttr}
    {...props}
  >
${subJsx}
  </${config.rootPrimitive}>
))
${componentName}.displayName = ${config.rootPrimitive}.displayName

export { ${componentName} }`;
  }
}
