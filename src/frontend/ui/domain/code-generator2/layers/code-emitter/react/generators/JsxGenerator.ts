/**
 * JsxGenerator
 *
 * UITree에서 React 컴포넌트 JSX 생성
 */

import type { UITree, ArraySlotInfo } from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import type { VariantInconsistency } from "../../../../types/types";
import { NodeRenderer, type NodeRendererContext } from "./NodeRenderer";

export interface JsxGenerateResult {
  code: string;
  diagnostics: VariantInconsistency[];
}

interface JsxGeneratorOptions {
  debug?: boolean;
  /** nodeId → styleVariableName 매핑 (StylesGenerator에서 생성) */
  nodeStyleMap?: Map<string, string>;
  /** input 타입 루트의 자식 <input>에 restProps를 전달하기 위한 내부 플래그 */
  _restPropsOnInput?: boolean;
}

export class JsxGenerator {
  /** 진단 정보 수집기 (generate() 호출 동안 유효) */
  private static collectedDiagnostics: VariantInconsistency[] = [];

  /**
   * 컴포넌트 코드 생성
   */
  static generate(
    uiTree: UITree,
    componentName: string,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions = {}
  ): JsxGenerateResult {
    this.collectedDiagnostics = [];

    // Slot props 설정 (조건부 렌더링에서 사용)
    this.slotProps = new Set(
      uiTree.props.filter((p) => p.type === "slot").map((p) => p.name)
    );

    // Boolean props 설정 (스타일 참조에서 삼항 변환용)
    // extraValues가 있는 boolean prop (예: boolean | "indeterminate")은 값이 3개 이상이므로 Record + String() 유지
    this.booleanProps = new Set([
      ...uiTree.props
        .filter((p) => p.type === "boolean" && !(p as any).extraValues?.length)
        .map((p) => p.name),
      // boolean stateVars (예: open from useState(false))
      ...(uiTree.stateVars || [])
        .filter((sv) => sv.initialValue === "false" || sv.initialValue === "true")
        .map((sv) => sv.name),
    ]);

    // extraValues가 있는 boolean props (Record 인덱스 시 String() 필요)
    this.booleanWithExtras = new Set(
      uiTree.props
        .filter((p) => p.type === "boolean" && (p as any).extraValues?.length)
        .map((p) => p.name)
    );

    // Prop rename 매핑 설정 (sourceKey → name)
    this.propRenameMap = new Map(
      uiTree.props.map((p) => [p.sourceKey, p.name])
    );

    // NodeStyleMap 설정
    this.nodeStyleMap = options.nodeStyleMap || new Map();

    // Array Slots 설정 (parentId → ArraySlotInfo 매핑)
    this.arraySlots = new Map(
      (uiTree.arraySlots || []).map((slot) => [slot.parentId, slot])
    );

    // 컴포넌트에서 참조 가능한 변수 이름 수집 (props + 파생 변수 + state 변수)
    this.availableVarNames = new Set([
      ...uiTree.props.map((p) => p.name),
      ...(uiTree.derivedVars || []).map((dv) => dv.name),
      ...(uiTree.stateVars || []).map((sv) => sv.name),
    ]);

    // 조건부 컴포넌트 map 선언 초기화
    this.componentMapDeclarations = [];

    // Props destructuring (별도 줄에서 수행)
    const propsDestructuring = this.generatePropsDestructuring(uiTree);

    // React useState 훅 선언 (props destructuring 직후)
    const stateVarsCode = uiTree.stateVars?.length
      ? uiTree.stateVars.map((sv) => `  const [${sv.name}, ${sv.setter}] = useState(${sv.initialValue});`).join("\n") + "\n"
      : "";

    // 파생 변수 선언 (props destructuring 이후, return 이전)
    const derivedVarsCode = uiTree.derivedVars?.length
      ? uiTree.derivedVars.map((dv) => `  const ${dv.name} = ${dv.expression};`).join("\n") + "\n"
      : "";

    // NodeRenderer context 구성 (static 필드 설정 완료 후)
    const ctx: NodeRendererContext = {
      styleStrategy,
      debug: options.debug ?? false,
      nodeStyleMap: this.nodeStyleMap,
      slotProps: this.slotProps,
      booleanProps: this.booleanProps,
      booleanWithExtras: this.booleanWithExtras,
      propRenameMap: this.propRenameMap,
      arraySlots: this.arraySlots,
      availableVarNames: this.availableVarNames,
      componentMapDeclarations: this.componentMapDeclarations,
      collectedDiagnostics: this.collectedDiagnostics,
    };

    // JSX body (루트 노드는 isRoot=true로 restProps 전파)
    const jsxBody = NodeRenderer.generateNode(ctx, uiTree.root, 2, true);

    // 조건부 컴포넌트 map 선언 (JSX 생성 후 수집됨)
    // (ctx.componentMapDeclarations === this.componentMapDeclarations — shared array reference)
    const componentMapCode = this.componentMapDeclarations.length
      ? this.componentMapDeclarations.join("\n") + "\n"
      : "";

    const code = `function ${componentName}(props: ${componentName}Props) {
  const ${propsDestructuring} = props;
${stateVarsCode}${derivedVarsCode}${componentMapCode}
  return (
${jsxBody}
  );
}

export default ${componentName}`;

    return { code, diagnostics: this.collectedDiagnostics };
  }

