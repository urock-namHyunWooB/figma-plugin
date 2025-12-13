import { ConditionNode, SuperTreeNode } from "@compiler";
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

  public getRootComponentNode(node: SuperTreeNode) {
    while (node) {
      if (node.type === "COMPONENT") return node;
      node = node.parent as SuperTreeNode;
    }

    return node;
  }
}

// Union-Find 헬퍼
export class UnionFind {
  private parent: Map<string, string> = new Map();

  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!)); // 경로 압축
    }
    return this.parent.get(id)!;
  }

  union(id1: string, id2: string) {
    const root1 = this.find(id1);
    const root2 = this.find(id2);
    if (root1 !== root2) {
      this.parent.set(root2, root1);
    }
  }
}

const helper = new HelperManager();

export default helper;
