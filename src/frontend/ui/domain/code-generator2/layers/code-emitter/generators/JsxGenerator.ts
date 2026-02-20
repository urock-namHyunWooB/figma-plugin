/**
 * JsxGenerator
 *
 * UITree에서 React 컴포넌트 JSX 생성
 */

import type { UITree, UINode, ConditionNode } from "../../../types/types";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";

interface JsxGeneratorOptions {
  debug?: boolean;
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
    // Props destructuring
    const propsDestructuring = this.generatePropsDestructuring(uiTree);

    // JSX body
    const jsxBody = this.generateNode(uiTree.root, styleStrategy, options, 2);

    return `const ${componentName}: React.FC<${componentName}Props> = (${propsDestructuring}) => {
  return (
${jsxBody}
  );
};

export default ${componentName};`;
  }

  /**
   * Props destructuring 생성
   */
  private static generatePropsDestructuring(uiTree: UITree): string {
    if (uiTree.props.length === 0) {
      return "{}";
    }

    const propNames = uiTree.props.map((p) => p.name);
    return `{ ${propNames.join(", ")} }`;
  }

  /**
   * UINode를 JSX로 변환
   */
  private static generateNode(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);

    // 조건부 렌더링
    if (node.visibleCondition) {
      const condition = this.conditionToCode(node.visibleCondition);
      const innerJsx = this.generateNodeInner(node, styleStrategy, options, indent);
      return `${indentStr}{${condition} && (\n${innerJsx}\n${indentStr})}`;
    }

    return this.generateNodeInner(node, styleStrategy, options, indent);
  }

  /**
   * 노드 내부 JSX 생성
   */
  private static generateNodeInner(
    node: UINode,
    styleStrategy: IStyleStrategy,
    options: JsxGeneratorOptions,
    indent: number
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
        return this.generateContainerNode(node, styleStrategy, options, indent);
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
    const textContent = textBinding && "prop" in textBinding
      ? `{${textBinding.prop}}`
      : `{/* ${node.name} */}`;

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
    const componentName = this.toComponentName(node.name);
    const attrs = this.generateAttributes(node, styleStrategy, options);

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
    indent: number
  ): string {
    const indentStr = " ".repeat(indent);

    // 태그 결정
    const tag = this.getHtmlTag(node);
    const attrs = this.generateAttributes(node, styleStrategy, options);

    // 자식이 없으면 self-closing
    if (!("children" in node) || !node.children || node.children.length === 0) {
      return `${indentStr}<${tag}${attrs} />`;
    }

    // 자식 렌더링
    const childrenJsx = node.children
      .map((child) => this.generateNode(child, styleStrategy, options, indent + 2))
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

    // 스타일 속성
    if (node.styles) {
      const styleVarName = this.toStyleVariableName(node.name);
      const hasConditional = node.styles.dynamic && node.styles.dynamic.length > 0;
      const styleAttr = styleStrategy.getJsxStyleAttribute(styleVarName, hasConditional);
      attrs.push(`${styleAttr.attributeName}=${styleAttr.valueCode}`);
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
   * ConditionNode를 코드로 변환
   */
  private static conditionToCode(condition: ConditionNode): string {
    switch (condition.type) {
      case "eq":
        return `${condition.prop} === ${JSON.stringify(condition.value)}`;

      case "neq":
        return `${condition.prop} !== ${JSON.stringify(condition.value)}`;

      case "truthy":
        return condition.prop;

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
   * 스타일 변수명 생성
   */
  private static toStyleVariableName(nodeName: string): string {
    const base = nodeName
      .split(/[\s_-]+/)
      .map((word, i) =>
        i === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");

    return `${base}Styles`;
  }

  /**
   * 컴포넌트 이름 변환 (PascalCase)
   */
  private static toComponentName(name: string): string {
    return name
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }
}
