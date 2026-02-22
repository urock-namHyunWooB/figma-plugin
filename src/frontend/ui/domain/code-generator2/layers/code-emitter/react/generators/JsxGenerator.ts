/**
 * JsxGenerator
 *
 * UITree에서 React 컴포넌트 JSX 생성
 */

import type { UITree, UINode, ConditionNode, StyleObject } from "../../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { toComponentName } from "../../../../utils/nameUtils";

interface JsxGeneratorOptions {
  debug?: boolean;
  /** nodeId → styleVariableName 매핑 (StylesGenerator에서 생성) */
  nodeStyleMap?: Map<string, string>;
}

export class JsxGenerator {
  /**
   * 컴포넌트 코드 생성
   */
  static generate(
    uiTree: UITree,
    componentName: string,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions = {}
  ): string {
    // Slot props 설정 (조건부 렌더링에서 사용)
    this.slotProps = new Set(
      uiTree.props.filter((p) => p.type === "slot").map((p) => p.name)
    );

    // Prop rename 매핑 설정 (sourceKey → name)
    this.propRenameMap = new Map(
      uiTree.props.map((p) => [p.sourceKey, p.name])
    );

    // NodeStyleMap 설정
    this.nodeStyleMap = options.nodeStyleMap || new Map();

    // Props destructuring (별도 줄에서 수행)
    const propsDestructuring = this.generatePropsDestructuring(uiTree);

    // JSX body (루트 노드는 isRoot=true로 restProps 전파)
    const jsxBody = this.generateNode(uiTree.root, styleStrategy, options, 2, true);

    return `function ${componentName}(props) {
  const ${propsDestructuring} = props;

  return (
${jsxBody}
  );
}

export default ${componentName};`;
  }

