/**
 * JsxGenerator
 *
 * SemanticComponent에서 React 컴포넌트 JSX 생성
 */

import type { ArraySlotInfo, VariantInconsistency } from "../../../../types/types";
import type { SemanticComponent } from "../../SemanticIR";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { NodeRenderer, type NodeRendererContext } from "./NodeRenderer";

export type DeclarationStyle = "function" | "arrow" | "arrow-fc";
export type ExportStyle = "default" | "inline-default" | "named";

export interface ComponentWrapOptions {
  declarationStyle: DeclarationStyle;
  exportStyle: ExportStyle;
}

/**
 * 컴포넌트 body를 선언 형태 + export 방식으로 감싸기
 */
export function wrapComponent(
  name: string,
  propsType: string,
  body: string,
  options: ComponentWrapOptions
): string {
  const { declarationStyle } = options;
  const exportStyle =
    declarationStyle !== "function" && options.exportStyle === "inline-default"
      ? "default"
      : options.exportStyle;

  const exportPrefix =
    exportStyle === "inline-default"
      ? "export default "
      : exportStyle === "named"
        ? "export "
        : "";

  let header: string;
  let footer: string;
  switch (declarationStyle) {
    case "function":
      header = `${exportPrefix}function ${name}(props: ${propsType}) {`;
      footer = "}";
      break;
    case "arrow":
      header = `${exportPrefix}const ${name} = (props: ${propsType}) => {`;
      footer = "};";
      break;
    case "arrow-fc":
      header = `${exportPrefix}const ${name}: React.FC<${propsType}> = (props) => {`;
      footer = "};";
      break;
  }

  const exportLine = exportStyle === "default" ? `\n\nexport default ${name}` : "";

  return `${header}\n${body}\n${footer}${exportLine}`;
}

/** Derive setter name from state variable name (React useState convention) */
function setterFor(stateName: string): string {
  return "set" + stateName.charAt(0).toUpperCase() + stateName.slice(1);
}

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
  declarationStyle?: DeclarationStyle;
  exportStyle?: ExportStyle;
}

export class JsxGenerator {
  /**
   * 컴포넌트 코드 생성
   */
  static generate(
    ir: SemanticComponent,
    componentName: string,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions = {}
  ): JsxGenerateResult {
    // Slot props 설정 (조건부 렌더링에서 사용)
    this.slotProps = new Set(
      ir.props.filter((p) => p.type === "slot").map((p) => p.name)
    );

    // Boolean props 설정 (스타일 참조에서 삼항 변환용)
    // extraValues가 있는 boolean prop (예: boolean | "indeterminate")은 값이 3개 이상이므로 Record + String() 유지
    this.booleanProps = new Set([
      ...ir.props
        .filter((p) => p.type === "boolean" && !(p as any).extraValues?.length)
        .map((p) => p.name),
      // boolean state vars (예: open from useState(false))
      ...ir.state
        .filter((sv) => sv.initialValue === "false" || sv.initialValue === "true")
        .map((sv) => sv.name),
    ]);

    // extraValues가 있는 boolean props (Record 인덱스 시 String() 필요)
    this.booleanWithExtras = new Set(
      ir.props
        .filter((p) => p.type === "boolean" && (p as any).extraValues?.length)
        .map((p) => p.name)
    );

    // Prop rename 매핑 설정 (sourceKey → name)
    this.propRenameMap = new Map(
      ir.props.map((p) => [p.sourceKey, p.name])
    );

    // NodeStyleMap 설정
    this.nodeStyleMap = options.nodeStyleMap || new Map();

    // Array Slots 설정 (parentId → ArraySlotInfo 매핑)
    this.arraySlots = new Map(
      (ir.arraySlots || []).map((slot) => [slot.parentId, slot])
    );

    // 컴포넌트에서 참조 가능한 변수 이름 수집 (props + 파생 변수 + state 변수)
    this.availableVarNames = new Set([
      ...ir.props.map((p) => p.name),
      ...ir.derived.map((dv) => dv.name),
      ...ir.state.map((sv) => sv.name),
    ]);

    // 조건부 컴포넌트 map 선언 초기화
    this.componentMapDeclarations = [];

    // Props destructuring (별도 줄에서 수행)
    const propsDestructuring = this.generatePropsDestructuring(ir);

    // React useState 훅 선언 (props destructuring 직후)
    const stateVarsCode = ir.state.length
      ? ir.state.map((sv) => `  const [${sv.name}, ${setterFor(sv.name)}] = useState(${sv.initialValue});`).join("\n") + "\n"
      : "";

    // 파생 변수 선언 (props destructuring 이후, return 이전)
    const derivedVarsCode = ir.derived.length
      ? ir.derived.map((dv) => `  const ${dv.name} = ${dv.expression};`).join("\n") + "\n"
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
    };

    // JSX body (루트 노드는 isRoot=true로 restProps 전파)
    const jsxBody = NodeRenderer.generateNode(ctx, ir.structure, 2, true);

    // 조건부 컴포넌트 map 선언 (JSX 생성 후 수집됨)
    // (ctx.componentMapDeclarations === this.componentMapDeclarations — shared array reference)
    const componentMapCode = this.componentMapDeclarations.length
      ? this.componentMapDeclarations.join("\n") + "\n"
      : "";

    const body = `  const ${propsDestructuring} = props;
${stateVarsCode}${derivedVarsCode}${componentMapCode}
  return (
${jsxBody}
  );`;

    const code = wrapComponent(componentName, `${componentName}Props`, body, {
      declarationStyle: options.declarationStyle ?? "function",
      exportStyle: options.exportStyle ?? "default",
    });

    return { code, diagnostics: [] };
  }

  /**
   * Props destructuring 생성 (기본값 포함 + restProps)
   */
  private static generatePropsDestructuring(ir: SemanticComponent): string {
    if (ir.props.length === 0) {
      return "{ ...restProps }";
    }

    // Array Slot 이름 집합 (기본값 [] 설정용)
    const arraySlotNames = new Set((ir.arraySlots || []).map((slot) => slot.slotName));

    const propEntries = ir.props.map((p) => {
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
