/**
 * ComponentGenerator
 *
 * DesignTree에서 React 컴포넌트 함수를 생성합니다.
 *
 * 생성 예시:
 * ```typescript
 * export default function Button(props: ButtonProps) {
 *   const { size = "Medium", leftIcon, text, ...restProps } = props;
 *
 *   return (
 *     <button css={buttonCss(size)} {...restProps}>
 *       {leftIcon && <span>{leftIcon}</span>}
 *       <span>{text}</span>
 *     </button>
 *   );
 * }
 * ```
 */

import ts from "typescript";
import type {
  DesignTree,
  DesignNode,
  ArraySlotInfo,
} from "@code-generator/types/architecture";
import type { ConditionNode } from "@code-generator/types/customType";
import type { IStyleStrategy } from "../style-strategy/IStyleStrategy";
import { capitalize } from "@code-generator/utils/stringUtils";
import SvgToJsx from "../utils/SvgToJsx";

/**
 * ComponentGenerator 옵션
 */
export interface ComponentGeneratorOptions {
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

/**
 * DesignTree에서 React 컴포넌트 함수를 생성하는 제너레이터
 */
class ComponentGenerator {
  /** TypeScript AST 노드 팩토리 */
  private factory: ts.NodeFactory;
  /** 생성 옵션 */
  private options: ComponentGeneratorOptions;

  /**
   * ComponentGenerator 생성자
   * @param factory - TypeScript AST 노드 팩토리
   * @param options - 생성 옵션 (debug 모드 등)
   */
  constructor(factory: ts.NodeFactory, options?: ComponentGeneratorOptions) {
    this.factory = factory;
    this.options = options || {};
  }

  /**
   * 컴포넌트 함수 선언문 생성
   * @param tree - DesignTree (컴포넌트 구조 정보)
   * @param componentName - 컴포넌트 이름
   * @param strategy - 스타일 전략 (Emotion/Tailwind)
   * @returns TypeScript 함수 선언문 AST
   */
  generate(
    tree: DesignTree,
    componentName: string,
    strategy: IStyleStrategy
  ): ts.FunctionDeclaration {
    const capitalizedName = capitalize(componentName);

    // JSX 트리 생성
    const jsxTree = this.createJsxTree(tree.root, tree, strategy);

    // Props 구조 분해 생성
    const { destructuring, arraySlotSafeStatements } =
      this.createPropsDestructuring(tree);

    // return statement의 expression 추출
    let returnExpression: ts.Expression;
    if (ts.isJsxExpression(jsxTree)) {
      returnExpression = jsxTree.expression || this.factory.createNull();
    } else {
      returnExpression = jsxTree;
    }

    // 함수 본문 구성
    const bodyStatements: ts.Statement[] = [
      destructuring,
      ...arraySlotSafeStatements,
      this.factory.createReturnStatement(returnExpression),
    ];

    return this.factory.createFunctionDeclaration(
      [
        this.factory.createModifier(ts.SyntaxKind.ExportKeyword),
        this.factory.createModifier(ts.SyntaxKind.DefaultKeyword),
      ],
      undefined,
      capitalizedName,
      undefined,
      [
        this.factory.createParameterDeclaration(
          undefined,
          undefined,
          this.factory.createIdentifier("props"),
          undefined,
          this.factory.createTypeReferenceNode(
            this.factory.createIdentifier(`${capitalizedName}Props`),
            undefined
          ),
          undefined
        ),
      ],
      undefined,
      this.factory.createBlock(bodyStatements, true)
    );
  }

  /**
   * DesignNode에서 JSX 트리를 재귀적으로 생성
   * @param node - 현재 처리 중인 DesignNode
   * @param tree - 전체 DesignTree
   * @param strategy - 스타일 전략
   * @returns JSX Element, SelfClosingElement, 또는 Expression AST
   */
  private createJsxTree(
    node: DesignNode,
    tree: DesignTree,
    strategy: IStyleStrategy
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // 타입 기반 렌더링: input 타입은 input 요소로 렌더링
    if (node.type === "input") {
      return this.createInputElement(node, tree, strategy);
    }

    // Slot 노드 체크 - slot으로 대체되는 노드는 {slotName}으로 렌더링
    const slotDef = tree.slots.find((s) => s.targetNodeId === node.id);
    if (slotDef) {
      // slot prop 찾기
      const slotProp = tree.props.find(
        (p) => p.type === "slot" && p.name === slotDef.name
      );

      // slot이 optional인 경우 (defaultValue가 있거나 required=false)
      const isOptional = slotProp && !slotProp.required;

      if (isOptional) {
        // {slotName ?? defaultContent} 또는 {slotName}
        return this.factory.createJsxExpression(
          undefined,
          this.factory.createIdentifier(slotDef.name)
        );
      } else {
        // 필수 slot: {slotName}
        return this.factory.createJsxExpression(
          undefined,
          this.factory.createIdentifier(slotDef.name)
        );
      }
    }

    // 외부 컴포넌트 참조
    if (node.externalRef) {
      return this.createExternalComponentJsx(node, tree);
    }

    // 일반 노드
    const tagName = this.getTagName(node);
    const attributes = this.createAttributes(node, tree, strategy);
    let children = this.createChildren(node, tree, strategy);

    // TEXT 노드 텍스트 처리
    if (node.type === "text") {
      // textSegments가 있으면 여러 span으로 분할
      if (node.textSegments && node.textSegments.length > 0) {
        const segmentElements = this.createTextSegments(node.textSegments);
        children = [...segmentElements, ...children];
      } else {
        const textContent = this.getTextContent(node, tree);
        if (textContent) {
          children = [textContent, ...children];
        }
      }
    }

    // VECTOR 노드 SVG 처리
    if (node.variantSvgs && Object.keys(node.variantSvgs).length > 1) {
      // 조건부 SVG 렌더링 (variant별 다른 SVG)
      return this.createConditionalSvgElement(node, attributes, tree);
    } else if (node.vectorSvg) {
      return this.createVectorSvgElement(node, attributes);
    }

    // 루트 노드에 children 추가
    if (!this.findParentNode(node, tree)) {
      const childrenExpression = this.factory.createJsxExpression(
        undefined,
        this.factory.createIdentifier("children")
      );
      children = [...children, childrenExpression];
    }

    return this.createJsxElement(tagName, attributes, children);
  }

