import ts, { NodeFactory, factory } from "typescript";
import { traverseBFS } from "@compiler/utils/traverse";
import { FinalAstTree } from "../../../types/customType";

class GenerateStyles {
  private styleVariables: Map<string, string> = new Map(); // node.id -> style variable name
  private cssObjectCache: Map<string, ts.CallExpression> = new Map(); // 스타일 문자열 -> css() 호출 결과 캐시

  private factory: NodeFactory;
  private astTree: FinalAstTree;
  constructor(factory: NodeFactory, astTree: FinalAstTree) {
    this.factory = factory;
    this.astTree = astTree;
  }

  public createStyleVariables(): ts.VariableStatement {
    const styleProperties: ts.PropertyAssignment[] = [];

    // 모든 노드를 순회하며 스타일 수집
    traverseBFS(this.astTree, (node) => {
      // 스타일 최적화: dynamic styles에서 공통 속성을 base로 이동
      const optimized = this._optimizeStyles(node);
      const baseStyle = optimized.base;
      const dynamicStyles = optimized.dynamic;

      // 스타일이 있는 경우만 처리
      if (Object.keys(baseStyle).length === 0 && dynamicStyles.length === 0) {
        return;
      }

      const baseStyleVarName = this._getStyleVariableName(node);

      // 1. Base style 처리 (CSS 객체 캐싱 사용)
      if (Object.keys(baseStyle).length > 0) {
        const baseCssCall = this._createCssCall(baseStyle);

        styleProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(baseStyleVarName),
            baseCssCall
          )
        );
      }

      // 2. Dynamic styles를 prop별로 그룹핑하여 variant map 생성
      const grouped = this._groupDynamicStylesByProp(dynamicStyles);

      // 각 prop별로 variant style map 생성
      for (const [propName, variants] of grouped.entries()) {
        // 각 variant의 스타일을 머지 (같은 value를 가진 variant가 여러 개일 수 있음)
        const mergedVariants = new Map<string, Record<string, any>>();

        for (const variant of variants) {
          if (!mergedVariants.has(variant.value)) {
            mergedVariants.set(variant.value, {});
          }
          // 같은 value의 스타일들을 병합
          Object.assign(mergedVariants.get(variant.value)!, variant.style);
        }

        // 머지된 variant들을 배열로 변환
        const mergedArray = Array.from(mergedVariants.entries()).map(
          ([value, style]) => ({ value, style })
        );

        if (mergedArray.length > 0) {
          // 변수명 최적화: baseStyleVarName + PropName (첫 글자 대문자)
          // 예: sizelarge + Size → sizelargeSize
          const variantMapName = `${baseStyleVarName}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
          const variantMap = this._createVariantStyleMap(
            variantMapName,
            mergedArray
          );

          styleProperties.push(variantMap);

          // variant map 정보 저장 (나중에 className 결합 시 사용)
          const variantMapKey = `${node.id}_variant_${propName}`;
          (this.styleVariables as any).set(variantMapKey, {
            varName: variantMapName,
            propName: propName,
          });
        }
      }
    });

    // styles 객체 생성
    const stylesObject = this.factory.createObjectLiteralExpression(
      styleProperties,
      true
    );

    // const styles = { ... }
    return this.factory.createVariableStatement(
      undefined,
      this.factory.createVariableDeclarationList(
        [
          this.factory.createVariableDeclaration(
            this.factory.createIdentifier("styles"),
            undefined,
            undefined,
            stylesObject
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  }

  /**
   * Dynamic styles에서 공통 속성을 추출하여 base style로 이동
   */
  private _optimizeStyles(node: FinalAstTree): {
    base: Record<string, any>;
    dynamic: Array<{ condition: any; style: Record<string, any> }>;
  } {
    const baseStyle = { ...(node.style.base || {}) };
    const dynamicStyles = node.style.dynamic || [];

    if (dynamicStyles.length === 0) {
      return { base: baseStyle, dynamic: [] };
    }

    // 1. 모든 dynamic styles의 키 수집
    const allDynamicKeys = new Set<string>();
    dynamicStyles.forEach((dynamic) => {
      Object.keys(dynamic.style).forEach((key) => allDynamicKeys.add(key));
    });

    // 2. 각 키에 대해 모든 dynamic styles에서 같은 값인지 확인
    const commonProperties: Record<string, any> = {};

    for (const key of allDynamicKeys) {
      const firstValue = dynamicStyles[0].style[key];
      if (firstValue === undefined) continue;

      // 모든 dynamic styles에서 같은 값인지 확인
      const allSame = dynamicStyles.every(
        (dynamic) => dynamic.style[key] === firstValue
      );

      if (allSame) {
        // 공통 속성 발견 → base로 이동
        commonProperties[key] = firstValue;
      }
    }

    // 3. Base style에 공통 속성 추가
    Object.assign(baseStyle, commonProperties);

    // 4. Dynamic styles에서 공통 속성 제거
    const optimizedDynamic = dynamicStyles
      .map((dynamic) => {
        const optimizedStyle = { ...dynamic.style };
        Object.keys(commonProperties).forEach((key) => {
          delete optimizedStyle[key];
        });
        return {
          condition: dynamic.condition,
          style: optimizedStyle,
        };
      })
      .filter((dynamic) => Object.keys(dynamic.style).length > 0); // 빈 스타일 제거

    return { base: baseStyle, dynamic: optimizedDynamic };
  }

  /**
   * 노드의 스타일 변수 이름 생성 (짧고 의미있는 이름)
   */
  private _getStyleVariableName(node: FinalAstTree): string {
    if (this.styleVariables.has(node.id)) {
      return this.styleVariables.get(node.id)!;
    }

    // 1. 노드 타입과 이름을 기반으로 짧은 이름 생성
    const baseName = this._generateShortName(node);
    const uniqueVarName = this._ensureUniqueVarName(baseName);

    this.styleVariables.set(node.id, uniqueVarName);
    return uniqueVarName;
  }

  /**
   * CSS 객체 생성 (중복 체크 및 캐싱)
   */
  private _createCssCall(style: Record<string, any>): ts.CallExpression {
    // 스타일 객체를 문자열로 변환하여 캐시 키 생성 (정규화된 키 사용)
    const normalizedStyle: Record<string, any> = {};
    for (const [key, value] of Object.entries(style)) {
      normalizedStyle[this._normalizeCssKey(key)] = value;
    }
    const cacheKey = JSON.stringify(normalizedStyle);

    if (this.cssObjectCache.has(cacheKey)) {
      return this.cssObjectCache.get(cacheKey)!;
    }

    const styleObjectProperties = Object.entries(normalizedStyle).map(
      ([key, value]) =>
        this.factory.createPropertyAssignment(
          this.factory.createIdentifier(key),
          this._convertStyleValueToExpression(value)
        )
    );

    const styleObject = this.factory.createObjectLiteralExpression(
      styleObjectProperties,
      true
    );

    const cssCall = this.factory.createCallExpression(
      this.factory.createIdentifier("css"),
      undefined,
      [styleObject]
    );

    this.cssObjectCache.set(cacheKey, cssCall);
    return cssCall;
  }

  /**
   * Dynamic styles를 prop별로 그룹핑
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
      if (!extracted) continue; // 추출 불가능한 조건은 스킵

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

  private _createVariantStyleMap(
    mapName: string,
    variants: Array<{ value: string; style: Record<string, any> }>
  ): ts.PropertyAssignment {
    // 객체 리터럴 속성들 생성: { Large: css({...}), Medium: css({...}), ... }
    const variantProperties: ts.PropertyAssignment[] = variants.map(
      (variant) => {
        const cssCall = this._createCssCall(variant.style);

        // 하이픈이나 특수문자가 포함된 경우 computed property 사용
        const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(
          variant.value
        );
        const propertyName = isValidIdentifier
          ? this.factory.createIdentifier(variant.value)
          : this.factory.createStringLiteral(variant.value);

        return this.factory.createPropertyAssignment(
          propertyName,
          cssCall,
          !isValidIdentifier // computed property로 설정
        );
      }
    );

    const variantMapObject = this.factory.createObjectLiteralExpression(
      variantProperties,
      true
    );

    return this.factory.createPropertyAssignment(
      this.factory.createIdentifier(mapName),
      variantMapObject
    );
  }

  /**
   * 짧고 의미있는 변수명 생성
   */
  private _generateShortName(node: FinalAstTree): string {
    // 1. 노드 타입 기반 기본 이름
    const typeMap: Record<string, string> = {
      TEXT: "text",
      INSTANCE: "icon",
      FRAME: "frame",
      GROUP: "group",
      VECTOR: "vector",
      RECTANGLE: "rect",
      ELLIPSE: "ellipse",
    };

    let baseName = typeMap[node.type] || "node";

    // 2. 노드 이름에서 의미있는 키워드 추출 (짧게)
    const nameWords = this._extractKeywords(node.name);

    if (nameWords.length > 0) {
      // 첫 번째 키워드 사용 (최대 2개 단어 조합)
      const keyword = nameWords.slice(0, 2).join("");
      if (keyword.length <= 10) {
        baseName = keyword.toLowerCase();
      } else {
        // 너무 길면 첫 글자만 사용
        baseName = nameWords
          .slice(0, 3)
          .map((w) => w.charAt(0))
          .join("")
          .toLowerCase();
      }
    }

    // 3. node.id의 마지막 숫자 부분을 짧은 식별자로 사용 (중복 방지)
    // 예: "4139:411" -> "411" 또는 해시값
    const idParts = node.id.split(":");
    if (idParts.length > 1) {
      const lastPart = idParts[idParts.length - 1];
      // 숫자가 너무 길면 마지막 3자리만 사용
      const shortId = lastPart.slice(-3);
      // 기존 baseName과 결합하되, 이미 충분히 구분되면 생략
      if (!baseName || baseName === "node") {
        baseName = `node${shortId}`;
      }
    }

    return baseName || "node";
  }

  /**
   * 고유한 변수 이름 보장 (중복 시 숫자 추가)
   */
  private _ensureUniqueVarName(baseName: string): string {
    const existingNames = Array.from(this.styleVariables.values());
    let uniqueName = baseName;
    let counter = 0;

    while (existingNames.includes(uniqueName)) {
      counter++;
      uniqueName = `${baseName}${counter}`;
    }

    return uniqueName;
  }

  /**
   * CSS 속성 키를 camelCase로 변환
   * "flex-direction" → "flexDirection"
   */
  private _normalizeCssKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  /**
   * 스타일 값을 TypeScript Expression으로 변환
   */
  private _convertStyleValueToExpression(value: any): ts.Expression {
    if (typeof value === "string") {
      return this.factory.createStringLiteral(value);
    }
    if (typeof value === "number") {
      return this.factory.createNumericLiteral(value);
    }
    if (typeof value === "boolean") {
      return value ? this.factory.createTrue() : this.factory.createFalse();
    }
    return this.factory.createNull();
  }

  /**
   * ESTree 조건에서 prop 이름과 값 추출
   * props.Size === "Large" → { prop: "size", value: "Large" }
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    // props.X === "value" 형태만 처리
    if (
      condition.operator === "===" &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "Literal"
    ) {
      const propName = condition.left.property?.name;
      const propValue = condition.right.value;

      if (propName && propValue !== undefined) {
        // prop 이름을 camelCase로 변환 (예: "Size" → "size")
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

  /**
   * 노드 이름에서 의미있는 키워드 추출
   */
  private _extractKeywords(name: string): string[] {
    if (!name) return [];

    // 특수 문자, 숫자, 등호 제거 후 단어 추출
    const cleaned = name.replace(/[=:,]/g, " ").replace(/\d+/g, "").trim();

    // 공백으로 분리하고 의미없는 단어 필터링
    const stopWords = new Set([
      "false",
      "true",
      "default",
      "disabled",
      "enabled",
      "the",
      "a",
      "an",
    ]);

    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => word.length > 1 && !stopWords.has(word.toLowerCase()))
      .slice(0, 3); // 최대 3개만 사용
  }
}

export default GenerateStyles;
