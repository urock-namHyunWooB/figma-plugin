import { ConditionNode, FinalAstTree, TempAstTree } from "@compiler";
import helper from "./HelperManager";
import ts from "typescript";

class DebuggingManager {
  private isDebugMode: boolean = false;

  constructor(isDebugMode: boolean) {
    this.isDebugMode = isDebugMode;

    /**
     * 키보드 d + 숫자 1 누르면 로컬스토리지에 debugPoint + 숫자 토글
     */

    let isDKeyPressed = false;

    window.addEventListener("keydown", (e) => {
      if (e.key === "d") {
        isDKeyPressed = true;
        return;
      }

      // d가 눌린 상태에서 숫자 키(1-9) 입력 시
      if (isDKeyPressed && e.key >= "1" && e.key <= "9") {
        const num = e.key;
        const key = `debugPoint${num}`;
        const current = localStorage.getItem(key);
        const newValue = current === "true" ? "false" : "true";

        localStorage.setItem(key, newValue);
        console.log(`🐛 ${key} toggled to: ${newValue}`);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.key === "d") {
        isDKeyPressed = false;
      }
    });
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
  public tree(tree: TempAstTree | FinalAstTree) {
    // 1. Deep clone (원본 수정 방지)
    const cloned = helper.deepCloneTree(tree);

    return this.log(this.transformConditions(cloned));
  }

  /**
   * 디버깅 포인트를 만듬.
   * localstorage에 값을 참조해서 실행.
   */
  public point(number: number) {
    if (window.localStorage.getItem(`debugPoint${number}`) === "true") {
      debugger;
    }
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

  public tsNode(node: ts.Node | undefined | null) {
    return this._debugNodeInfo(node);
  }

  private _debugNodeInfo(
    node: ts.Node | undefined | null,
    label: string = "Node"
  ): void {
    if (!node) {
      console.log(`🔍 ${label}: null/undefined`);
      return;
    }

    try {
      const kindName = ts.SyntaxKind[node.kind] || `Unknown(${node.kind})`;
      const code = this._debugPrintNode(node);

      console.log(`\n🔍 ${label}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Kind:", kindName);
      console.log("Code:", code);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    } catch (error) {
      console.error(`🔍 ${label} - Error:`, error);
      console.log("Node:", node);
    }
  }

  /**
   * 디버깅용: TypeScript AST 노드를 코드 문자열로 변환
   * 노드 타입에 따라 적절한 EmitHint를 자동 선택
   */
  private _debugPrintNode(
    node: ts.Node | undefined | null,
    hint?: ts.EmitHint
  ): string {
    if (!node) {
      return "null/undefined";
    }

    try {
      const sourceFile = ts.createSourceFile(
        "debug.tsx",
        "",
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TSX
      );
      const printer = ts.createPrinter();

      // 노드 타입에 따라 적절한 hint 자동 선택
      let emitHint: ts.EmitHint;
      if (hint !== undefined) {
        emitHint = hint;
      } else if (ts.isJsxAttribute(node) || ts.isJsxSpreadAttribute(node)) {
        emitHint = ts.EmitHint.Unspecified;
      } else if (ts.isExpression(node)) {
        emitHint = ts.EmitHint.Expression;
      } else {
        emitHint = ts.EmitHint.Unspecified;
      }

      return printer.printNode(emitHint, node, sourceFile);
    } catch (error) {
      return `[Print Error: ${error}]`;
    }
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
