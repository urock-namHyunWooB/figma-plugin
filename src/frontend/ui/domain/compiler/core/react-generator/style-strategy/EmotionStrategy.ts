import ts from "typescript";
import { FinalAstTree } from "@compiler";
import {
  StyleStrategy,
  DynamicStyleInfo,
} from "./StyleStrategy";
import GenerateStyles from "../generate-styles/GenerateStyles";
import { normalizeName } from "@compiler/utils/stringUtils";

/**
 * Emotion CSS-in-JS 전략
 * 기존 GenerateStyles + CreateJsxTree의 스타일 로직을 캡슐화
 */
class EmotionStrategy implements StyleStrategy {
  readonly name = "emotion" as const;

  private factory: ts.NodeFactory;
  private astTree: FinalAstTree;
  private generateStyles: GenerateStyles;

  constructor(factory: ts.NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
    this.generateStyles = new GenerateStyles(factory, astTree);
  }

  /**
   * Emotion import 문 생성
   * import { css } from '@emotion/react'
   */
  generateImports(): ts.ImportDeclaration[] {
    return [
      this.factory.createImportDeclaration(
        undefined,
        this.factory.createImportClause(
          false,
          undefined,
          this.factory.createNamedImports([
            this.factory.createImportSpecifier(
              false,
              undefined,
              this.factory.createIdentifier("css")
            ),
          ])
        ),
        this.factory.createStringLiteral("@emotion/react")
      ),
    ];
  }

  /**
   * CSS 변수 및 스타일 객체 선언 생성
   * const FrameCss = css`...`
   * const sizeStyles = { Large: {...}, Medium: {...} }
   */
  generateDeclarations(
    _astTree: FinalAstTree,
    componentName: string
  ): ts.Statement[] {
    return this.generateStyles.createStyleVariables(componentName);
  }

  /**
   * css={} prop 속성 생성
   */
  createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    const hasBaseStyle =
      node.style.base && Object.keys(node.style.base).length > 0;
    const hasDynamicStyle = node.style.dynamic && node.style.dynamic.length > 0;
    const hasPseudoStyle =
      node.style.pseudo && Object.keys(node.style.pseudo).length > 0;
    const hasIndexedConditional = !!node.style.indexedConditional;

    if (!hasBaseStyle && !hasDynamicStyle && !hasPseudoStyle && !hasIndexedConditional) {
      return null;
    }

    const cssVarName = this._getCssVariableName(node);
    const grouped = this._groupDynamicStylesByProp(node.style.dynamic || []);

    let cssExpression: ts.Expression;

    if (grouped.size > 0 || hasIndexedConditional) {
      // 동적 스타일이 있으면 함수 호출
      const args: ts.Expression[] = [];
      for (const [propName] of grouped.entries()) {
        const propIdentifier = this.factory.createIdentifier(propName);
        args.push(propIdentifier);
      }

      // indexedConditional의 booleanProp 파라미터 추가
      if (hasIndexedConditional) {
        const { booleanProp } = node.style.indexedConditional!;
        // 이미 동적 스타일에서 추가되지 않은 경우에만 추가
        const existingPropNames = [...grouped.keys()];
        if (!existingPropNames.includes(booleanProp)) {
          const propIdentifier = this.factory.createIdentifier(booleanProp);
          args.push(propIdentifier);
        }
      }

      cssExpression = this.factory.createCallExpression(
        this.factory.createIdentifier(cssVarName),
        undefined,
        args
      );
    } else {
      // 정적 스타일만 있으면 변수 참조
      cssExpression = this.factory.createIdentifier(cssVarName);
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("css"),
      this.factory.createJsxExpression(undefined, cssExpression)
    );
  }

  /**
   * 동적 스타일 정보 조회
   */
  getDynamicStyleInfo(node: FinalAstTree): DynamicStyleInfo | null {
    const dynamicStyles = node.style.dynamic || [];
    if (dynamicStyles.length === 0) {
      return null;
    }

    const propToVariants = new Map<string, string[]>();
    const variantStyles = new Map<string, string>();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue;

      if (!propToVariants.has(extracted.prop)) {
        propToVariants.set(extracted.prop, []);
      }
      propToVariants.get(extracted.prop)!.push(extracted.value);

      const key = `${extracted.prop}:${extracted.value}`;
      variantStyles.set(key, JSON.stringify(dynamicStyle.style));
    }

    return { propToVariants, variantStyles };
  }

  /**
   * CSS 변수명 가져오기
   */
  private _getCssVariableName(node: FinalAstTree): string {
    if (node.generatedNames?.cssVarName) {
      return node.generatedNames.cssVarName;
    }

    let nodeName = node.name;
    if (!node.parent && node.metaData.document) {
      nodeName = node.metaData.document.name;
    }
    return `${this._normalizeName(nodeName)}Css`;
  }

  /**
   * 이름 정규화 - stringUtils의 normalizeName을 사용하여 GenerateStyles와 일관성 유지
   */
  private _normalizeName(name: string): string {
    return normalizeName(name);
  }

  /**
   * 동적 스타일을 prop별로 그룹핑
   */
  private _groupDynamicStylesByProp(
    dynamicStyles: Array<{ condition: any; style: Record<string, any> }>
  ): Map<string, Array<{ value: string; style: Record<string, any> }>> {
    const grouped = new Map<
      string,
      Array<{ value: string; style: Record<string, any> }>
    >();

    for (const dynamicStyle of dynamicStyles) {
      const extracted = this._extractPropAndValue(dynamicStyle.condition);
      if (!extracted) continue;

      if (!grouped.has(extracted.prop)) {
        grouped.set(extracted.prop, []);
      }

      grouped.get(extracted.prop)!.push({
        value: extracted.value,
        style: dynamicStyle.style,
      });
    }

    return grouped;
  }

  /**
   * 조건에서 prop과 값 추출
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        return {
          prop: camelPropName,
          value: String(propValue),
        };
      }
    }

    return null;
  }
}

export default EmotionStrategy;