  /**
   * Props destructuring 생성 (기본값 포함 + restProps)
   */
  private static generatePropsDestructuring(uiTree: UITree): string {
    if (uiTree.props.length === 0) {
      return "{ ...restProps }";
    }

    // Array Slot 이름 집합 (기본값 [] 설정용)
    const arraySlotNames = new Set((uiTree.arraySlots || []).map((slot) => slot.slotName));

    const propEntries = uiTree.props.map((p) => {
      // Array Slot prop은 기본값 [] 설정 (undefined.map() 방지)
      if (p.type === "slot" && arraySlotNames.has(p.name)) {
        return `${p.name} = []`;
      }
      // 기본값이 있으면 destructuring에 포함
      if (p.defaultValue !== undefined) {
        // boolean prop의 string "true"/"false" → boolean literal 변환
        const effectiveDefault = (p.type === "boolean" && (p.defaultValue === "true" || p.defaultValue === "false"))
          ? p.defaultValue === "true"
          : p.defaultValue;
        const defaultVal = this.formatDefaultValue(effectiveDefault);
        return `${p.name} = ${defaultVal}`;
      }
      return p.name;
    });

    // 항상 restProps 추가
    propEntries.push("...restProps");

    return `{ ${propEntries.join(", ")} }`;
  }

  /**
   * 기본값 포맷팅
   */
  private static formatDefaultValue(value: unknown): string {
    if (typeof value === "string") {
      return `"${value}"`;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }
    if (value === null) {
      return "null";
    }
    return JSON.stringify(value);
  }

  // 현재 UITree의 slot props를 추적 (generate에서 설정)
  private static slotProps: Set<string> = new Set();

  // 현재 UITree의 boolean props를 추적 (스타일 참조 삼항 변환용)
  private static booleanProps: Set<string> = new Set();

  // extraValues가 있는 boolean props (Record 인덱스 시 String() 필요)
  private static booleanWithExtras: Set<string> = new Set();

  // sourceKey → name 매핑 (Figma prop 이름 → React prop 이름)
  private static propRenameMap: Map<string, string> = new Map();

  // nodeId → styleVariableName 매핑 (StylesGenerator에서 전달)
  private static nodeStyleMap: Map<string, string> = new Map();

  // Array Slot 정보 (parentId → ArraySlotInfo 매핑)
  private static arraySlots: Map<string, ArraySlotInfo> = new Map();

  // 컴포넌트의 실제 props 이름 + 파생 변수 이름 (JSX에서 참조 가능한 변수)
  private static availableVarNames: Set<string> = new Set();

  // 조건부 컴포넌트 map 변수 선언 (return 이전에 삽입)
  private static componentMapDeclarations: string[] = [];
}