  /**
   * 외부(의존성) 컴포넌트 참조를 위한 JSX 생성
   * @param node - externalRef가 있는 DesignNode
   * @param tree - 전체 DesignTree
   * @returns JSX SelfClosingElement AST
   */
  private createExternalComponentJsx(
    node: DesignNode,
    tree: DesignTree
  ): ts.JsxSelfClosingElement {
    const extRef = node.externalRef!;
    const tagIdentifier = this.factory.createIdentifier(extRef.componentName);

    const attributes: ts.JsxAttributeLike[] = [];

    // props 전달
    for (const [propName, propValue] of Object.entries(extRef.props)) {
      const resolvedPropName = this.renameConflictingPropName(propName);

      // propMappings가 있으면 부모 prop 이름으로 매핑
      // 예: labelText → option1Text
      const mappedPropName = extRef.propMappings?.[propName];
      const parentPropName = mappedPropName || resolvedPropName;

      const parentHasSameProp = tree.props.some(
        (p) => p.name === parentPropName
      );

      let jsxAttr: ts.JsxAttribute;
      if (parentHasSameProp) {
        // 부모 prop 참조 (매핑된 이름 사용)
        jsxAttr = this.factory.createJsxAttribute(
          this.factory.createIdentifier(resolvedPropName),
          this.factory.createJsxExpression(
            undefined,
            this.factory.createIdentifier(parentPropName)
          )
        );
      } else {
        // 고정값
        jsxAttr = this.createJsxAttributeWithValue(resolvedPropName, propValue);
      }

      attributes.push(jsxAttr);
    }

    const jsxAttributes = this.factory.createJsxAttributes(attributes);

    return this.factory.createJsxSelfClosingElement(
      tagIdentifier,
      undefined,
      jsxAttributes
    );
  }

  /**
   * 값 타입에 따라 JSX 속성 생성
   * @param name - 속성 이름
   * @param value - 속성 값 (boolean, number, string 등)
   * @returns JSX Attribute AST
   */
  private createJsxAttributeWithValue(
    name: string,
    value: unknown
  ): ts.JsxAttribute {
    const valueType = typeof value;

    if (valueType === "boolean") {
      return this.factory.createJsxAttribute(
        this.factory.createIdentifier(name),
        this.factory.createJsxExpression(
          undefined,
          value ? this.factory.createTrue() : this.factory.createFalse()
        )
      );
    } else if (valueType === "number") {
      return this.factory.createJsxAttribute(
        this.factory.createIdentifier(name),
        this.factory.createJsxExpression(
          undefined,
          this.factory.createNumericLiteral(Number(value))
        )
      );
    } else {
      return this.factory.createJsxAttribute(
        this.factory.createIdentifier(name),
        this.factory.createStringLiteral(String(value))
      );
    }
  }

  /**
   * 네이티브 HTML 속성과 충돌하는 prop 이름을 custom 접두사로 rename
   * @param propName - 원본 prop 이름
   * @returns 충돌 시 custom 접두사가 붙은 이름, 아니면 원본
   */
  private renameConflictingPropName(propName: string): string {
    const conflictingAttrs = [
      "disabled",
      "type",
      "value",
      "name",
      "id",
      "hidden",
      "checked",
      "selected",
      "required",
      "readOnly",
    ];

    const lowerPropName = propName.toLowerCase();
    if (conflictingAttrs.some((attr) => attr.toLowerCase() === lowerPropName)) {
      return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
    }

    return propName;
  }

  /**
   * DesignNode의 JSX Attributes 배열 생성
   * @param node - 현재 노드
   * @param tree - 전체 DesignTree
   * @param strategy - 스타일 전략
   * @returns JSX Attribute 배열
   */
  private createAttributes(
    node: DesignNode,
    tree: DesignTree,
    strategy: IStyleStrategy
  ): ts.JsxAttributeLike[] {
    const attributes: ts.JsxAttributeLike[] = [];

    // debug 모드: data-figma-id 속성
    if (this.options.debug && node.id) {
      attributes.push(
        this.factory.createJsxAttribute(
          this.factory.createIdentifier("data-figma-id"),
          this.factory.createStringLiteral(node.id)
        )
      );
    }

    // 스타일 속성
    const styleAttr = strategy.createStyleAttribute(node, tree.props);
    if (styleAttr) {
      attributes.push(styleAttr);
    }

    // TEXT 노드의 variant별 조건부 스타일 (color 등)
    if (node.type === "text" && node.propBindings) {
      const conditionalStyleAttr = this.createConditionalStyleAttribute(node, tree);
      if (conditionalStyleAttr) {
        attributes.push(conditionalStyleAttr);
      }
    }

    // 루트 노드에 restProps 추가
    if (!this.findParentNode(node, tree)) {
      attributes.push(
        this.factory.createJsxSpreadAttribute(
          this.factory.createIdentifier("restProps")
        )
      );
    }

    return attributes;
  }