  /**
   * Props destructuring 생성 (기본값 포함 + restProps)
   */
  private static generatePropsDestructuring(uiTree: UITree): string {
    if (uiTree.props.length === 0) {
      return "{ ...restProps }";
    }

    const propEntries = uiTree.props.map((p) => {
      // 기본값이 있으면 destructuring에 포함
      if (p.defaultValue !== undefined) {
        const defaultVal = this.formatDefaultValue(p.defaultValue);
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

  // sourceKey → name 매핑 (Figma prop 이름 → React prop 이름)
  private static propRenameMap: Map<string, string> = new Map();

  // nodeId → styleVariableName 매핑 (StylesGenerator에서 전달)
  private static nodeStyleMap: Map<string, string> = new Map();

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

    // Slot binding이 있으면 직접 slot prop 렌더링
    // slot prop의 경우 visibleCondition을 무시하고 prop 자체의 truthy만 체크
    // (둘 다 전달되면 둘 다 렌더링되어야 함)
    const slotBinding = node.bindings?.content;
    if (slotBinding && "prop" in slotBinding) {
      return `${indentStr}{${slotBinding.prop}}`;
    }

    // 조건부 렌더링
    if (node.visibleCondition) {
      // Slot prop으로 제어되는 component 노드인지 확인
      const slotProp = this.getSlotPropFromCondition(node.visibleCondition);
      if (slotProp && node.type === "component") {
        // Slot prop 값을 직접 렌더링
        return `${indentStr}{${slotProp}}`;
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
    const indentStr = " ".repeat(indent);

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
    const textBinding = node.bindings?.content;

    let textContent: string;
    if (textBinding && "prop" in textBinding) {
      // prop 바인딩이 있으면 prop 사용
      textContent = `{${textBinding.prop}}`;
    } else if (node.type === "text" && node.textSegments && node.textSegments.length > 0) {
      // textSegments가 있으면 실제 텍스트 렌더링
      textContent = node.textSegments.map(seg => seg.text).join("");
    } else {
      // 둘 다 없으면 주석
      textContent = `{/* ${node.name} */}`;
    }

    return `${indentStr}<span${attrs}>${textContent}</span>`;
  }

  /**
   * Component (외부 컴포넌트) 노드 생성
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
      // Slot으로 렌더링
      return `${indentStr}{${slotBinding.prop}}`;
    }

    // 일반 컴포넌트 렌더링
    const componentName = toComponentName(node.name);
    let attrs = this.generateAttributes(node, styleStrategy, options);

    // INSTANCE override props 추가
    if (node.type === "component" && "overrideProps" in node && node.overrideProps) {
      for (const [propName, value] of Object.entries(node.overrideProps)) {
        attrs += ` ${propName}="${value}"`;
      }
    }

    return `${indentStr}<${componentName}${attrs} />`;
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

    // SVG가 있으면 사용
    if (node.type === "vector" && "vectorSvg" in node && node.vectorSvg) {
      return `${indentStr}<span${attrs} dangerouslySetInnerHTML={{ __html: \`${node.vectorSvg}\` }} />`;
    }

    // placeholder
    return `${indentStr}<span${attrs}>{/* vector: ${node.name} */}</span>`;
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

    // 루트 요소에 restProps 전파
    if (isRoot) {
      attrs += " {...restProps}";
    }

    // 자식이 없으면 self-closing
    if (!("children" in node) || !node.children || node.children.length === 0) {
      return `${indentStr}<${tag}${attrs} />`;
    }

    // 자식 렌더링 (isRoot는 전파하지 않음)
    const childrenJsx = node.children
      .map((child) => this.generateNode(child, styleStrategy, options, indent + 2, false))
      .join("\n");

    return `${indentStr}<${tag}${attrs}>
${childrenJsx}
${indentStr}</${tag}>`;
  }

  /**
   * HTML 태그 결정
   */
  private static getHtmlTag(node: UINode): string {
    switch (node.type) {
      case "button":
        return "button";
      case "input":
        return "input";
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
    options: JsxGeneratorOptions
  ): string {
    const attrs: string[] = [];

    // 스타일 속성 (빈 스타일은 제외)
    if (node.styles && this.hasNonEmptyStyles(node.styles)) {
      const styleVarName = this.toStyleVariableName(node.id, node.name);
      const dynamicProps = this.extractDynamicProps(node.styles);

      if (dynamicProps.length > 0) {
        // 동적 스타일 포함
        const dynamicStyleRefs = dynamicProps.map(
          (prop) => `${styleVarName}_${prop}Styles[${prop}]`
        );

        if (styleStrategy.name === "emotion") {
          attrs.push(`css={[${styleVarName}, ${dynamicStyleRefs.join(", ")}]}`);
        } else {
          // Tailwind
          attrs.push(`className={cn(${styleVarName}, ${dynamicStyleRefs.join(", ")})}`);
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

    // bindings에서 attrs 처리
    if (node.bindings?.attrs) {
      for (const [attrName, source] of Object.entries(node.bindings.attrs)) {
        if ("prop" in source) {
          attrs.push(`${attrName}={${source.prop}}`);
        }
      }
    }

    return attrs.length > 0 ? " " + attrs.join(" ") : "";
  }

  /**
   * Prop 이름 변환 (sourceKey → name)
   */
  private static resolvePropName(prop: string): string {
    return this.propRenameMap.get(prop) || prop;
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

    const propNames = new Set<string>();

    for (const { condition } of styles.dynamic) {
      const propName = this.extractVariantPropName(condition);
      if (propName) {
        propNames.add(propName);
      }
    }

    return Array.from(propNames);
  }

  /**
   * ConditionNode에서 첫 번째 variant prop 이름 추출
   */
  private static extractVariantPropName(condition: ConditionNode): string | null {
    // eq 타입인 경우
    if (condition.type === "eq" && typeof condition.value === "string") {
      return condition.prop;
    }

    // and 타입인 경우 첫 번째 eq 조건 찾기
    if (condition.type === "and") {
      for (const cond of condition.conditions) {
        if (cond.type === "eq" && typeof cond.value === "string") {
          return cond.prop;
        }
      }
    }

    return null;
  }
}
