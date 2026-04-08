/**
 * JsxGenerator
 *
 * UITree에서 React 컴포넌트 JSX 생성
 */

import type { UITree, UINode, ContainerNode, ButtonNode, InputNode, LinkNode, ComponentNode, ConditionNode, StyleObject, ArraySlotInfo } from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { groupDynamicByProp } from "../style-strategy/groupDynamicByProp";
import { extractAllPropNames } from "../../../../types/conditionUtils";
import type { VariantInconsistency } from "../../../../types/types";
import { toComponentName } from "../../../../utils/nameUtils";
import { BindingRenderer } from "./BindingRenderer";

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

/** 같은 prop의 eq 조건으로 분기되는 component 노드 그룹 */
interface ComponentMapGroup {
  propName: string;
  entries: Array<{ value: string; node: UINode }>;
  /** 모든 엔트리가 동일한 wrapper 스타일을 가지면 true */
  hasSharedWrapper: boolean;
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

    // JSX body (루트 노드는 isRoot=true로 restProps 전파)
    const jsxBody = this.generateNode(uiTree.root, styleStrategy, options, 2, true);

    // 조건부 컴포넌트 map 선언 (JSX 생성 후 수집됨)
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

  /**
   * UINode를 JSX로 변환
   */
  private static generateNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number,
    isRoot: boolean = false
  ): string {
    const indentStr = " ".repeat(indent);

    // Slot binding이 있으면 slot prop 렌더링 (styles가 있으면 wrapper div 적용)
    // 단, placeholder + attrs 바인딩이 있으면 <input> 태그로 렌더링하므로 스킵
    const slotBinding = node.bindings?.content;
    if (
      slotBinding &&
      "prop" in slotBinding &&
      !(node.semanticType === "placeholder" && node.bindings?.attrs)
    ) {
      // visibleCondition이 slot prop이 아닌 다른 prop을 참조할 때만 조건 추가
      const extraCondition = (node.visibleCondition && !this.getSlotPropFromCondition(node.visibleCondition))
        ? this.conditionToCode(node.visibleCondition)
        : undefined;
      return this.generateSlotWrapper(node, slotBinding.prop, styleStrategy, indent, extraCondition);
    }

    // 조건부 렌더링
    if (node.visibleCondition) {
      // Slot prop으로 제어되는 노드인지 확인
      const slotProp = this.getSlotPropFromCondition(node.visibleCondition);
      if (slotProp) {
        // component 또는 container with content binding → slot wrapper 패턴 사용
        if (node.type === "component") {
          // Slot prop 값을 직접 렌더링
          return `${indentStr}{${slotProp}}`;
        }
        // Container with visibleCondition for slot → slot wrapper 패턴
        // 조건부로 wrapper div와 slot content 렌더링
        return this.generateSlotWrapper(node, slotProp, styleStrategy, indent);
      }

      const condition = this.conditionToCode(node.visibleCondition);
      const innerJsx = this.generateNodeInner(node, styleStrategy, options, indent, isRoot);
      return `${indentStr}{${condition} && (\n${innerJsx}\n${indentStr})}`;
    }

    return this.generateNodeInner(node, styleStrategy, options, indent, isRoot);
  }

  /**
   * 조건에서 slot prop 이름 추출 (truthy 조건이 slot prop이면)
   */
  private static getSlotPropFromCondition(condition: ConditionNode): string | null {
    // 단순 truthy 조건
    if (condition.type === "truthy" && this.slotProps.has(condition.prop)) {
      return condition.prop;
    }

    // and 조건에서 truthy slot prop 찾기
    if (condition.type === "and" && condition.conditions.length > 0) {
      for (const cond of condition.conditions) {
        if (cond.type === "truthy" && this.slotProps.has(cond.prop)) {
          return cond.prop;
        }
      }
    }

    return null;
  }

  /**
   * 노드 내부 JSX 생성
   */
  private static generateNodeInner(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number,
    isRoot: boolean = false
  ): string {
    // semanticType 우선 처리: search-input 또는 input 내부의 placeholder → <input> 태그
    if (
      node.semanticType === "search-input" ||
      (node.semanticType === "placeholder" && node.bindings?.attrs)
    ) {
      return this.generateInputElement(node, styleStrategy, options, indent);
    }

    switch (node.type) {
      case "text":
        return this.generateTextNode(node, styleStrategy, options, indent);

      case "component":
        return this.generateComponentNode(node, styleStrategy, options, indent);

      case "vector":
        return this.generateVectorNode(node, styleStrategy, options, indent);

      case "button":
      case "input":
      case "link":
      case "container":
      default:
        return this.generateContainerNode(node, styleStrategy, options, indent, isRoot);
    }
  }

  /**
   * Array Slot .map() 렌더링 생성
   *
   * {items.map((item, index) => (
   *   <NavigationItem key={index} label={item.label} />
   * ))}
   */
  private static generateArraySlotMap(
    arraySlot: ArraySlotInfo,
    parentNode: ContainerNode | ButtonNode | InputNode | LinkNode | ComponentNode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);

    // Array Slot에 포함된 첫 번째 자식 노드 찾기
    const firstNodeId = arraySlot.nodeIds[0];
    const arrayItemNode = parentNode.children.find((child) => child.id === firstNodeId);

    if (!arrayItemNode) {
      // Array Slot 노드를 찾을 수 없으면 일반 렌더링
      return parentNode.children
        .map((child) => this.generateNode(child, styleStrategy, options, indent, false))
        .join("\n");
    }

    // 외부 컴포넌트 이름 (refId에서 추출 또는 itemComponentName 사용)
    const componentName = arraySlot.itemComponentName || toComponentName(arrayItemNode.name);

    // item props 매핑 — "content"는 children으로, 나머지는 속성으로 전달
    const itemPropsMapping = arraySlot.itemProps || [];
    const attrProps = itemPropsMapping.filter((p) => p.name !== "content");
    const contentProp = itemPropsMapping.find((p) => p.name === "content");

    const propsStr = attrProps.length > 0
      ? " " + attrProps.map((p) => `${p.name}={item.${p.name}}`).join(" ")
      : "";

    // onItemClick 핸들러 (예: dropdown 아이템 선택)
    const onClickStr = arraySlot.onItemClick
      ? ` onClick={() => { ${arraySlot.onItemClick} }}`
      : "";

    // 래퍼 스타일 (첫 번째 아이템 노드에 스타일이 있으면 래퍼 div로 감싸기)
    const wrapperStyle = arrayItemNode.styles;
    const hasWrapper = wrapperStyle && Object.keys(wrapperStyle.base || {}).length > 0;

    // itemProps와 contentProp이 모두 없으면 ReactNode 직접 렌더링
    // (Array<React.ReactNode> 타입 — item 자체가 완전한 렌더 가능 요소)
    const isDirectSlot = itemPropsMapping.length === 0 && !contentProp;

    if (hasWrapper) {
      // nodeStyleMap에서 래퍼 div의 CSS 변수명 조회 (StylesGenerator가 이미 생성)
      const wrapperCssName = this.nodeStyleMap.get(arrayItemNode.id) || `${componentName}ItemCss`;
      const wrapperAttr = styleStrategy.getJsxStyleAttribute(wrapperCssName, false);
      const wrapperAttrStr = `${wrapperAttr.attributeName}=${wrapperAttr.valueCode}`;

      // 래퍼 CSS에 텍스트 스타일이 포함되면 → 의존 컴포넌트 스킵, 래퍼에서 직접 렌더링
      const wrapperBase = wrapperStyle?.base || {};
      const isDirectRender = "color" in wrapperBase || "font-size" in wrapperBase;

      if (isDirectRender && contentProp) {
        return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <div key={index} ${wrapperAttrStr}${onClickStr}>
${indentStr}    {item.content}
${indentStr}  </div>
${indentStr}))}`;
      }

      if (contentProp) {
        return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <div key={index} ${wrapperAttrStr}${onClickStr}>
${indentStr}    <${componentName}${propsStr}>{item.content}</${componentName}>
${indentStr}  </div>
${indentStr}))}`;
      }

      if (isDirectSlot) {
        return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <div key={index} ${wrapperAttrStr}${onClickStr}>
${indentStr}    {item}
${indentStr}  </div>
${indentStr}))}`;
      }

      return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <div key={index} ${wrapperAttrStr}${onClickStr}>
${indentStr}    <${componentName}${propsStr} />
${indentStr}  </div>
${indentStr}))}`;
    }

    if (contentProp) {
      return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <${componentName} key={index}${propsStr}${onClickStr}>{item.content}</${componentName}>
${indentStr}))}`;
    }

    if (isDirectSlot) {
      return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <React.Fragment key={index}>{item}</React.Fragment>
${indentStr}))}`;
    }

    return `${indentStr}{Array.isArray(${arraySlot.slotName}) && ${arraySlot.slotName}.map((item, index) => (
${indentStr}  <${componentName} key={index}${propsStr}${onClickStr} />
${indentStr}))}`;
  }

  /**
   * Loop 컨텐츠 렌더링 (제네릭 .map() 생성)
   *
   * ContainerNode.loop 설정을 기반으로 .map() 코드 생성
   * 첫 번째 자식을 템플릿으로 사용
   */
  private static generateLoopContent(
    node: ContainerNode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);
    const loop = node.loop!;
    const dataProp = loop.dataProp;
    const keyField = loop.keyField || "id";
    const itemVar = "option"; // loop item 변수명 (SegmentedControl 등 option 기반 컴포넌트 호환)

    // 첫 번째 자식을 템플릿으로 사용
    const templateNode = node.children[0];
    if (!templateNode) {
      return `${indentStr}{/* No template node for loop */}`;
    }

    // 템플릿 서브트리에 itemVariant 스타일이 있는지 확인
    const hasItemVariant = this.templateHasItemVariant(templateNode);

    // 템플릿 렌더링 (루프 컨텍스트에서)
    const templateJsx = this.generateNodeInLoop(templateNode, styleStrategy, options, indent + 4, itemVar, keyField);

    // isActive 선언은 itemVariant가 있을 때만
    const isActiveDecl = hasItemVariant
      ? `\n${indentStr}  const isActive = ${itemVar}.${keyField} === selectedValue;`
      : "";

    return `${indentStr}{${dataProp}.map((${itemVar}) => {${isActiveDecl}
${indentStr}  return (
${templateJsx}
${indentStr}  );
${indentStr}})}`;
  }

  /**
   * 템플릿 서브트리에 itemVariant 스타일이 있는지 확인
   */
  private static templateHasItemVariant(node: UINode): boolean {
    if ("styles" in node && node.styles?.itemVariant) {
      return true;
    }
    if ("children" in node && node.children) {
      for (const child of node.children) {
        if (this.templateHasItemVariant(child)) return true;
      }
    }
    return false;
  }

  /**
   * Loop 컨텍스트에서 노드 렌더링
   *
   * bindings에서 item.xxx 참조를 loop item 변수로 치환
   */
  private static generateNodeInLoop(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number,
    itemVar: string,
    keyField: string,
    isRoot: boolean = true
  ): string {
    const indentStr = " ".repeat(indent);
    const tag = this.getHtmlTag(node);

    // 조건부 렌더링 (item.xxx 형태의 visibleCondition 처리)
    const visibleCondition = this.getLoopVisibleCondition(node, itemVar);

    // 속성 생성 (loop 컨텍스트)
    const attrs = this.generateAttributesInLoop(node, styleStrategy, options, itemVar, keyField, isRoot);

    // Content 바인딩 확인 (item.xxx 참조)
    const contentBinding = this.getLoopContentBinding(node, itemVar);

    // 자식 없고 content 바인딩도 없으면 self-closing
    if (!("children" in node) || !node.children || node.children.length === 0) {
      if (contentBinding) {
        // content 바인딩이 있으면 내용 렌더링
        const jsx = `${indentStr}<${tag}${attrs}>{${contentBinding}}</${tag}>`;
        return visibleCondition ? `${indentStr}{${visibleCondition} && ${jsx.trim()}}` : jsx;
      }
      const jsx = `${indentStr}<${tag}${attrs} />`;
      return visibleCondition ? `${indentStr}{${visibleCondition} && ${jsx.trim()}}` : jsx;
    }

    // 자식 렌더링
    const childrenJsx = node.children
      .map((child) => this.generateNodeInLoop(child, styleStrategy, options, indent + 2, itemVar, keyField, false))
      .join("\n");

    const jsx = `${indentStr}<${tag}${attrs}>
${childrenJsx}
${indentStr}</${tag}>`;

    return visibleCondition ? `${indentStr}{${visibleCondition} && (
${jsx}
${indentStr})}` : jsx;
  }

  /**
   * Loop 아이템 조건부 렌더링 조건 추출
   */
  private static getLoopVisibleCondition(node: UINode, itemVar: string): string | null {
    if (!node.visibleCondition) return null;

    const condition = node.visibleCondition;
    if (condition.type === "truthy" && condition.prop.startsWith("item.")) {
      const field = condition.prop.slice(5); // "item.xxx" -> "xxx"
      return `${itemVar}.${field}`;
    }

    return null;
  }

  /**
   * Loop 아이템 content 바인딩 추출
   */
  private static getLoopContentBinding(node: UINode, itemVar: string): string | null {
    if (!node.bindings?.content) return null;

    const source = node.bindings.content;
    if ("ref" in source && source.ref.startsWith("item.")) {
      const field = source.ref.slice(5); // "item.xxx" -> "xxx"
      return `${itemVar}.${field}`;
    }

    return null;
  }

  /**
   * Loop 컨텍스트에서 속성 생성
   *
   * key 속성 추가 및 loop item 바인딩 처리
   */
  private static generateAttributesInLoop(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    itemVar: string,
    keyField: string,
    isRoot: boolean
  ): string {
    let attrs = this.generateAttributes(node, styleStrategy, options, { skipBindingAttrs: true, inLoopContext: true });

    // 루트 노드에만 key 추가
    if (isRoot && !attrs.includes("key=")) {
      attrs = ` key={${itemVar}.${keyField}}` + attrs;
    }

    // Loop item 바인딩 처리 (bindings에서 item.xxx 참조 치환)
    if (node.bindings?.attrs) {
      for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
        if ("expr" in source) {
          // expr 내의 item. 참조를 실제 loop 변수로 치환
          const resolvedExpr = source.expr.replace(/\bitem\./g, `${itemVar}.`);
          attrs += ` ${attrName}={${resolvedExpr}}`;
        } else if ("ref" in source && source.ref.startsWith("item.")) {
          const field = source.ref.slice(5); // "item.xxx" -> "xxx"
          if (attrName.startsWith("on")) {
            attrs += ` ${attrName}={() => ${field}?.(${itemVar})}`;
          } else {
            attrs += ` ${attrName}={${itemVar}.${field}}`;
          }
        }
      }
    }

    return attrs;
  }

  /**
   * <input> 요소 생성 (search-input, placeholder semanticType 공용)
   */
  private static generateInputElement(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);
    const attrs = this.generateAttributes(node, styleStrategy, options);

    const placeholderProp =
      node.bindings?.content && "prop" in node.bindings.content
        ? BindingRenderer.toExpression(node.bindings.content)
        : "text";

    // bindings.attrs에 onChange가 없으면 fallback 추가
    // input 타입(restProps 전달)이면 native onChange가 restProps에 포함되므로 생략
    const hasOnChange = node.bindings?.attrs?.["onChange"];
    const onChangeFallback = hasOnChange || options._restPropsOnInput
      ? ""
      : `onChange={(e) => onValueChange?.(e.target.value)}`;

    const restPropsSpread = options._restPropsOnInput ? "{...restProps}" : "";

    const inputAttrs = [attrs, `placeholder={${placeholderProp}}`, onChangeFallback, restPropsSpread]
      .filter(Boolean)
      .join(" ");

    return `${indentStr}<input ${inputAttrs} />`;
  }

  /**
   * Text 노드 생성
   */
  private static generateTextNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);
    const attrs = this.generateAttributes(node, styleStrategy, options);

    // bindings에서 텍스트 바인딩 확인
    // textContent: CSS 유지하면서 텍스트만 교체 (slot wrapper 없이 직접 렌더링)
    // content: slot wrapper로 렌더링 (CSS 소실)
    const textBinding = node.bindings?.textContent ?? node.bindings?.content;

    let textContent: string;
    if (textBinding && "expr" in textBinding) {
      // expr 바인딩 (예: selectedValue || placeholder)
      textContent = `{${BindingRenderer.toExpression(textBinding)}}`;
    } else if (textBinding && "prop" in textBinding) {
      // prop 바인딩이 있으면 prop 사용
      textContent = `{${BindingRenderer.toExpression(textBinding)}}`;
    } else if (node.type === "text" && node.textSegments && node.textSegments.length > 0) {
      // textSegments가 있으면 실제 텍스트 렌더링
      // 스타일이 있는 segment는 개별 span으로 렌더링
      textContent = this.renderTextSegments(node.textSegments);
    } else {
      // 둘 다 없으면 주석
      textContent = `{/* ${node.name} */}`;
    }

    return `${indentStr}<span${attrs}>${textContent}</span>`;
  }

  /**
   * textSegments를 렌더링
   * - 스타일이 있는 segment는 개별 <span style={{...}}>로 렌더링
   * - 스타일이 없는 segment는 텍스트만
   */
  private static renderTextSegments(
    segments: Array<{ text: string; style?: Record<string, string> }>
  ): string {
    return segments
      .map((seg) => {
        // 줄바꿈을 <br /> 태그로 변환
        const textWithBreaks = seg.text.includes("\n")
          ? seg.text.split("\n").join("<br />")
          : seg.text;

        if (seg.style && Object.keys(seg.style).length > 0) {
          // 스타일이 있으면 인라인 style prop으로 렌더링
          const styleEntries = Object.entries(seg.style)
            .map(([key, value]) => `${key}: "${value}"`)
            .join(", ");
          return `<span style={{ ${styleEntries} }}>${textWithBreaks}</span>`;
        } else {
          // 스타일이 없으면 텍스트만
          return textWithBreaks;
        }
      })
      .join("");
  }

  /**
   * Component (외부 컴포넌트) 노드 생성
   * - styles가 있으면 wrapper div로 감싸서 크기/위치 스타일 적용
   * - 외부 컴포넌트는 props만 전달
   */
  private static generateComponentNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);

    // INSTANCE slot 확인 (bindings.content가 있으면 slot)
    const slotBinding = node.bindings?.content;
    if (slotBinding && "prop" in slotBinding) {
      return this.generateSlotWrapper(node, slotBinding.prop, styleStrategy, indent);
    }

    // 일반 컴포넌트 렌더링
    const componentName = toComponentName(node.name);

    // INSTANCE override props 생성
    let componentAttrs = "";
    if (node.type === "component" && "overrideProps" in node && node.overrideProps) {
      for (const [propName, value] of Object.entries(node.overrideProps)) {
        // boolean 값은 JSX expression으로 출력
        if (value === "true" || value === "false") {
          componentAttrs += ` ${propName}={${value}}`;
        } else {
          componentAttrs += ` ${propName}="${value}"`;
        }
      }
    }

    // bindings.attrs 처리 (prop 바인딩: active={active}, expr 바인딩 등)
    // 이벤트 핸들러(on*)는 wrapper div로 이동 (dependency props에 없을 수 있음)
    let wrapperEventAttrs = "";
    if (node.bindings?.attrs) {
      for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
        const isEvent = /^on[A-Z]/.test(attrName);
        if ("prop" in source) {
          componentAttrs += ` ${attrName}={${BindingRenderer.toExpression(source)}}`;
        } else if ("expr" in source) {
          if (isEvent) {
            wrapperEventAttrs += ` ${attrName}={${BindingRenderer.toExpression(source)}}`;
          } else {
            componentAttrs += ` ${attrName}={${BindingRenderer.toExpression(source)}}`;
          }
        }
      }
    }

    // styles가 있으면 wrapper div로 감싸기
    if (node.styles && this.hasNonEmptyStyles(node.styles)) {
      // nodeStyleMap에서 실제 생성된 변수명 가져오기
      const wrapperStyleVarName = this.nodeStyleMap.get(node.id) || `_${componentName}_wrapperCss`;
      const dynamicProps = this.extractDynamicProps(node.styles);

      let wrapperAttrs: string;
      if (dynamicProps.length > 0) {
        if (styleStrategy.name === "emotion") {
          const dynamicStyleRefs = dynamicProps.map(
            (prop) => this.buildDynamicStyleRef(wrapperStyleVarName, prop)
          );
          wrapperAttrs = `css={[${wrapperStyleVarName}, ${dynamicStyleRefs.join(", ")}]}`;
        } else {
          const propArgs = [...new Set(dynamicProps
            .flatMap((prop) => prop.includes("+") ? prop.split("+") : [prop])
            .map((p) => p.replace(/[\x00-\x1f\x7f]/g, ""))
          )];
          const propArgStrs = propArgs.map((p) =>
            this.slotProps.has(p) ? `${p}: !!${p}` : p
          );
          wrapperAttrs = `className={${wrapperStyleVarName}({ ${propArgStrs.join(", ")} })}`;
        }
      } else {
        const styleAttr = styleStrategy.getJsxStyleAttribute(wrapperStyleVarName, false);
        wrapperAttrs = `${styleAttr.attributeName}=${styleAttr.valueCode}`;
      }

      // wrapper CSS가 INSTANCE 크기를 제어하고, 서브 컴포넌트는
      // width:100%/height:100%로 채우므로 instanceScale 불필요
      return `${indentStr}<div ${wrapperAttrs}${wrapperEventAttrs}>
${indentStr}  <${componentName}${componentAttrs} />
${indentStr}</div>`;
    }

    // styles가 없으면 직접 렌더링 (이벤트도 component에 직접 전달)
    return `${indentStr}<${componentName}${componentAttrs}${wrapperEventAttrs} />`;
  }

  /**
   * Vector 노드 생성
   */
  private static generateVectorNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);
    const attrs = this.generateAttributes(node, styleStrategy, options);

    // SVG가 있으면 JSX 포맷으로 변환하여 사용
    if (node.type === "vector" && "vectorSvg" in node && node.vectorSvg) {
      const jsxSvg = this.convertSvgToJsx(node.vectorSvg);
      return `${indentStr}<span${attrs}>${jsxSvg}</span>`;
    }

    // SVG 없는 VECTOR 노드 — CSS로만 표현 (self-closing)
    return `${indentStr}<span${attrs} />`;
  }

  /**
   * SVG HTML 문자열을 JSX 호환 포맷으로 변환
   * - kebab-case 속성을 camelCase로 변환 (fill-rule → fillRule)
   * - class → className
   */
  private static convertSvgToJsx(svg: string): string {
    return svg
      // foreignObject 내 XHTML xmlns는 React에서 불필요 (자동 처리)
      .replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "")
      .replace(/\bfill-rule=/g, "fillRule=")
      .replace(/\bclip-rule=/g, "clipRule=")
      .replace(/\bstroke-width=/g, "strokeWidth=")
      .replace(/\bstroke-linecap=/g, "strokeLinecap=")
      .replace(/\bstroke-linejoin=/g, "strokeLinejoin=")
      .replace(/\bstroke-dasharray=/g, "strokeDasharray=")
      .replace(/\bstroke-dashoffset=/g, "strokeDashoffset=")
      .replace(/\bstroke-miterlimit=/g, "strokeMiterlimit=")
      .replace(/\bstroke-opacity=/g, "strokeOpacity=")
      .replace(/\bfill-opacity=/g, "fillOpacity=")
      .replace(/\bstop-color=/g, "stopColor=")
      .replace(/\bstop-opacity=/g, "stopOpacity=")
      .replace(/\bcolor-interpolation-filters=/g, "colorInterpolationFilters=")
      .replace(/\bflood-opacity=/g, "floodOpacity=")
      .replace(/\bflood-color=/g, "floodColor=")
      .replace(/\bxlink:href=/g, "xlinkHref=")
      .replace(/\bclass=/g, "className=")
      .replace(/\bstyle="([^"]*)"/g, (_, cssStr: string) => {
        const styleObj = cssStr
          .split(";")
          .filter((s: string) => s.trim())
          .map((s: string) => {
            const [key, ...rest] = s.split(":");
            const prop = key.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
            const value = rest.join(":").trim();
            return `${prop}: "${value}"`;
          })
          .join(", ");
        return `style={{ ${styleObj} }}`;
      });
  }

  /**
   * Container 노드 생성
   */
  private static generateContainerNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number,
    isRoot: boolean = false
  ): string {
    const indentStr = " ".repeat(indent);

    // 태그 결정
    const tag = this.getHtmlTag(node);
    let attrs = this.generateAttributes(node, styleStrategy, options);

    // 루트 요소에 restProps 전파 (input 타입은 내부 <input>에 전달하므로 스킵)
    if (isRoot && node.type !== "input") {
      attrs += " {...restProps}";
    }
    // input 타입 루트: children에 restProps 전달 플래그 설정
    if (isRoot && node.type === "input") {
      options = { ...options, _restPropsOnInput: true };
    }

    // Void elements는 항상 self-closing (자식 가질 수 없음)
    const isVoidElement = this.isVoidElement(tag);

    // childrenSlot 확인 (래퍼 컴포넌트의 {children} 렌더링)
    const childrenSlotName = node.type === "container" ? (node as ContainerNode).childrenSlot : undefined;

    // 자식이 없거나 void element이면 self-closing (단, childrenSlot이 있으면 open tag 유지)
    if (!childrenSlotName && (isVoidElement || !("children" in node) || !node.children || node.children.length === 0)) {
      return `${indentStr}<${tag}${attrs} />`;
    }

    // Loop 처리: ContainerNode에 loop이 있으면 .map() 렌더링
    if (node.type === "container" && node.loop) {
      const childrenJsx = this.generateLoopContent(node, styleStrategy, options, indent + 2);
      return `${indentStr}<${tag}${attrs}>
${childrenJsx}
${indentStr}</${tag}>`;
    }

    // Array Slot 확인
    const arraySlot = this.arraySlots.get(node.id);
    const parts: string[] = [];

    // childrenSlot을 먼저 렌더링
    if (childrenSlotName) {
      parts.push(`${" ".repeat(indent + 2)}{${childrenSlotName}}`);
    }

    if (arraySlot) {
      // Array Slot이 있으면 .map() 렌더링
      parts.push(this.generateArraySlotMap(arraySlot, node, styleStrategy, options, indent + 2));
    } else if ("children" in node && node.children && node.children.length > 0) {
      // 조건부 컴포넌트 map 패턴 감지
      const mapGroups = this.detectComponentMapGroups(node.children);
      if (mapGroups.length > 0) {
        // map 그룹에 속하는 자식 ID 추적
        const mappedChildIds = new Set<string>();
        const firstChildOfGroup = new Map<string, ComponentMapGroup>();
        for (const group of mapGroups) {
          for (const entry of group.entries) {
            mappedChildIds.add(entry.node.id);
          }
          firstChildOfGroup.set(group.entries[0].node.id, group);
        }

        // 자식 렌더링: map 그룹은 첫 번째 자식 위치에서 일괄 렌더링
        const childParts: string[] = [];
        for (const child of node.children) {
          if (mappedChildIds.has(child.id)) {
            const group = firstChildOfGroup.get(child.id);
            if (group) {
              childParts.push(this.generateComponentMapJsx(group, styleStrategy, options, indent + 2));
            }
            // 나머지 그룹 멤버는 스킵
          } else {
            childParts.push(this.generateNode(child, styleStrategy, options, indent + 2, false));
          }
        }
        parts.push(childParts.join("\n"));
      } else {
        // 일반 children 렌더링 (isRoot는 전파하지 않음)
        parts.push(
          node.children
            .map((child) => this.generateNode(child, styleStrategy, options, indent + 2, false))
            .join("\n")
        );
      }
    }

    const childrenJsx = parts.join("\n");

    return `${indentStr}<${tag}${attrs}>
${childrenJsx}
${indentStr}</${tag}>`;
  }

  /**
   * HTML void elements (자식을 가질 수 없는 태그들)
   */
  private static isVoidElement(tag: string): boolean {
    const voidElements = new Set([
      "area", "base", "br", "col", "embed", "hr", "img", "input",
      "link", "meta", "param", "source", "track", "wbr"
    ]);
    return voidElements.has(tag);
  }

  /**
   * HTML 태그 결정
   */
  private static getHtmlTag(node: UINode): string {
    switch (node.type) {
      case "button":
        return "button";
      case "input":
        // Input 컴포넌트는 wrapper div로 렌더링 (children 포함: label, helper-text 등)
        // 실제 <input> 태그는 내부 자식 노드에서 생성
        return "div";
      case "link":
        return "a";
      default:
        return "div";
    }
  }

  /**
   * 속성 생성
   */
  private static generateAttributes(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    opts?: { skipBindingAttrs?: boolean; inLoopContext?: boolean }
  ): string {
    const attrs: string[] = [];

    // 스타일 속성 (빈 스타일은 제외)
    if (node.styles && this.hasNonEmptyStyles(node.styles)) {
      const styleVarName = this.toStyleVariableName(node.id, node.name);
      const dynamicProps = this.extractDynamicProps(node.styles);

      // itemVariant ternary (loop 컨텍스트에서만)
      const itemVariantRef = (opts?.inLoopContext && node.styles.itemVariant)
        ? `isActive ? ${styleVarName}_activeCss : ${styleVarName}_inactiveCss`
        : "";

      if (dynamicProps.length > 0 || itemVariantRef) {
        if (styleStrategy.name === "emotion") {
          const refs = [styleVarName];
          if (itemVariantRef) refs.push(itemVariantRef);
          refs.push(...dynamicProps.map((prop) => this.buildDynamicStyleRef(styleVarName, prop)));
          attrs.push(`css={[${refs.join(", ")}]}`);
        } else {
          // compound prop("style+tone")を個別 prop に分解して含める
          const propArgs = [...new Set(dynamicProps
            .flatMap((prop) => prop.includes("+") ? prop.split("+") : [prop])
            .map((p) => p.replace(/[\x00-\x1f\x7f]/g, ""))
          )];
          // slot prop(ReactNode)은 boolean 변환 필요 (cva variant는 true/false)
          const propArgStrs = propArgs.map((p) =>
            this.slotProps.has(p) ? `${p}: !!${p}` : p
          );
          attrs.push(`className={${styleVarName}({ ${propArgStrs.join(", ")} })}`);
        }
      } else {
        const styleAttr = styleStrategy.getJsxStyleAttribute(styleVarName, false);
        attrs.push(`${styleAttr.attributeName}=${styleAttr.valueCode}`);
      }
    }

    // 디버그 속성
    if (options.debug) {
      attrs.push(`data-figma-id="${node.id}"`);
    }

    // bindings에서 attrs 처리 (loop 컨텍스트에서는 generateAttributesInLoop이 처리)
    if (node.bindings?.attrs && !opts?.skipBindingAttrs) {
      for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
        if ("prop" in source) {
          attrs.push(`${attrName}={${BindingRenderer.toExpression(source)}}`);
        } else if ("expr" in source) {
          attrs.push(`${attrName}={${BindingRenderer.toExpression(source)}}`);
        }
      }
    }

    // bindings에서 style 처리
    if (node.bindings?.style) {
      const styleEntries: string[] = [];
      for (const [cssKey, source] of Object.entries(node.bindings.style)) {
        if ("expr" in source) {
          styleEntries.push(`${cssKey}: ${BindingRenderer.toExpression(source)}`);
        } else if ("prop" in source) {
          styleEntries.push(`${cssKey}: ${BindingRenderer.toExpression(source)}`);
        } else if ("ref" in source) {
          styleEntries.push(`${cssKey}: "${source.ref}"`);
        }
      }
      if (styleEntries.length > 0) {
        attrs.push(`style={{ ${styleEntries.join(", ")} }}`);
      }
    }

    return attrs.length > 0 ? " " + attrs.join(" ") : "";
  }

  /**
   * Prop 이름 변환 (sourceKey → name)
   */
  private static resolvePropName(prop: string): string {
    const mapped = this.propRenameMap.get(prop);
    if (mapped) return mapped;

    // Fallback: 특수문자를 제거하여 유효한 JS 식별자로 변환
    const sanitized = prop
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, i) =>
        i === 0
          ? word.charAt(0).toLowerCase() + word.slice(1)
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join("");

    return sanitized || prop;
  }

  /**
   * ConditionNode를 코드로 변환
   */
  private static conditionToCode(condition: ConditionNode): string {
    switch (condition.type) {
      case "eq":
        return `${this.resolvePropName(condition.prop)} === ${JSON.stringify(condition.value)}`;

      case "neq":
        return `${this.resolvePropName(condition.prop)} !== ${JSON.stringify(condition.value)}`;

      case "truthy":
        return this.resolvePropName(condition.prop);

      case "and":
        return `(${condition.conditions.map((c) => this.conditionToCode(c)).join(" && ")})`;

      case "or":
        return `(${condition.conditions.map((c) => this.conditionToCode(c)).join(" || ")})`;

      case "not":
        return `!${this.conditionToCode(condition.condition)}`;

      default:
        return "true";
    }
  }

  /**
   * 스타일 변수명 조회 (StylesGenerator에서 생성된 이름 사용)
   */
  private static toStyleVariableName(nodeId: string, nodeName: string): string {
    // StylesGenerator에서 생성된 이름이 있으면 사용
    const mappedName = this.nodeStyleMap.get(nodeId);
    if (mappedName) {
      return mappedName;
    }

    // Fallback: ID 기반 네이밍 (하위 호환성)
    const safeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");

    // 영문/숫자만 추출하여 camelCase 변환
    const words = nodeName
      .replace(/[^a-zA-Z0-9\s]/g, " ") // 특수문자를 공백으로
      .split(/\s+/)
      .filter(Boolean);

    let base = words.length > 0
      ? words
          .map((word, i) =>
            i === 0
              ? word.toLowerCase()
              : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join("")
      : "unnamed";

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(base)) {
      base = "_" + base;
    }

    return `${base}_${safeId}`;
  }


  /**
   * StyleObject가 실제 스타일을 가지고 있는지 확인
   * (빈 스타일이면 css 속성을 생성하지 않음)
   */
  private static hasNonEmptyStyles(styles: StyleObject): boolean {
    // base 스타일이 있으면 true
    if (Object.keys(styles.base).length > 0) {
      return true;
    }

    // dynamic 스타일이 있으면 true
    if (styles.dynamic && styles.dynamic.length > 0) {
      return true;
    }

    // pseudo 스타일에서 base와 다른 속성이 있으면 true
    if (styles.pseudo) {
      for (const pseudoStyles of Object.values(styles.pseudo)) {
        for (const [key, value] of Object.entries(pseudoStyles)) {
          if (styles.base[key] !== value) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * dynamic 스타일에서 variant prop 이름들 추출
   */
  private static extractDynamicProps(styles: StyleObject): string[] {
    if (!styles.dynamic || styles.dynamic.length === 0) {
      return [];
    }

    // decomposer 결과 기반으로 실제 스타일이 있는 prop만 반환
    // (JSX에서 빈 스타일 변수 참조 방지)
    const groups = groupDynamicByProp(styles.dynamic);
    const propNames: string[] = [];

    for (const [propName, valueMap] of groups) {
      // 컴포넌트에서 참조 가능한 변수만 포함 (props 또는 파생 변수)
      // compound prop ("style+tone")은 구성 prop들이 모두 사용 가능해야 함
      if (propName.includes("+")) {
        const parts = propName.split("+");
        if (!parts.every((p) => this.availableVarNames.has(p))) continue;
      } else {
        if (!this.availableVarNames.has(propName)) continue;
      }

      // 최소 하나의 value에 실제 CSS 속성 또는 pseudo가 있는 경우만 포함
      const hasContent = [...valueMap.values()].some(
        (dv) => Object.keys(dv.style).length > 0 || !!dv.pseudo
      );
      if (hasContent) {
        propNames.push(propName);
      }
    }

    return propNames;
  }

  /**
   * dynamic style prop에 대한 Emotion css 배열 참조 코드 생성.
   * compound prop ("style+tone") → `varName_styleToneStyles?.[`${style}+${tone}`]`
   * single prop ("size") → `varName_sizeStyles?.[String(size)]`
   */
  private static buildDynamicStyleRef(styleVarName: string, prop: string): string {
    if (prop.includes("+")) {
      const parts = prop.split("+");
      const safeName = parts
        .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join("");
      // slot/boolean prop은 truthy/falsy → "true"/"false" 문자열로 변환
      const lookupParts = parts.map((p) =>
        (this.slotProps.has(p) || this.booleanProps.has(p))
          ? `\${${p} ? "true" : "false"}`
          : `\${${p}}`
      ).join("+");
      return `${styleVarName}_${safeName}Styles?.[\`${lookupParts}\`]`;
    }
    const safeProp = prop.replace(/[\x00-\x1f\x7f]/g, "");
    const capProp = safeProp.charAt(0).toUpperCase() + safeProp.slice(1);
    // boolean prop / slot prop → 개별 변수 삼항 참조
    if (this.booleanProps.has(safeProp) || this.slotProps.has(safeProp)) {
      return `${safeProp} ? ${styleVarName}_${safeProp}True : ${styleVarName}_${safeProp}False`;
    }
    // boolean + extraValues (예: boolean | "indeterminate") → String() 변환
    if (this.booleanWithExtras.has(safeProp)) {
      return `${styleVarName}_${safeProp}Styles?.[String(${safeProp})]`;
    }
    // string variant prop → 직접 인덱스
    return `${styleVarName}_${safeProp}Styles?.[${safeProp}]`;
  }

  /**
   * ConditionNode에서 모든 variant prop 이름 추출
   * and 조건의 경우 각 eq 조건의 prop을 모두 반환
   */
  private static extractAllVariantPropNames(condition: ConditionNode): string[] {
    return extractAllPropNames(condition);
  }

  /**
   * slot binding이 있는 노드를 CSS wrapper div로 감싸 렌더링
   * styles가 없어도 조건부 렌더링은 유지 (slot이 있을 때만 wrapper 표시)
   */
  private static generateSlotWrapper(
    node: UINode,
    slotProp: string,
    styleStrategy: IStyleStrategy,
    indent: number,
    extraCondition?: string
  ): string {
    const indentStr = " ".repeat(indent);
    const styleVarName = this.nodeStyleMap.get(node.id);
    const isInline = node.type === "text" || node.semanticType === "icon" || node.semanticType === "icon-wrapper";
    const tag = isInline ? "span" : "div";
    const condPrefix = extraCondition ? `${extraCondition} && ` : "";

    // 스타일이 없으면 조건부로 slot만 렌더링
    if (!styleVarName || !node.styles || !this.hasNonEmptyStyles(node.styles)) {
      return `${indentStr}{${condPrefix}${slotProp} && (\n${indentStr}  <${tag}>{${slotProp}}</${tag}>\n${indentStr})}`;
    }

    const dynamicProps = this.extractDynamicProps(node.styles);
    let wrapperAttrs: string;

    if (dynamicProps.length > 0) {
      if (styleStrategy.name === "emotion") {
        const dynamicStyleRefs = dynamicProps.map(
          (prop) => this.buildDynamicStyleRef(styleVarName, prop)
        );
        wrapperAttrs = `css={[${styleVarName}, ${dynamicStyleRefs.join(", ")}]}`;
      } else {
        const propArgs = [...new Set(dynamicProps
          .flatMap((prop) => prop.includes("+") ? prop.split("+") : [prop])
          .map((p) => p.replace(/[\x00-\x1f\x7f]/g, ""))
        )];
        const propArgStrs = propArgs.map((p) =>
          this.slotProps.has(p) ? `${p}: !!${p}` : p
        );
        wrapperAttrs = `className={${styleVarName}({ ${propArgStrs.join(", ")} })}`;
      }
    } else {
      const styleAttr = styleStrategy.getJsxStyleAttribute(styleVarName, false);
      wrapperAttrs = `${styleAttr.attributeName}=${styleAttr.valueCode}`;
    }

    return `${indentStr}{${condPrefix}${slotProp} && (\n${indentStr}  <${tag} ${wrapperAttrs}>{${slotProp}}</${tag}>\n${indentStr})}`;
  }

  // ============================================================
  // 조건부 컴포넌트 Map 패턴
  // ============================================================

  /**
   * 형제 노드 중 같은 prop의 eq 조건으로 분기되는 component 노드 그룹을 감지.
   *
   * 감지 조건:
   * - visibleCondition.type === "eq", 같은 prop, 다른 value
   * - type === "component"
   * - wrapper 스타일 없음 (간결한 map 생성을 위해)
   * - 3개 이상 (2개는 if/else로 충분)
   */
  private static detectComponentMapGroups(children: UINode[]): ComponentMapGroup[] {
    const byProp = new Map<string, Array<{ value: string; node: UINode }>>();

    for (const child of children) {
      if (!child.visibleCondition) continue;
      if (child.visibleCondition.type !== "eq") continue;
      if (child.type !== "component") continue;
      if (typeof child.visibleCondition.value !== "string") continue;
      // override props가 있으면 스킵 (각 컴포넌트에 다른 props 전달)
      if ("overrideProps" in child && child.overrideProps && Object.keys(child.overrideProps).length > 0) continue;
      // bindings.attrs가 있으면 스킵
      if (child.bindings?.attrs && Object.keys(child.bindings.attrs).length > 0) continue;

      const prop = child.visibleCondition.prop;
      const value = child.visibleCondition.value as string;

      if (!byProp.has(prop)) byProp.set(prop, []);
      byProp.get(prop)!.push({ value, node: child });
    }

    return Array.from(byProp.entries())
      .filter(([, entries]) => entries.length >= 3)
      .map(([propName, entries]) => {
        // wrapper 스타일이 모든 엔트리에서 동일한지 확인
        const hasSharedWrapper = this.hasIdenticalWrapperStyles(entries.map((e) => e.node));
        return { propName, entries, hasSharedWrapper };
      });
  }

  /**
   * 모든 노드의 wrapper 스타일이 동일한지 확인.
   * StylesGenerator가 생성한 변수명의 base CSS 내용을 비교.
   */
  private static hasIdenticalWrapperStyles(nodes: UINode[]): boolean {
    const styleKeys = nodes.map((node) => {
      if (!node.styles || !this.hasNonEmptyStyles(node.styles)) return "";
      // base + dynamic 구조를 JSON 직렬화해서 비교
      return JSON.stringify({
        base: node.styles.base,
        dynamic: node.styles.dynamic,
      });
    });

    // 모두 스타일 없음 → 동일 (wrapper 없음)
    if (styleKeys.every((k) => k === "")) return true;
    // 모두 같은 스타일 → 동일 (공유 wrapper)
    return styleKeys.every((k) => k === styleKeys[0]);
  }

  /**
   * 감지된 map 그룹을 JSX로 생성.
   *
   * 생성 패턴 (wrapper 없음):
   *   const StateComponent = { "Approved": Success, ... }[state];
   *   {StateComponent && <StateComponent />}
   *
   * 생성 패턴 (shared wrapper):
   *   const StateComponent = { "Approved": Success, ... }[state];
   *   {StateComponent && (
   *     <div css={[wrapperCss, wrapperCss_sizeStyles?.[size]]}>
   *       <StateComponent style={{ transform: "scale(0.681)" }} />
   *     </div>
   *   )}
   */
  private static generateComponentMapJsx(
    group: ComponentMapGroup,
    styleStrategy: IStyleStrategy,
    _options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);
    const propCode = this.resolvePropName(group.propName);

    // 변수명: prop 이름의 PascalCase + "Component" (예: state → StateComponent)
    const varName = group.propName.charAt(0).toUpperCase() + group.propName.slice(1) + "Component";

    // map entries: { "Approved": Success, "Rejected": Forbid, ... }
    const mapEntries = group.entries
      .map((e) => `${JSON.stringify(e.value)}: ${toComponentName(e.node.name)}`)
      .join(", ");

    // 변수 선언을 수집 (generate()에서 return 이전에 삽입)
    this.componentMapDeclarations.push(
      `  const ${varName} = { ${mapEntries} }[${propCode}];`
    );

    // shared wrapper가 있으면 wrapper div로 감싸기
    if (group.hasSharedWrapper) {
      const refNode = group.entries[0].node;
      if (refNode.styles && this.hasNonEmptyStyles(refNode.styles)) {
        const componentName = toComponentName(refNode.name);
        const wrapperStyleVarName = this.nodeStyleMap.get(refNode.id) || `_${componentName}_wrapperCss`;
        const dynamicProps = this.extractDynamicProps(refNode.styles);

        let wrapperAttrs: string;
        if (dynamicProps.length > 0) {
          if (styleStrategy.name === "emotion") {
            const dynamicStyleRefs = dynamicProps.map(
              (prop) => this.buildDynamicStyleRef(wrapperStyleVarName, prop)
            );
            wrapperAttrs = `css={[${wrapperStyleVarName}, ${dynamicStyleRefs.join(", ")}]}`;
          } else {
            const propArgs = [...new Set(dynamicProps
              .flatMap((prop) => prop.includes("+") ? prop.split("+") : [prop])
              .map((p) => p.replace(/[\x00-\x1f\x7f]/g, ""))
            )];
            const propArgStrs = propArgs.map((p) =>
              this.slotProps.has(p) ? `${p}: !!${p}` : p
            );
            wrapperAttrs = `className={${wrapperStyleVarName}({ ${propArgStrs.join(", ")} })}`;
          }
        } else {
          const styleAttr = styleStrategy.getJsxStyleAttribute(wrapperStyleVarName, false);
          wrapperAttrs = `${styleAttr.attributeName}=${styleAttr.valueCode}`;
        }

        // wrapper CSS가 INSTANCE 크기를 제어하고, 서브 컴포넌트는
        // width:100%/height:100%로 채우므로 instanceScale 불필요
        return [
          `${indentStr}{${varName} && (`,
          `${indentStr}  <div ${wrapperAttrs}>`,
          `${indentStr}    <${varName} />`,
          `${indentStr}  </div>`,
          `${indentStr})}`,
        ].join("\n");
      }
    }

    return `${indentStr}{${varName} && <${varName} />}`;
  }
}
