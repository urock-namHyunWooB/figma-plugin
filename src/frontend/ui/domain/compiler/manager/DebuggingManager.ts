import { ConditionNode, TempAstTree } from "@compiler";
import { traverseBFS } from "@compiler/utils/traverse";
import helper from "./HelperManager";

class DebuggingManager {
  private isDebugMode: boolean = false;
  constructor(isDebugMode: boolean) {
    this.isDebugMode = isDebugMode;
  }

  public log(target: any) {
    if (!this.isDebugMode) {
      return console.log(target);
    }
    console.info("=======debug log============");
    console.log(target);
    console.info("===================");
  }

  /**
   * 원본 tree는 수정하지 않는다.
   * 트리를 순회해서 condition이 보이면 전부 conditionToString로 파싱한다.
   *
   */
  public tree(tree: TempAstTree) {
    // 1. Deep clone (원본 수정 방지)
    const cloned = helper.deepCloneTree(tree);

    return this.log(this.transformConditions(cloned));
  }

  private transformConditions(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.transformConditions(item));
    }

    if (typeof obj === "object") {
      const result: any = {};

      for (const key of Object.keys(obj)) {
        if (key === "parent") {
          result[key] = null; // 순환 참조 방지
          continue;
        }

        if (key === "condition") {
          result[key] = this.conditionToString(obj[key]);
        } else {
          result[key] = this.transformConditions(obj[key]);
        }
      }

      return result;
    }

    return obj;
  }

  public debugger(target: any[] | [[]], onMatch?: () => void) {
    if (isOneDArray(target)) {
      const pivot = target[0];

      for (let i = 1; i < target.length; i++) {
        const t = target[i];

        if (pivot === t) {
          if (onMatch) {
            onMatch?.();
          } else {
            debugger;
          }
        }
      }
    }
  }

  private conditionToString(node: ConditionNode | null): string {
    if (!node) return "null";

    if (node.type === "BinaryExpression") {
      const left = this.conditionToString(node.left as any);
      const right = this.conditionToString(node.right as any);
      return `(${left} ${node.operator} ${right})`;
    }
    if (node.type === "MemberExpression") {
      return `props.${(node as any).property.name}`;
    }
    if (node.type === "Literal") {
      return `"${(node as any).value}"`;
    }
    return JSON.stringify(node);
  }
}

function isOneDArray(arg: unknown): arg is unknown[] {
  return Array.isArray(arg) && (arg.length === 0 || !Array.isArray(arg[0]));
}

function isTwoDArray(arg: unknown): arg is unknown[][] {
  return (
    Array.isArray(arg) &&
    arg.length > 0 &&
    arg.every((item) => Array.isArray(item))
  );
}

const debug = new DebuggingManager(true);

export default debug;