  /**
   * TEXT 노드의 variant별 조건부 inline style 속성 생성
   * @param node - TEXT 타입 DesignNode
   * @param tree - 전체 DesignTree
   * @returns 조건부 style 속성 또는 null
   * @example style={variant === "primary" ? { color: "var(--White, #FFF)" } : undefined}
   */
  private createConditionalStyleAttribute(
    node: DesignNode,
    tree: DesignTree
  ): ts.JsxAttribute | null {
    // propBindings에서 text 바인딩 찾기
    let boundPropName: string | undefined;
    for (const [bindingKey, propName] of Object.entries(node.propBindings || {})) {
      if (bindingKey.includes("characters") || bindingKey.includes("text")) {
        boundPropName = propName;
        break;
      }
    }

    if (!boundPropName) return null;

    // bound prop의 정의 찾기
    const boundProp = tree.props.find((p) => p.name === boundPropName);
    if (!boundProp?.variantValue) return null;

    // 다른 variant의 관련 Text props 찾기
    const relatedTextProps = tree.props.filter(
      (p) =>
        p.name !== boundPropName &&
        p.name.endsWith("Text") &&
        p.variantValue &&
        p.variantValue !== boundProp.variantValue &&
        p.cssStyle // CSS 스타일이 있어야 함
    );

    if (relatedTextProps.length === 0) return null;

    // variant prop 찾기
    const allVariantValues = [
      boundProp.variantValue,
      ...relatedTextProps.map((p) => p.variantValue!),
    ];
    const variantProp = tree.props.find(
      (p) =>
        p.type === "variant" &&
        p.options &&
        allVariantValues.some((v) =>
          p.options!.some((opt) => opt.toLowerCase() === v.toLowerCase())
        )
    );
    if (!variantProp) return null;

    // 조건부 스타일 표현식 생성
    // style={variant === "primary" ? { color: "var(--White, #FFF)" } : undefined}
    let styleExpr: ts.Expression = this.factory.createIdentifier("undefined");

    for (const relatedProp of relatedTextProps) {
      if (!relatedProp.cssStyle) continue;

      // 스타일 객체 리터럴 생성 (color 속성만)
      const styleProps: ts.PropertyAssignment[] = [];
      if (relatedProp.cssStyle.color) {
        styleProps.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier("color"),
            this.factory.createStringLiteral(relatedProp.cssStyle.color)
          )
        );
      }

      if (styleProps.length === 0) continue;

      const styleObject = this.factory.createObjectLiteralExpression(styleProps);

      // variant === "relatedVariantValue" ? styleObject : currentExpr
      styleExpr = this.factory.createConditionalExpression(
        this.factory.createBinaryExpression(
          this.factory.createIdentifier(variantProp.name),
          this.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          this.factory.createStringLiteral(relatedProp.variantValue!)
        ),
        this.factory.createToken(ts.SyntaxKind.QuestionToken),
        styleObject,
        this.factory.createToken(ts.SyntaxKind.ColonToken),
        styleExpr
      );
    }

