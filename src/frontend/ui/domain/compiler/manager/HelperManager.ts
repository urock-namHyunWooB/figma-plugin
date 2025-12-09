import { ConditionNode } from "@compiler";
import { BinaryOperator, TempAstTree } from "@compiler/types/customType";

class HelperManager {
  public findBooleanVariantProps(definitions: Record<string, any>): string[] {
    return Object.entries(definitions)
      .filter(([_, def]) => {
        const options = def.variantOptions?.sort();
        return (
          options?.length === 2 &&
          (options[0].toLowerCase() === "false" ||
            options[0].toLowerCase() === "true") &&
          (options[1].toLowerCase() === "false" ||
            options[1].toLowerCase() === "true")
        );
      })
      .map(([name]) => name);
  }

  public parseVariantName(variantName: string): Record<string, string> {
    const result: Record<string, string> = {};

    if (!variantName) return result;

    variantName.split(",").forEach((part) => {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key && value) {
        result[key] = value;
      }
    });

    return result;
  }

  public combineWithAnd(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "&&" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  public combineWithOr(conditions: ConditionNode[]): ConditionNode {
    return conditions.reduce((acc, curr) => ({
      type: "BinaryExpression",
      operator: "||" as BinaryOperator,
      left: acc,
      right: curr,
    })) as unknown as ConditionNode;
  }

  public createBinaryCondition(propName: string, value: string): ConditionNode {
    return {
      type: "BinaryExpression",
      operator: "===" as BinaryOperator,
      left: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { type: "Identifier", name: propName },
        computed: false,
        optional: false,
      },
      right: {
        type: "Literal",
        value: value,
        raw: `'${value}'`,
      },
    } as unknown as ConditionNode;
  }

  public deepCloneTree(tree: TempAstTree): any {
    // 순환 참조(parent) 제외하고 복사
    const clone = (node: TempAstTree): any => {
      const { parent, children, ...rest } = node;
      return {
        ...JSON.parse(JSON.stringify(rest)), // deep clone (parent 제외)
        children: children.map((child) => clone(child)),
      };
    };
    return clone(tree);
  }
}

const helper = new HelperManager();

export default helper;