    // undefined만 있으면 필요 없음
    if (ts.isIdentifier(styleExpr) && styleExpr.text === "undefined") {
      return null;
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("style"),
      this.factory.createJsxExpression(undefined, styleExpr)
    );
  }

  /**
   * DesignNode의 자식 JSX 요소들 생성
   * @param node - 부모 노드
   * @param tree - 전체 DesignTree
   * @param strategy - 스타일 전략
   * @returns JSX Child 배열
   */
  private createChildren(
    node: DesignNode,
    tree: DesignTree,
    strategy: IStyleStrategy
  ): ts.JsxChild[] {
    const children: ts.JsxChild[] = [];

    // 배열 슬롯 확인
    const arraySlot = this.findArraySlotForNode(node, tree.arraySlots);
    const arraySlotNodeIds = new Set(arraySlot?.nodeIds ?? []);

    // 개별 슬롯 노드 및 그 자손 ID 수집
    // variant 병합 과정에서 slot 노드의 자식이 형제로 올라올 수 있으므로 모두 제외
    const slotDescendantIds = this.collectSlotDescendantIds(node, tree);

    for (const child of node.children) {
      // 배열 슬롯에 포함된 노드는 건너뛰기
      if (arraySlotNodeIds.has(child.id)) {
        continue;
      }

      // 슬롯 노드의 자손은 건너뛰기 (slot이 대체하므로 렌더링 불필요)
      if (slotDescendantIds.has(child.id)) {
        continue;
      }

      const childJsx = this.createJsxTree(child, tree, strategy);

      // 조건부 렌더링 처리
      if (child.conditions && child.conditions.length > 0) {
        const condition = this.convertConditionToTsExpression(
          child.conditions[0].condition
        );
        // JsxExpression인 경우 (slot 등) 조건을 앞에 결합
        if (ts.isJsxExpression(childJsx)) {
          const innerExpr = childJsx.expression;
          if (innerExpr) {
            // condition && (기존 expression)
            const combinedExpr = this.factory.createBinaryExpression(
              condition,
              this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
              this.factory.createParenthesizedExpression(innerExpr)
            );
            children.push(
              this.factory.createJsxExpression(undefined, combinedExpr)
            );
          } else {
            children.push(childJsx);
          }
        } else {
          const conditionalJsx = this.wrapWithConditionalRendering(
            condition,
            childJsx as ts.JsxElement | ts.JsxSelfClosingElement
          );
          children.push(conditionalJsx);
        }
      } else {
        children.push(childJsx as ts.JsxChild);
      }
    }

    // 배열 슬롯 .map() 표현식 추가
    if (arraySlot) {
      const mapExpression = this.createArraySlotMapExpression(arraySlot, tree);
      children.push(mapExpression);
    }

    return children;
  }

  /**
   * TEXT 노드의 텍스트 내용을 JSX로 변환
   * @param node - TEXT 타입 DesignNode
   * @param tree - 전체 DesignTree
   * @returns JSX Child 또는 null
   */
  private getTextContent(
    node: DesignNode,
    tree: DesignTree
  ): ts.JsxChild | null {
    // propBindings에서 텍스트 prop 참조 확인
    if (node.propBindings) {
      for (const [bindingKey, propName] of Object.entries(node.propBindings)) {
        if (bindingKey.includes("characters") || bindingKey.includes("text")) {
          // variant에 따른 조건부 렌더링 확인
          const conditionalExpr = this.createConditionalTextExpression(propName, tree);
          if (conditionalExpr) {
            return this.factory.createJsxExpression(undefined, conditionalExpr);
          }

          // 단순 prop 참조
          return this.factory.createJsxExpression(
            undefined,
            this.factory.createIdentifier(propName)
          );
        }
      }
    }

    // 고정 텍스트 (textContent에서 가져오기)
    if (node.textContent) {
      // 줄바꿈이 있으면 <br />로 분할하지 않고 그대로 출력
      // (줄바꿈 처리가 필요하면 별도 메서드로 분리)
      return this.factory.createJsxText(node.textContent, false);
    }

    return null;
  }

  /**
   * variant에 따른 조건부 텍스트 표현식 생성
   * @param boundPropName - 바인딩된 prop 이름
   * @param tree - 전체 DesignTree
   * @returns 조건부 삼항 연산 Expression 또는 null
   * @example variant === "primary" ? labelText : secondaryText
   */
  private createConditionalTextExpression(
    boundPropName: string,
    tree: DesignTree
  ): ts.Expression | null {
    // bound prop의 정의 찾기
    const boundProp = tree.props.find((p) => p.name === boundPropName);
    if (!boundProp?.variantValue) {
      return null; // variantValue가 없으면 조건부 렌더링 불필요
    }

    // Text로 끝나는 다른 prop 중 다른 variantValue를 가진 것 찾기
    const relatedTextProps = tree.props.filter(
      (p) =>
        p.name !== boundPropName &&
        p.name.endsWith("Text") &&
        p.variantValue &&
        p.variantValue !== boundProp.variantValue
    );

    if (relatedTextProps.length === 0) {
      return null; // 관련 prop이 없으면 조건부 렌더링 불필요
    }

    // variant prop 찾기: variantValue들을 옵션으로 가진 prop 찾기
    const allVariantValues = [
      boundProp.variantValue,
      ...relatedTextProps.map((p) => p.variantValue!),
    ];
    const variantProp = tree.props.find(
      (p) =>
        p.type === "variant" &&
        p.options &&
        allVariantValues.some((v) =>
          p.options!.some((opt) => opt.toLowerCase() === v.toLowerCase())
        )
    );
    if (!variantProp) {
      return null; // variant prop이 없으면 조건부 렌더링 불가
    }

    // 조건부 표현식 생성: variant === "primary" ? labelText : secondaryText
    // 여러 variant가 있으면 체인으로 연결
    let expr: ts.Expression = this.factory.createIdentifier(boundPropName);

    for (const relatedProp of relatedTextProps) {
      // variant === "relatedVariantValue" ? relatedProp : currentExpr
      expr = this.factory.createConditionalExpression(
        this.factory.createBinaryExpression(
          this.factory.createIdentifier(variantProp.name),
          this.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          this.factory.createStringLiteral(relatedProp.variantValue!)
        ),
        this.factory.createToken(ts.SyntaxKind.QuestionToken),
        this.factory.createIdentifier(relatedProp.name),
        this.factory.createToken(ts.SyntaxKind.ColonToken),
        expr
      );
    }

    return expr;
  }

  /**
   * textSegments를 개별 스타일이 적용된 span 요소들로 변환
   * @param segments - 텍스트 세그먼트 배열 (텍스트, 스타일 인덱스, 스타일 정보)
   * @returns JSX Child 배열 (JsxText 또는 span JsxElement)
   */
  private createTextSegments(
    segments: Array<{
      text: string;
      styleIndex: number;
      style: Record<string, string> | null;
    }>
  ): ts.JsxChild[] {
    return segments.map((segment) => {
      if (!segment.style || Object.keys(segment.style).length === 0) {
        // 스타일이 없으면 텍스트만 반환
        return this.factory.createJsxText(segment.text, false);
      }

      // 스타일이 있으면 span으로 감싸기
      const styleProps: ts.PropertyAssignment[] = [];
      for (const [key, value] of Object.entries(segment.style)) {
        styleProps.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(key),
            this.factory.createStringLiteral(value)
          )
        );
      }

      const styleAttribute = this.factory.createJsxAttribute(
        this.factory.createIdentifier("style"),
        this.factory.createJsxExpression(
          undefined,
          this.factory.createObjectLiteralExpression(styleProps, false)
        )
      );

      return this.factory.createJsxElement(
        this.factory.createJsxOpeningElement(
          this.factory.createIdentifier("span"),
          undefined,
          this.factory.createJsxAttributes([styleAttribute])
        ),
        [this.factory.createJsxText(segment.text, false)],
        this.factory.createJsxClosingElement(
          this.factory.createIdentifier("span")
        )
      );
    });
  }

  /**
   * VECTOR 노드의 SVG 문자열을 JSX SVG 요소로 변환
   * @param node - vectorSvg가 있는 DesignNode
   * @param attributes - 추가 JSX 속성들
   * @returns JSX Element 또는 SelfClosingElement
   */
  private createVectorSvgElement(
    node: DesignNode,
    attributes: ts.JsxAttributeLike[]
  ): ts.JsxElement | ts.JsxSelfClosingElement {
    const svgString = node.vectorSvg;

    if (!svgString) {
      // SVG 문자열이 없으면 빈 svg 태그 반환
      return this.factory.createJsxSelfClosingElement(
        this.factory.createIdentifier("svg"),
        undefined,
        this.factory.createJsxAttributes(attributes)
      );
    }

    // SvgToJsx 유틸리티로 SVG 문자열을 JSX AST로 변환
    const svgToJsx = new SvgToJsx();
    const svgJsx = svgToJsx.convert(svgString);

    if (svgJsx) {
      // 성공적으로 변환된 경우: css 속성 병합
      if (ts.isJsxSelfClosingElement(svgJsx)) {
        const existingAttrs = svgJsx.attributes.properties;
        const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
        return this.factory.createJsxSelfClosingElement(
          svgJsx.tagName,
          undefined,
          this.factory.createJsxAttributes(mergedAttrs)
        );
      } else if (ts.isJsxElement(svgJsx)) {
        const existingAttrs = svgJsx.openingElement.attributes.properties;
        const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
        return this.factory.createJsxElement(
          this.factory.createJsxOpeningElement(
            svgJsx.openingElement.tagName,
            undefined,
            this.factory.createJsxAttributes(mergedAttrs)
          ),
          svgJsx.children,
          svgJsx.closingElement
        );
      }
    }

    // 변환 실패 시 fallback: 빈 svg 태그
    return this.factory.createJsxSelfClosingElement(
      this.factory.createIdentifier("svg"),
      undefined,
      this.factory.createJsxAttributes(attributes)
    );
  }

  /**
   * variant별 다른 SVG를 조건부로 렌더링하는 JSX 표현식 생성
   * @param node - variantSvgs가 있는 DesignNode
   * @param attributes - 추가 JSX 속성들
   * @param tree - 전체 DesignTree
   * @returns 조건부 삼항 연산 JSX Expression
   * @example variantSvgs: { "Size=Normal": "<svg>...", "Size=Large": "<svg>..." }
   *          결과: size === "Normal" ? <SvgNormal /> : <SvgLarge />
   */
  private createConditionalSvgElement(
    node: DesignNode,
    attributes: ts.JsxAttributeLike[],
    tree: DesignTree
  ): ts.JsxExpression {
    const variantSvgs = node.variantSvgs!;
    const entries = Object.entries(variantSvgs);

    // 첫 번째 entry에서 prop 이름 추출 ("Size=Normal" → "size")
    const [firstKey] = entries[0];
    const propMatch = firstKey.match(/^([^=]+)=(.+)$/);
    const rawPropName = propMatch ? propMatch[1].toLowerCase() : "variant";
    // HTML 속성과 충돌하는 이름은 custom prefix 적용 (checked → customChecked)
    const propName = this.renameConflictingPropName(rawPropName);

    // SVG를 JSX로 변환
    const svgToJsx = new SvgToJsx();
    const svgJsxMap: Array<{ value: string; jsx: ts.JsxChild }> = [];

    for (const [variantName, svgString] of entries) {
      const valueMatch = variantName.match(/^[^=]+=(.+)$/);
      const value = valueMatch ? valueMatch[1] : variantName;

      const svgJsx = svgToJsx.convert(svgString);
      if (svgJsx) {
        // css 속성 추가
        if (ts.isJsxSelfClosingElement(svgJsx)) {
          const existingAttrs = svgJsx.attributes.properties;
          const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
          const mergedSvg = this.factory.createJsxSelfClosingElement(
            svgJsx.tagName,
            undefined,
            this.factory.createJsxAttributes(mergedAttrs)
          );
          svgJsxMap.push({ value, jsx: mergedSvg });
        } else if (ts.isJsxElement(svgJsx)) {
          const existingAttrs = svgJsx.openingElement.attributes.properties;
          const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
          const mergedSvg = this.factory.createJsxElement(
            this.factory.createJsxOpeningElement(
              svgJsx.openingElement.tagName,
              undefined,
              this.factory.createJsxAttributes(mergedAttrs)
            ),
            svgJsx.children,
            svgJsx.closingElement
          );
          svgJsxMap.push({ value, jsx: mergedSvg });
        }
      }
    }

    if (svgJsxMap.length === 0) {
      // fallback: 빈 svg
      return this.factory.createJsxExpression(
        undefined,
        this.factory.createNull()
      );
    }

    // 삼항 연산자 체인 생성: size === "Normal" ? svg1 : size === "Large" ? svg2 : null
    let conditionalExpr: ts.Expression = svgJsxMap[svgJsxMap.length - 1]
      .jsx as unknown as ts.Expression;

    for (let i = svgJsxMap.length - 2; i >= 0; i--) {
      const { value, jsx } = svgJsxMap[i];
      const condition = this.factory.createBinaryExpression(
        this.factory.createIdentifier(propName),
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        this.factory.createStringLiteral(value)
      );
      conditionalExpr = this.factory.createConditionalExpression(
        condition,
        undefined,
        jsx as unknown as ts.Expression,
        undefined,
        conditionalExpr
      );
    }

    return this.factory.createJsxExpression(undefined, conditionalExpr);
  }

  /**
   * 태그 이름, 속성, 자식으로 JSX Element 생성
   * @param tagName - HTML 태그 이름
   * @param attributes - JSX 속성 배열
   * @param children - 자식 JSX 요소 배열
   * @returns 자식이 없으면 SelfClosingElement, 있으면 JsxElement
   */
  private createJsxElement(
    tagName: string,
    attributes: ts.JsxAttributeLike[],
    children: ts.JsxChild[]
  ): ts.JsxElement | ts.JsxSelfClosingElement {
    const tagIdentifier = this.factory.createIdentifier(tagName);
    const jsxAttributes = this.factory.createJsxAttributes(attributes);

    if (children.length === 0) {
      return this.factory.createJsxSelfClosingElement(
        tagIdentifier,
        undefined,
        jsxAttributes
      );
    }

    return this.factory.createJsxElement(
      this.factory.createJsxOpeningElement(
        tagIdentifier,
        undefined,
        jsxAttributes
      ),
      children,
      this.factory.createJsxClosingElement(tagIdentifier)
    );
  }

  /**
   * 배열 슬롯을 위한 .map() 호출 JSX 표현식 생성
   * @param slot - 배열 슬롯 정보
   * @param tree - 전체 DesignTree
   * @returns {slotName.map((item, index) => <Component key={index} {...item} />)} 형태의 JSX Expression
   */
  private createArraySlotMapExpression(
    slot: ArraySlotInfo,
    tree: DesignTree
  ): ts.JsxExpression {
    // itemType이 유효한 컴포넌트 이름인지 확인하고, 아니면 slot.name에서 파생
    const componentName = this.resolveArraySlotComponentName(slot);

    // 배열 슬롯 아이템의 props 생성
    // 각 prop을 item.propName 형태로 생성
    const attributes: ts.JsxAttributeLike[] = [
      // key prop은 항상 필요
      this.factory.createJsxAttribute(
        this.factory.createIdentifier("key"),
        this.factory.createJsxExpression(
          undefined,
          this.factory.createIdentifier("index")
        )
      ),
    ];

    // itemProps가 있으면 개별 props 생성, 없으면 spread 사용
    if (slot.itemProps && slot.itemProps.length > 0) {
      // 개별 props 생성: size={item.size}, text={item.text} 등
      for (const prop of slot.itemProps) {
        const propAccess = this.factory.createPropertyAccessExpression(
          this.factory.createIdentifier("item"),
          this.factory.createIdentifier(prop.name)
        );
        attributes.push(
          this.factory.createJsxAttribute(
            this.factory.createIdentifier(prop.name),
            this.factory.createJsxExpression(undefined, propAccess)
          )
        );
      }
    } else {
      // itemProps가 없으면 spread 사용: {...item}
      attributes.push(
        this.factory.createJsxSpreadAttribute(
          this.factory.createIdentifier("item")
        )
      );
    }

    // (item, index) => <ComponentName key={index} size={item.size} ... />
    const arrowFunction = this.factory.createArrowFunction(
      undefined,
      undefined,
      [
        this.factory.createParameterDeclaration(undefined, undefined, "item"),
        this.factory.createParameterDeclaration(undefined, undefined, "index"),
      ],
      undefined,
      this.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      this.factory.createJsxSelfClosingElement(
        this.factory.createIdentifier(componentName),
        undefined,
        this.factory.createJsxAttributes(attributes)
      )
    );

    // slotName.map(...)
    const mapCall = this.factory.createCallExpression(
      this.factory.createPropertyAccessExpression(
        this.factory.createIdentifier(slot.name),
        this.factory.createIdentifier("map")
      ),
      undefined,
      [arrowFunction]
    );

    return this.factory.createJsxExpression(undefined, mapCall);
  }

  /**
   * Props 구조 분해 할당 선언문 생성
   * @param tree - DesignTree (props 정보 포함)
   * @returns destructuring 선언문과 배열 슬롯 안전화 문장들
   */
  private createPropsDestructuring(tree: DesignTree): {
    destructuring: ts.VariableStatement;
    arraySlotSafeStatements: ts.VariableStatement[];
  } {
    const bindingElements: ts.BindingElement[] = [];
    const arraySlotSafeStatements: ts.VariableStatement[] = [];
    const arraySlotNames = new Set(tree.arraySlots.map((s) => s.name));

    // 일반 props
    for (const prop of tree.props) {
      if (arraySlotNames.has(prop.name.toLowerCase())) {
        continue;
      }

      const defaultValue =
        prop.defaultValue !== undefined
          ? this.valueToExpression(prop.defaultValue)
          : undefined;

      bindingElements.push(
        this.factory.createBindingElement(
          undefined,
          undefined,
          this.factory.createIdentifier(prop.name),
          defaultValue
        )
      );
    }

    // 배열 슬롯 props
    for (const slotName of arraySlotNames) {
      const rawVarName = `_raw${slotName.charAt(0).toUpperCase()}${slotName.slice(1)}`;

      // 구조 분해
      bindingElements.push(
        this.factory.createBindingElement(
          undefined,
          this.factory.createIdentifier(slotName),
          this.factory.createIdentifier(rawVarName),
          undefined
        )
      );

      // 안전화 문장: const slotName = Array.isArray(_rawSlotName) ? _rawSlotName : [];
      arraySlotSafeStatements.push(
        this.factory.createVariableStatement(
          undefined,
          this.factory.createVariableDeclarationList(
            [
              this.factory.createVariableDeclaration(
                this.factory.createIdentifier(slotName),
                undefined,
                undefined,
                this.factory.createConditionalExpression(
                  this.factory.createCallExpression(
                    this.factory.createPropertyAccessExpression(
                      this.factory.createIdentifier("Array"),
                      this.factory.createIdentifier("isArray")
                    ),
                    undefined,
                    [this.factory.createIdentifier(rawVarName)]
                  ),
                  this.factory.createToken(ts.SyntaxKind.QuestionToken),
                  this.factory.createIdentifier(rawVarName),
                  this.factory.createToken(ts.SyntaxKind.ColonToken),
                  this.factory.createArrayLiteralExpression([])
                )
              ),
            ],
            ts.NodeFlags.Const
          )
        )
      );
    }

    // children prop
    bindingElements.push(
      this.factory.createBindingElement(
        undefined,
        undefined,
        this.factory.createIdentifier("children"),
        undefined
      )
    );

    // rest props
    bindingElements.push(
      this.factory.createBindingElement(
        this.factory.createToken(ts.SyntaxKind.DotDotDotToken),
        undefined,
        this.factory.createIdentifier("restProps"),
        undefined
      )
    );

    const destructuring = this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createObjectBindingPattern(bindingElements),
            undefined,
            undefined,
            this.factory.createIdentifier("props")
          ),
        ],
        ts.NodeFlags.Const
      )
    );

    return { destructuring, arraySlotSafeStatements };
  }

  /**
   * JavaScript 값을 TypeScript Expression AST로 변환
   * @param value - 변환할 값 (string, number, boolean, null 등)
   * @returns TypeScript Expression AST
   */
  private valueToExpression(value: unknown): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    if (value === null) {
      return this.factory.createNull();
    }
    return this.factory.createStringLiteral(String(value));
  }

  /**
   * type이 input인 노드를 HTML input 요소로 렌더링
   * @param node - input 타입 DesignNode
   * @param tree - 전체 DesignTree
   * @param strategy - 스타일 전략
   * @returns input JSX SelfClosingElement
   */
  private createInputElement(
    node: DesignNode,
    tree: DesignTree,
    strategy: IStyleStrategy
  ): ts.JsxSelfClosingElement {
    const attrs: ts.JsxAttributeLike[] = [];

    // debug 모드: data-figma-id 속성
    if (this.options.debug && node.id) {
      attrs.push(
        this.factory.createJsxAttribute(
          this.factory.createIdentifier("data-figma-id"),
          this.factory.createStringLiteral(node.id)
        )
      );
    }

    // 1. type 속성
    attrs.push(
      this.factory.createJsxAttribute(
        this.factory.createIdentifier("type"),
        this.factory.createStringLiteral("text")
      )
    );

    // 2. placeholder 속성 (node.placeholder에서 가져옴)
    if (node.placeholder) {
      attrs.push(
        this.factory.createJsxAttribute(
          this.factory.createIdentifier("placeholder"),
          this.factory.createStringLiteral(node.placeholder)
        )
      );
    }

    // 3. 스타일 속성 (폰트, 크기 등 유지)
    const styleAttr = strategy.createStyleAttribute(node, tree.props);
    if (styleAttr) {
      attrs.push(styleAttr);
    }

    return this.factory.createJsxSelfClosingElement(
      this.factory.createIdentifier("input"),
      undefined,
      this.factory.createJsxAttributes(attrs)
    );
  }

  /**
   * DesignNode의 semanticRole에 따라 HTML 태그 이름 결정
   * @param node - DesignNode
   * @returns HTML 태그 이름 (button, span, img, svg, div 등)
   */
  private getTagName(node: DesignNode): string {
    switch (node.semanticRole) {
      case "button":
        return "button";
      case "text":
        return "span";
      case "image":
        return "img";
      case "vector":
        return node.vectorSvg ? "svg" : "div";
      case "icon":
        return "span";
      case "container":
      case "root":
      default:
        return "div";
    }
  }

  /**
   * DesignTree에서 특정 노드의 부모 노드 찾기
   * @param node - 대상 노드
   * @param tree - 전체 DesignTree
   * @returns 부모 노드 또는 null (루트 노드인 경우)
   */
  private findParentNode(
    node: DesignNode,
    tree: DesignTree
  ): DesignNode | null {
    const findParent = (
      current: DesignNode,
      target: DesignNode
    ): DesignNode | null => {
      for (const child of current.children) {
        if (child.id === target.id) {
          return current;
        }
        const found = findParent(child, target);
        if (found) return found;
      }
      return null;
    };

    return tree.root.id === node.id ? null : findParent(tree.root, node);
  }

  /**
   * 노드의 자식 중 배열 슬롯에 포함된 노드가 있는지 확인
   * @param node - 부모 노드
   * @param arraySlots - 배열 슬롯 정보 목록
   * @returns 해당하는 ArraySlotInfo 또는 undefined
   */
  private findArraySlotForNode(
    node: DesignNode,
    arraySlots: ArraySlotInfo[]
  ): ArraySlotInfo | undefined {
    // 자식 노드 ID가 슬롯에 포함되어 있는지 확인
    for (const slot of arraySlots) {
      const slotNodeIds = new Set(slot.nodeIds);
      for (const child of node.children) {
        if (slotNodeIds.has(child.id)) {
          return slot;
        }
      }
    }
    return undefined;
  }

  /**
   * 조건 표현식을 TypeScript Expression AST로 변환
   * @param condition - ConditionNode (BinaryExpression, UnaryExpression, MemberExpression, Literal 등)
   * @returns TypeScript Expression AST
   */
  private convertConditionToTsExpression(condition: unknown): ts.Expression {
    const node = condition as ConditionNode | null;

    if (!node || typeof node !== "object" || !("type" in node)) {
      return this.factory.createTrue(); // fallback
    }

    switch (node.type) {
      case "BinaryExpression":
        return this.convertBinaryExpression(node as any);

      case "UnaryExpression":
        return this.convertUnaryExpression(node as any);

      case "MemberExpression":
        return this.convertMemberExpression(node as any);

      case "Literal":
        return this.convertLiteral(node as any);

      case "LogicalExpression":
        // LogicalExpression (&&, ||)도 BinaryExpression으로 처리
        return this.convertBinaryExpression(node as any);

      case "Identifier":
        return this.convertIdentifier(node as any);

      case "CallExpression":
        return this.convertCallExpression(node as any);

      case "ArrayExpression":
        return this.convertArrayExpression(node as any);

      default:
        return this.factory.createTrue(); // fallback
    }
  }

  /**
   * BinaryExpression을 TypeScript BinaryExpression으로 변환
   * @param node - BinaryExpression 조건 노드
   * @returns TypeScript BinaryExpression AST
   * @example props.size === 'L'
   */
  private convertBinaryExpression(node: any): ts.Expression {
    const left = this.convertConditionToTsExpression(node.left);
    const right = this.convertConditionToTsExpression(node.right);

    const operatorMap: Record<string, ts.SyntaxKind> = {
      "===": ts.SyntaxKind.EqualsEqualsEqualsToken,
      "!==": ts.SyntaxKind.ExclamationEqualsEqualsToken,
      "==": ts.SyntaxKind.EqualsEqualsToken,
      "!=": ts.SyntaxKind.ExclamationEqualsToken,
      "<": ts.SyntaxKind.LessThanToken,
      "<=": ts.SyntaxKind.LessThanEqualsToken,
      ">": ts.SyntaxKind.GreaterThanToken,
      ">=": ts.SyntaxKind.GreaterThanEqualsToken,
      "&&": ts.SyntaxKind.AmpersandAmpersandToken,
      "||": ts.SyntaxKind.BarBarToken,
      "+": ts.SyntaxKind.PlusToken,
      "-": ts.SyntaxKind.MinusToken,
      "*": ts.SyntaxKind.AsteriskToken,
      "/": ts.SyntaxKind.SlashToken,
      "%": ts.SyntaxKind.PercentToken,
    };

    const syntaxKind =
      operatorMap[node.operator] || ts.SyntaxKind.EqualsEqualsEqualsToken;

    return this.factory.createBinaryExpression(
      left,
      this.factory.createToken(syntaxKind) as ts.BinaryOperatorToken,
      right
    );
  }

  /**
   * UnaryExpression을 TypeScript PrefixUnaryExpression으로 변환
   * @param node - UnaryExpression 조건 노드
   * @returns TypeScript PrefixUnaryExpression AST
   * @example !props.isOpen
   */
  private convertUnaryExpression(node: any): ts.PrefixUnaryExpression {
    const operand = this.convertConditionToTsExpression(node.argument);
    const operatorKind =
      node.operator === "!"
        ? ts.SyntaxKind.ExclamationToken
        : ts.SyntaxKind.MinusToken;

    return this.factory.createPrefixUnaryExpression(operatorKind, operand);
  }

  /**
   * MemberExpression을 TypeScript Expression으로 변환
   * props 객체 참조 시 구조 분해된 변수를 직접 사용
   * @param node - MemberExpression 조건 노드
   * @returns TypeScript Expression AST
   * @example props.size → size
   */
  private convertMemberExpression(node: any): ts.Expression {
    // props.X 형태인 경우, 구조 분해된 변수 X를 직접 사용
    if (
      node.object?.type === "Identifier" &&
      node.object?.name === "props" &&
      !node.computed
    ) {
      const propertyName = node.property?.name || node.property;
      return this.factory.createIdentifier(propertyName);
    }

    const object = this.convertConditionToTsExpression(node.object);

    // computed가 true면 bracket notation, false면 dot notation
    if (node.computed) {
      const property = this.convertConditionToTsExpression(node.property);
      return this.factory.createElementAccessExpression(object, property);
    } else {
      const propertyName = node.property?.name || node.property;
      return this.factory.createPropertyAccessExpression(
        object,
        this.factory.createIdentifier(propertyName)
      );
    }
  }

  /**
   * Identifier를 TypeScript Identifier로 변환
   * @param node - Identifier 조건 노드
   * @returns TypeScript Identifier AST
   */
  private convertIdentifier(node: any): ts.Identifier {
    const name = node.name || "unknown";
    return this.factory.createIdentifier(name);
  }

  /**
   * Literal을 TypeScript Literal Expression으로 변환
   * @param node - Literal 조건 노드
   * @returns TypeScript Literal Expression AST (StringLiteral, NumericLiteral, True, False, Null)
   */
  private convertLiteral(node: any): ts.Expression {
    const value = node.value;

    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    if (value === null) {
      return this.factory.createNull();
    }

    return this.factory.createStringLiteral(String(value));
  }

  /**
   * CallExpression을 TypeScript CallExpression으로 변환
   * @param node - CallExpression 조건 노드
   * @returns TypeScript CallExpression AST
   * @example ["a", "b"].includes(prop)
   */
  private convertCallExpression(node: any): ts.CallExpression {
    const callee = this.convertConditionToTsExpression(node.callee);
    const args = (node.arguments || []).map((arg: any) =>
      this.convertConditionToTsExpression(arg)
    );
    return this.factory.createCallExpression(callee, undefined, args);
  }

  /**
   * ArrayExpression을 TypeScript ArrayLiteralExpression으로 변환
   * @param node - ArrayExpression 조건 노드
   * @returns TypeScript ArrayLiteralExpression AST
   * @example ["a", "b", "c"]
   */
  private convertArrayExpression(node: any): ts.ArrayLiteralExpression {
    const elements = (node.elements || []).map((el: any) =>
      this.convertConditionToTsExpression(el)
    );
    return this.factory.createArrayLiteralExpression(elements);
  }

  /**
   * JSX 요소를 조건부 렌더링 표현식으로 감싸기
   * @param condition - 조건 Expression
   * @param element - 감쌀 JSX 요소
   * @returns {condition && element} 형태의 JSX Expression
   */
  private wrapWithConditionalRendering(
    condition: ts.Expression,
    element: ts.JsxElement | ts.JsxSelfClosingElement
  ): ts.JsxExpression {
    const conditionalExpression = this.factory.createBinaryExpression(
      condition,
      this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
      element
    );

    return this.factory.createJsxExpression(undefined, conditionalExpression);
  }

  /**
   * 슬롯 노드의 자손 ID들을 수집
   *
   * variant 병합 과정에서 슬롯 노드(예: INSTANCE)의 자식들이
   * 상위 노드의 형제로 올라올 수 있음. 이들은 슬롯이 대체하므로 렌더링에서 제외해야 함.
   *
   * @param parentNode - 부모 노드
   * @param tree - 전체 DesignTree
   * @returns 슬롯 자손 ID들의 Set
   */
  private collectSlotDescendantIds(
    parentNode: DesignNode,
    tree: DesignTree
  ): Set<string> {
    const descendantIds = new Set<string>();

    // 현재 노드의 children 중 slot인 노드 찾기
    for (const child of parentNode.children) {
      const slotDef = tree.slots.find((s) => s.targetNodeId === child.id);
      if (slotDef) {
        // SlotDefinition에 저장된 원본 자손 ID들 사용
        if (slotDef.descendantIds) {
          for (const id of slotDef.descendantIds) {
            descendantIds.add(id);
          }
        }
        // 현재 DesignTree의 자손도 추가 (보조)
        this.collectAllDescendantIds(child, descendantIds);
      }
    }

    return descendantIds;
  }

  /**
   * 노드의 모든 자손 ID를 재귀적으로 수집
   * @param node - 시작 노드
   * @param ids - ID를 수집할 Set
   */
  private collectAllDescendantIds(
    node: DesignNode,
    ids: Set<string>
  ): void {
    for (const child of node.children) {
      ids.add(child.id);
      this.collectAllDescendantIds(child, ids);
    }
  }

  /**
   * 배열 슬롯의 아이템 컴포넌트 이름 결정
   *
   * 우선순위:
   * 1. itemComponentName이 있으면 사용 (가장 정확)
   * 2. itemType이 유효한 JS 식별자면 사용
   * 3. slot.name에서 파생 (fallback)
   *
   * @param slot - 배열 슬롯 정보
   * @returns 컴포넌트 이름 (PascalCase)
   */
  private resolveArraySlotComponentName(slot: ArraySlotInfo): string {
    // 1. itemComponentName이 있으면 사용
    if (slot.itemComponentName) {
      return slot.itemComponentName;
    }

    // 2. itemType이 유효한 JavaScript 식별자인지 확인
    const itemType = slot.itemType;
    if (itemType && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(itemType)) {
      return itemType;
    }

    // 3. slot.name에서 컴포넌트 이름 파생 (fallback)
    // "iconArrows" → "IconArrow" (복수형 's' 제거 후 PascalCase)
    const slotName = slot.name;
    const singularName = slotName.endsWith("s")
      ? slotName.slice(0, -1)
      : slotName;

    return capitalize(singularName);
  }
}

export default ComponentGenerator;
