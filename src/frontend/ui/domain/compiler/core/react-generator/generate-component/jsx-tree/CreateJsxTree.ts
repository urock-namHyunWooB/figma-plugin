import { FinalAstTree } from "@compiler";
import ts from "typescript";
import { ArraySlot } from "@compiler/core/ArraySlotDetector";
import SvgToJsx from "./SvgToJsx";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { StyleStrategy } from "@compiler/core/react-generator/style-strategy";
import { normalizeName } from "@compiler/utils/stringUtils";

/**
 * CreateJsxTree 옵션
 */
export interface CreateJsxTreeOptions {
  /** 스타일 전략 */
  styleStrategy?: StyleStrategy;
  /** 디버그 모드: true이면 data-figma-id 속성 추가 */
  debug?: boolean;
}

class CreateJsxTree {
  private _jsxTree: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression;

  private astTree: FinalAstTree;
  private arraySlots: ArraySlot[];
  private styleStrategy?: StyleStrategy;
  private debug: boolean;

  private factory = ts.factory;
  private styleVariables: Map<string, string> = new Map(); // node.id -> style variable name
  private cssObjectCache: Map<string, ts.CallExpression> = new Map(); // 스타일 문자열 -> css() 호출 결과 캐시

  // originalKey → propName 매핑 (INSTANCE의 componentProperties 참조용)
  private originalKeyToPropName: Map<string, string> = new Map();

  // 배열 슬롯 부모 ID → ArraySlot 매핑
  private arraySlotByParentId: Map<string, ArraySlot> = new Map();

  // 외부 컴포넌트 wrapper 스타일 (위치 스타일)
  private wrapperStyles: Map<string, Record<string, string>> = new Map();

  public get jsxTree() {
    return this._jsxTree;
  }

  /**
   * 외부 컴포넌트 wrapper 스타일 반환
   * GenerateStyles에서 사용
   */
  public getWrapperStyles(): Map<string, Record<string, string>> {
    return this.wrapperStyles;
  }

  constructor(
    astTree: FinalAstTree,
    arraySlots: ArraySlot[] = [],
    options?: CreateJsxTreeOptions
  ) {
    this.astTree = astTree;
    this.arraySlots = arraySlots;
    this.styleStrategy = options?.styleStrategy;
    this.debug = options?.debug ?? false;
    this._buildArraySlotMapping();
    this._buildOriginalKeyMapping();
    this._jsxTree = this._createJsxTree(astTree);
  }

  /**
   * 배열 슬롯 부모 ID → ArraySlot 매핑 빌드
   */
  private _buildArraySlotMapping(): void {
    for (const slot of this.arraySlots) {
      this.arraySlotByParentId.set(slot.parentId, slot);
    }
  }

  /**
   * 노드의 children에 매칭되는 ArraySlot 찾기
   *
   * 병합된 SuperTree에서는 parentId가 다를 수 있으므로:
   * 1. 먼저 parentId로 직접 매칭 시도
   * 2. 실패하면 children의 ID 또는 componentId로 매칭
   */
  private _findArraySlotForNode(node: FinalAstTree): ArraySlot | undefined {
    // 1. parentId로 직접 매칭 (기존 로직)
    const directMatch = this.arraySlotByParentId.get(node.id);
    if (directMatch) {
      return directMatch;
    }

    // 2. children의 ID로 매칭
    for (const slot of this.arraySlots) {
      const instanceIds = new Set(slot.instances.map((i) => i.id));

      // 현재 노드의 children 중 ArraySlot instance가 있는지 확인
      for (const child of node.children) {
        if (instanceIds.has(child.id)) {
          return slot;
        }

        // externalComponent의 componentId로도 확인
        if (child.externalComponent) {
          const extCompId = child.externalComponent.componentId;
          if (slot.componentId && extCompId === slot.componentId) {
            return slot;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * originalKey → propName 매핑 빌드
   * INSTANCE의 componentProperties 참조를 새 prop 이름으로 변환하기 위함
   */
  private _buildOriginalKeyMapping(): void {
    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      if ((propDef as any)?.originalKey) {
        this.originalKeyToPropName.set((propDef as any).originalKey, propName);
      }
    }
  }

  public _createJsxTree(
    node: FinalAstTree
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // 외부 컴포넌트 참조인 경우 (INSTANCE → 별도 컴포넌트로 렌더링)
    // vectorSvg가 있으면 SVG를 children으로 전달
    if (node.externalComponent) {
      return this._createExternalComponentJsx(node);
    }

    // Slot 노드는 props.slotName으로 참조 (children 없음)
    const slotJsx = this._createSlotJsxExpression(node);
    if (slotJsx) {
      return slotJsx;
    }

    // 일반 노드: 태그, 속성, children을 조합하여 JSX Element 생성
    const tagName = this._getTagName(node);
    const attributes = this._createAttributes(node);
    let children = this._createChildren(node);

    // TEXT 노드 텍스트 내용 처리
    if (node.type === "TEXT") {
      if ((node.props as any)?.characters) {
        // props.characters가 있으면 prop 참조 (동적 텍스트)
        // 동적 텍스트는 부분 스타일링 적용 불가 (전체 텍스트가 바뀌므로)
        const rawPropName = (node.props as any).characters;
        // originalKey → propName 매핑 사용 (INSTANCE의 경우)
        // 매핑이 없으면 toCamelCase로 정규화 (일관된 prop 이름 생성)
        const propName =
          this.originalKeyToPropName.get(rawPropName) ||
          toCamelCase(rawPropName);
        // props.text를 참조하는 JSX Expression 생성 (구조 분해된 변수 사용)
        const textExpression = this.factory.createJsxExpression(
          undefined,
          this.factory.createIdentifier(propName)
        );
        // children 앞에 텍스트 추가
        children = [textExpression, ...children];
      } else if (node.metaData.textSegments) {
        // 부분 텍스트 스타일링이 있으면 여러 <span>으로 분할
        const segmentElements = this._createTextSegments(
          node.metaData.textSegments
        );
        children = [...segmentElements, ...children];
      } else if (node.metaData.characters) {
        // metaData.characters가 있으면 고정 텍스트 (단일 COMPONENT 등)
        const textContent = node.metaData.characters as string;

        // 오버라이드 prop이 있으면 {aaText ?? "100"} 형태로 생성
        const textPropName = this._getTextOverridePropName(node);
        if (textPropName) {
          // textPropName ?? "defaultText" 형태
          const textExpression = this.factory.createJsxExpression(
            undefined,
            this.factory.createBinaryExpression(
              this.factory.createIdentifier(textPropName),
              this.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
              this.factory.createStringLiteral(textContent)
            )
          );
          children = [textExpression, ...children];
        } else if (textContent.includes("\n")) {
          // 줄바꿈(\n)이 있으면 <br />로 분할
          const textElements = this._createTextWithLineBreaks(textContent);
          children = [...textElements, ...children];
        } else {
          const textLiteral = this.factory.createJsxText(textContent, false);
          children = [textLiteral, ...children];
        }
      }
    }

    // VECTOR, ICON 노드 또는 루트 노드가 vectorSvg를 가지면 SVG로 렌더링
    // (의존 컴포넌트가 아이콘인 경우, 루트 노드에 vectorSvg가 주입됨)
    if (node.metaData.vectorSvg) {
      const isVectorOrIcon =
        node.semanticRole === "vector" || node.semanticRole === "icon";
      const isRootWithSvg = node.parent === null;

      if (isVectorOrIcon || isRootWithSvg) {
        return this._createVectorSvgElement(node, attributes);
      }
    }

    // 루트 노드인 경우 {children}을 마지막에 추가 (의존 컴포넌트가 SVG 등을 받을 수 있도록)
    if (node.parent === null) {
      const childrenExpression = this.factory.createJsxExpression(
        undefined,
        this.factory.createIdentifier("children")
      );
      children = [...children, childrenExpression];
    }

    return this._createJsxElement(tagName, attributes, children);
  }

  /**
   * 외부 컴포넌트(INSTANCE)를 JSX로 변환
   * <SelectButton size={size} selected="false" />
   * SVG는 의존 컴포넌트 자체에서 렌더링하므로 여기서는 참조만 함
   *
   * 위치 스타일(position, left, top 등)이 있으면 wrapper div로 감싸서 적용
   */
  /**
   * 네이티브 HTML 속성과 충돌하는 prop 이름 rename
   * dependency 컴포넌트가 버튼 등으로 렌더링될 때 충돌 방지
   */
  private _renameConflictingPropName(propName: string): string {
    // 흔히 충돌하는 네이티브 속성 목록
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
      "placeholder",
      "autoFocus",
      "autoComplete",
    ];

    const lowerPropName = propName.toLowerCase();
    if (conflictingAttrs.some((attr) => attr.toLowerCase() === lowerPropName)) {
      // custom prefix 추가: disabled -> customDisabled
      return `custom${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
    }

    return propName;
  }

  private _createExternalComponentJsx(
    node: FinalAstTree
  ): ts.JsxSelfClosingElement | ts.JsxElement {
    const extComp = node.externalComponent!;

    // 컴포넌트 이름 (PascalCase)
    const tagIdentifier = this.factory.createIdentifier(extComp.componentName);

    // props를 JSX 속성으로 변환
    const attributes: ts.JsxAttributeLike[] = [];

    for (const [propName, propValue] of Object.entries(extComp.props)) {
      // 네이티브 HTML 속성과 충돌하는 prop 이름 rename
      const resolvedPropName = this._renameConflictingPropName(propName);

      // 부모 컴포넌트의 같은 이름 prop이 있으면 변수 참조, 없으면 고정값
      const parentHasSameProp = resolvedPropName in this.astTree.props;

      let jsxAttr: ts.JsxAttribute;
      if (parentHasSameProp) {
        // 부모 prop을 그대로 전달: size={size}
        jsxAttr = this.factory.createJsxAttribute(
          this.factory.createIdentifier(resolvedPropName),
          this.factory.createJsxExpression(
            undefined,
            this.factory.createIdentifier(resolvedPropName)
          )
        );
      } else {
        // 고정값으로 전달: 타입에 따라 처리
        // boolean: selected={false}, string: text="hello"
        const valueType = typeof propValue;
        if (valueType === "boolean") {
          jsxAttr = this.factory.createJsxAttribute(
            this.factory.createIdentifier(resolvedPropName),
            this.factory.createJsxExpression(
              undefined,
              propValue ? this.factory.createTrue() : this.factory.createFalse()
            )
          );
        } else if (valueType === "number") {
          jsxAttr = this.factory.createJsxAttribute(
            this.factory.createIdentifier(resolvedPropName),
            this.factory.createJsxExpression(
              undefined,
              this.factory.createNumericLiteral(Number(propValue))
            )
          );
        } else {
          // string 또는 기타: 문자열 리터럴
          jsxAttr = this.factory.createJsxAttribute(
            this.factory.createIdentifier(resolvedPropName),
            this.factory.createStringLiteral(String(propValue))
          );
        }
      }

      attributes.push(jsxAttr);
    }

    // overrideProps 전달 (INSTANCE children의 오버라이드된 fills, characters)
    if (extComp.overrideProps) {
      for (const [propName, propValue] of Object.entries(
        extComp.overrideProps
      )) {
        const jsxAttr = this.factory.createJsxAttribute(
          this.factory.createIdentifier(propName),
          this.factory.createStringLiteral(String(propValue))
        );
        attributes.push(jsxAttr);
      }
    }

    // visibleOverrideProps 전달 (INSTANCE에서 visible override된 노드의 show props)
    if (extComp.visibleOverrideProps) {
      for (const [propName, propValue] of Object.entries(
        extComp.visibleOverrideProps
      )) {
        // boolean 값으로 전달: showInteraction={true}
        const jsxAttr = this.factory.createJsxAttribute(
          this.factory.createIdentifier(propName),
          this.factory.createJsxExpression(
            undefined,
            propValue ? this.factory.createTrue() : this.factory.createFalse()
          )
        );
        attributes.push(jsxAttr);
      }
    }

    const jsxAttributes = this.factory.createJsxAttributes(attributes);

    // Self-closing element: <SelectButton ... />
    const componentElement = this.factory.createJsxSelfClosingElement(
      tagIdentifier,
      undefined,
      jsxAttributes
    );

    // 위치 스타일(position, left, top 등)이 있으면 wrapper div로 감싸기
    const layoutStyles = this._extractLayoutStyles(node.style?.base || {});

    // absoluteBoundingBox에서 width/height 보충 (CSS에 없을 경우)
    const boundingBox = node.metaData?.spec?.absoluteBoundingBox;
    if (boundingBox) {
      if (!layoutStyles["width"] && boundingBox.width) {
        layoutStyles["width"] = `${boundingBox.width}px`;
      }
      if (!layoutStyles["height"] && boundingBox.height) {
        layoutStyles["height"] = `${boundingBox.height}px`;
      }
    }

    if (Object.keys(layoutStyles).length > 0) {
      return this._wrapWithLayoutDiv(node, componentElement, layoutStyles);
    }

    return componentElement;
  }

  /**
   * 레이아웃/위치/크기 관련 스타일 추출
   * 외부 컴포넌트의 wrapper에 적용할 스타일
   */
  private _extractLayoutStyles(
    styles: Record<string, any>
  ): Record<string, string> {
    const layoutProps = [
      // Position
      "position",
      "left",
      "top",
      "right",
      "bottom",
      "transform",
      "zIndex",
      // Size
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      // Flex (자식으로서의 flex 속성)
      "flex",
      "flexGrow",
      "flexShrink",
      "flexBasis",
      "alignSelf",
    ];
    const result: Record<string, string> = {};
    for (const prop of layoutProps) {
      if (styles[prop] !== undefined) {
        result[prop] = styles[prop];
      }
    }
    return result;
  }

  /**
   * 외부 컴포넌트를 wrapper div로 감싸서 위치 스타일 적용
   * CSS 클래스가 있으면 사용, 없으면 인라인 스타일 fallback
   * <div css={ColorguideCss}><ColorGuide /></div>
   */
  private _wrapWithLayoutDiv(
    node: FinalAstTree,
    componentElement: ts.JsxSelfClosingElement,
    layoutStyles: Record<string, string>
  ): ts.JsxElement {
    const wrapperAttrs: ts.JsxAttributeLike[] = [];

    // CSS 클래스가 있으면 css 속성 사용 (Emotion 전략)
    const cssVarName = node.generatedNames?.cssVarName;
    if (cssVarName) {
      const cssAttr = this.factory.createJsxAttribute(
        this.factory.createIdentifier("css"),
        this.factory.createJsxExpression(
          undefined,
          this.factory.createIdentifier(cssVarName)
        )
      );
      wrapperAttrs.push(cssAttr);
    } else {
      // Tailwind 전략이거나 CSS 클래스가 없는 경우:
      // node.style.base 전체 스타일을 인라인으로 적용 (layoutStyles만이 아닌 전체)
      const fullStyles = node.style?.base || {};
      const styleProperties: ts.PropertyAssignment[] = [];

      for (const [prop, value] of Object.entries(fullStyles)) {
        // CSS 속성명을 camelCase로 변환 (flex-direction → flexDirection)
        const camelProp = this._kebabToCamel(prop);
        styleProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier(camelProp),
            this.factory.createStringLiteral(String(value))
          )
        );
      }

      // layoutStyles에서 fullStyles에 없는 것 추가 (width/height 등 boundingBox에서 온 것)
      for (const [prop, value] of Object.entries(layoutStyles)) {
        const camelProp = this._kebabToCamel(prop);
        if (!(prop in fullStyles)) {
          styleProperties.push(
            this.factory.createPropertyAssignment(
              this.factory.createIdentifier(camelProp),
              this.factory.createStringLiteral(value)
            )
          );
        }
      }

      const styleObject = this.factory.createObjectLiteralExpression(
        styleProperties,
        false
      );

      const styleAttr = this.factory.createJsxAttribute(
        this.factory.createIdentifier("style"),
        this.factory.createJsxExpression(undefined, styleObject)
      );
      wrapperAttrs.push(styleAttr);
    }

    const wrapperAttributes = this.factory.createJsxAttributes(wrapperAttrs);

    // <div style={{...}}><ChoiceToken /></div>
    return this.factory.createJsxElement(
      this.factory.createJsxOpeningElement(
        this.factory.createIdentifier("div"),
        undefined,
        wrapperAttributes
      ),
      [componentElement],
      this.factory.createJsxClosingElement(this.factory.createIdentifier("div"))
    );
  }

  /**
   * Slot 노드를 JSX Expression으로 변환
   * Slot 노드는 구조 분해된 변수를 직접 참조
   * Slot 노드는 children을 가질 수 없으므로 early return
   */
  private _createSlotJsxExpression(
    node: FinalAstTree
  ): ts.JsxExpression | null {
    if (!(node as any).isSlot) {
      return null;
    }

    const slotName = (node as any).slotName;
    // 구조 분해된 변수를 직접 참조 (props.iconLeft 대신 iconLeft)
    return this.factory.createJsxExpression(
      undefined,
      this.factory.createIdentifier(slotName)
    );
  }

  /**
   * 노드의 JSX Attributes 생성
   */
  private _createAttributes(node: FinalAstTree): ts.JsxAttributeLike[] {
    const attributes: ts.JsxAttributeLike[] = [];

    // debug 모드: data-figma-id 속성 추가
    if (this.debug && node.id) {
      const dataFigmaIdAttr = this.factory.createJsxAttribute(
        this.factory.createIdentifier("data-figma-id"),
        this.factory.createStringLiteral(node.id)
      );
      attributes.push(dataFigmaIdAttr);
    }

    // 스타일 전략이 있으면 사용, 없으면 기본 Emotion 방식 사용
    const styleAttr = this.styleStrategy
      ? this.styleStrategy.createStyleAttribute(node)
      : this._createStyleAttribute(node);

    if (styleAttr) {
      attributes.push(styleAttr);
    }

    // 오버라이드 prop이 있으면 style 속성 추가
    const overrideStyleAttr = this._createOverrideStyleAttribute(node);
    if (overrideStyleAttr) {
      attributes.push(overrideStyleAttr);
    }

    // 루트 노드이고 네이티브 HTML 요소인 경우
    if (node.parent === null && this._isNativeHtmlElement(node)) {
      // customDisabled prop이 있으면 disabled 속성에 바인딩
      // (disabled prop이 customDisabled로 rename되었을 때 처리)
      const disabledAttr = this._createDisabledAttribute(node);
      if (disabledAttr) {
        attributes.push(disabledAttr);
      }

      // {...restProps} 추가
      const restPropsSpread = this.factory.createJsxSpreadAttribute(
        this.factory.createIdentifier("restProps")
      );
      attributes.push(restPropsSpread);
    }

    return attributes;
  }

  /**
   * customDisabled prop을 disabled 속성에 바인딩하는 속성 생성
   * button, input, select 등 form 요소에서만 적용
   */
  private _createDisabledAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    // form 요소(disabled 속성을 지원하는 요소)만 처리
    const formElements = ["button", "input", "select", "textarea", "fieldset"];
    if (!formElements.includes(node.semanticRole)) {
      return null;
    }

    // customDisabled 또는 isDisabled prop 찾기
    const disabledPropNames = ["customDisabled", "isDisabled"];
    let foundPropName: string | null = null;

    for (const propName of disabledPropNames) {
      if (propName in this.astTree.props) {
        foundPropName = propName;
        break;
      }
    }

    if (!foundPropName) {
      return null;
    }

    // disabled={customDisabled} 속성 생성
    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("disabled"),
      this.factory.createJsxExpression(
        undefined,
        this.factory.createIdentifier(foundPropName)
      )
    );
  }

  /**
   * TEXT 노드에 대한 오버라이드 prop 이름 반환
   * 예: "AA" 노드 → "aaText" prop
   */
  private _getTextOverridePropName(node: FinalAstTree): string | null {
    if (!this.astTree.overrideableProps) {
      return null;
    }

    const nodeName = toCamelCase(node.name);
    if (!nodeName) {
      return null;
    }

    const textPropName = `${nodeName}Text`;
    if (this.astTree.overrideableProps[textPropName]) {
      return textPropName;
    }

    return null;
  }

  /**
   * 오버라이드 prop에 해당하는 노드에 CSS 변수 style 속성 생성
   * 예: rectangle1Bg prop → style={{ '--rectangle1-bg': rectangle1Bg }}
   */
  private _createOverrideStyleAttribute(
    node: FinalAstTree
  ): ts.JsxAttribute | null {
    if (!this.astTree.overrideableProps) {
      return null;
    }

    const nodeName = toCamelCase(node.name);
    if (!nodeName) {
      return null;
    }

    // 해당 노드에 적용 가능한 오버라이드 prop 찾기
    const styleProperties: ts.PropertyAssignment[] = [];

    // fills 오버라이드
    const bgPropName = `${nodeName}Bg`;
    if (this.astTree.overrideableProps[bgPropName]) {
      // TEXT 노드는 fills가 텍스트 색상이므로 color로 직접 적용
      if (node.type === "TEXT") {
        styleProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createIdentifier("color"),
            this.factory.createIdentifier(bgPropName)
          )
        );
      } else {
        // 그 외 노드는 CSS 변수로 적용 (background)
        const cssVarName = `--${nodeName.replace(/([A-Z])/g, "-$1").toLowerCase()}-bg`;
        styleProperties.push(
          this.factory.createPropertyAssignment(
            this.factory.createStringLiteral(cssVarName),
            this.factory.createIdentifier(bgPropName)
          )
        );
      }
    }

    if (styleProperties.length === 0) {
      return null;
    }

    // style={{ '--rectangle1-bg': rectangle1Bg }} 형태로 생성
    const styleObject = this.factory.createObjectLiteralExpression(
      styleProperties,
      false
    );

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("style"),
      this.factory.createJsxExpression(undefined, styleObject)
    );
  }

  /**
   * 노드가 네이티브 HTML 요소인지 확인
   * (컴포넌트가 아닌 실제 HTML 태그인지)
   */
  private _isNativeHtmlElement(node: FinalAstTree): boolean {
    const tagName = this._getTagName(node);
    // PascalCase로 시작하면 컴포넌트, 소문자로 시작하면 네이티브 HTML
    return tagName.charAt(0) === tagName.charAt(0).toLowerCase();
  }

  /**
   * 노드의 Children 생성 (재귀적, visible 조건 처리 포함)
   */
  private _createChildren(node: FinalAstTree): ts.JsxChild[] {
    const children: ts.JsxChild[] = [];

    // 배열 슬롯인지 확인 (children의 ID로 매칭)
    // 주의: 병합된 SuperTree에서는 parentId가 다를 수 있으므로
    // instance ID 또는 componentId로 매칭
    const arraySlot = this._findArraySlotForNode(node);

    // ArraySlot에 포함된 인스턴스 ID들 (있으면)
    const arraySlotInstanceIds = new Set(
      arraySlot?.instances.map((inst) => inst.id) ?? []
    );

    for (const child of node.children) {
      // ArraySlot에 포함된 인스턴스이거나, 자식/하위 노드에 ArraySlot 인스턴스가 있으면 건너뛰기
      // (별도로 .map()으로 렌더링됨)
      if (
        this._containsArraySlotInstance(child, arraySlotInstanceIds, arraySlot)
      ) {
        continue;
      }

      const childJsx = this._createJsxTree(child);

      if (child.visible.type === "condition") {
        const condition = this._convertEstreeToTsExpression(
          child.visible.condition
        );

        // childJsx가 JsxExpression인 경우 (variant SVG 등) 내부 expression 추출
        if (ts.isJsxExpression(childJsx)) {
          const innerExpr = childJsx.expression || this.factory.createNull();
          const conditionalExpr = this.factory.createBinaryExpression(
            condition,
            this.factory.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
            innerExpr
          );
          children.push(
            this.factory.createJsxExpression(undefined, conditionalExpr)
          );
        } else {
          const conditionalJsx = this._wrapWithConditionalRendering(
            condition,
            childJsx as ts.JsxElement | ts.JsxSelfClosingElement
          );
          children.push(conditionalJsx);
        }
      } else {
        // static인 경우 그대로 추가
        children.push(childJsx as ts.JsxChild);
      }
    }

    // ArraySlot이 있으면 .map() 표현식 추가
    if (arraySlot) {
      const mapExpression = this._createArraySlotMapExpression(node, arraySlot);
      children.push(mapExpression);
    }

    return children;
  }

  /**
   * 노드 또는 하위 노드에 ArraySlot 인스턴스가 포함되어 있는지 확인
   *
   * ArraySlot 인스턴스는 다음 조건 중 하나로 감지:
   * 1. 노드 ID가 arraySlotInstanceIds에 포함됨
   * 2. 노드가 externalComponent이고, componentId가 ArraySlot의 componentId/componentSetId와 일치
   */
  private _containsArraySlotInstance(
    node: FinalAstTree,
    arraySlotInstanceIds: Set<string>,
    arraySlot?: ArraySlot
  ): boolean {
    // 현재 노드가 ArraySlot 인스턴스인지 확인 (ID 기반)
    if (arraySlotInstanceIds.has(node.id)) {
      return true;
    }

    // externalComponent인 경우, componentId/componentSetId 비교
    if (node.externalComponent && arraySlot) {
      const extComp = node.externalComponent;
      if (
        (arraySlot.componentSetId &&
          extComp.componentSetId === arraySlot.componentSetId) ||
        (arraySlot.componentId && extComp.componentId === arraySlot.componentId)
      ) {
        return true;
      }
    }

    // 하위 노드 재귀 검사
    for (const child of node.children) {
      if (
        this._containsArraySlotInstance(child, arraySlotInstanceIds, arraySlot)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 배열 슬롯을 .map() 형태로 렌더링
   * {slotName.map((item, index) => <ComponentName key={index} {...item} />)}
   * 또는 레이아웃 스타일이 있으면:
   * {slotName.map((item, index) => <div key={index} style={{...}}><ComponentName {...item} /></div>)}
   */
  private _createArraySlotMapExpression(
    _node: FinalAstTree,
    slot: ArraySlot
  ): ts.JsxExpression {
    const factory = this.factory;

    // 아이템 컴포넌트 이름 추출 (externalComponent에서 가져오거나 인스턴스 이름에서 유추)
    const firstInstance = slot.instances[0];
    const componentName = this._inferComponentNameFromSlot(slot);

    // 첫 번째 인스턴스의 레이아웃 스타일 추출 (wrapper에 적용할 스타일)
    const firstInstanceNode = this._findNodeById(
      this.astTree,
      firstInstance.id
    );
    const layoutStyles = this._extractLayoutStyles(
      firstInstanceNode?.style?.base || {}
    );
    const hasLayoutStyles = Object.keys(layoutStyles).length > 0;

    // props 속성들 생성: size={item.size}, selected={item.selected}, ...
    const componentAttributes: ts.JsxAttributeLike[] = [];

    // item의 각 prop을 JSX attribute로 변환
    for (const prop of slot.itemProps) {
      const propAccess = factory.createPropertyAccessExpression(
        factory.createIdentifier("item"),
        factory.createIdentifier(prop.name)
      );
      componentAttributes.push(
        factory.createJsxAttribute(
          factory.createIdentifier(prop.name),
          factory.createJsxExpression(undefined, propAccess)
        )
      );
    }

    // <ComponentName size={item.size} ... /> (key 없이)
    const componentElement = factory.createJsxSelfClosingElement(
      factory.createIdentifier(componentName),
      undefined,
      factory.createJsxAttributes(componentAttributes)
    );

    // key={index} attribute
    const keyAttr = factory.createJsxAttribute(
      factory.createIdentifier("key"),
      factory.createJsxExpression(undefined, factory.createIdentifier("index"))
    );

    // 최종 JSX 요소 결정
    let finalJsxElement: ts.JsxSelfClosingElement | ts.JsxElement;

    if (hasLayoutStyles) {
      // wrapper div에 key와 style 적용
      // <div key={index} data-figma-id="..." style={{height: "24px", flex: "1 0 0"}}><SelectButton ... /></div>
      const styleProperties: ts.PropertyAssignment[] = [];
      for (const [prop, value] of Object.entries(layoutStyles)) {
        styleProperties.push(
          factory.createPropertyAssignment(
            factory.createIdentifier(prop),
            factory.createStringLiteral(value)
          )
        );
      }

      const styleAttr = factory.createJsxAttribute(
        factory.createIdentifier("style"),
        factory.createJsxExpression(
          undefined,
          factory.createObjectLiteralExpression(styleProperties, false)
        )
      );

      // wrapper div 속성 (key, style, 그리고 debug 모드면 data-figma-id)
      const wrapperAttrs: ts.JsxAttributeLike[] = [keyAttr, styleAttr];

      // debug 모드: wrapper에 data-figma-id 추가 (layout comparison용)
      if (this.debug && firstInstanceNode) {
        wrapperAttrs.push(
          factory.createJsxAttribute(
            factory.createIdentifier("data-figma-id"),
            factory.createStringLiteral(firstInstanceNode.id)
          )
        );
      }

      finalJsxElement = factory.createJsxElement(
        factory.createJsxOpeningElement(
          factory.createIdentifier("div"),
          undefined,
          factory.createJsxAttributes(wrapperAttrs)
        ),
        [componentElement],
        factory.createJsxClosingElement(factory.createIdentifier("div"))
      );
    } else {
      // wrapper 없이 컴포넌트에 key 직접 적용
      // <ComponentName key={index} size={item.size} ... />
      finalJsxElement = factory.createJsxSelfClosingElement(
        factory.createIdentifier(componentName),
        undefined,
        factory.createJsxAttributes([keyAttr, ...componentAttributes])
      );
    }

    // (item, index) => <...>
    const arrowFunction = factory.createArrowFunction(
      undefined,
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("item")
        ),
        factory.createParameterDeclaration(
          undefined,
          undefined,
          factory.createIdentifier("index")
        ),
      ],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      finalJsxElement
    );

    // slotName.map(...)
    const mapCall = factory.createCallExpression(
      factory.createPropertyAccessExpression(
        factory.createIdentifier(slot.slotName),
        factory.createIdentifier("map")
      ),
      undefined,
      [arrowFunction]
    );

    // {slotName.map(...)}
    return factory.createJsxExpression(undefined, mapCall);
  }

  /**
   * 배열 슬롯에서 컴포넌트 이름 추론
   * AST에서 externalComponent.componentName을 찾거나, slot의 정보에서 유추
   */
  private _inferComponentNameFromSlot(slot: ArraySlot): string {
    // AST에서 해당 slot의 첫 번째 인스턴스 노드를 찾아서 externalComponent.componentName 사용
    const firstInstanceId = slot.instances[0]?.id;
    if (firstInstanceId) {
      const instanceNode = this._findNodeById(this.astTree, firstInstanceId);
      if (instanceNode?.externalComponent?.componentName) {
        return instanceNode.externalComponent.componentName;
      }
    }

    // fallback: slot.componentSetId가 있으면 해당 정보에서 유추
    // (이 경우는 AST에 externalComponent가 없는 경우)
    return "Item";
  }

  /**
   * AST에서 특정 ID의 노드 찾기
   */
  private _findNodeById(
    node: FinalAstTree,
    targetId: string
  ): FinalAstTree | null {
    if (node.id === targetId) {
      return node;
    }
    for (const child of node.children) {
      const found = this._findNodeById(child, targetId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * JSX Element 생성 (self-closing 또는 일반 element)
   */
  private _createJsxElement(
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
   * 부분 텍스트 스타일링을 위한 세그먼트 JSX 생성
   * 각 세그먼트를 <span>으로 감싸고 인라인 스타일 적용
   */
  private _createTextSegments(
    segments: Array<{
      text: string;
      styleIndex: number;
      style: Record<string, string> | null;
    }>
  ): ts.JsxChild[] {
    const result: ts.JsxChild[] = [];

    for (const segment of segments) {
      if (segment.style && Object.keys(segment.style).length > 0) {
        // 스타일이 있으면 <span style={{...}}>텍스트</span>
        const styleProperties = Object.entries(segment.style).map(
          ([key, value]) => {
            // CSS 속성명을 camelCase로 변환 (font-weight → fontWeight)
            const camelKey = key.replace(/-([a-z])/g, (_, c) =>
              c.toUpperCase()
            );
            return this.factory.createPropertyAssignment(
              this.factory.createIdentifier(camelKey),
              this.factory.createStringLiteral(value)
            );
          }
        );

        const styleObject = this.factory.createObjectLiteralExpression(
          styleProperties,
          false
        );

        const styleAttr = this.factory.createJsxAttribute(
          this.factory.createIdentifier("style"),
          this.factory.createJsxExpression(undefined, styleObject)
        );

        const spanElement = this.factory.createJsxElement(
          this.factory.createJsxOpeningElement(
            this.factory.createIdentifier("span"),
            undefined,
            this.factory.createJsxAttributes([styleAttr])
          ),
          [this.factory.createJsxText(segment.text, false)],
          this.factory.createJsxClosingElement(
            this.factory.createIdentifier("span")
          )
        );

        result.push(spanElement);
      } else {
        // 스타일이 없으면 텍스트만 추가
        result.push(this.factory.createJsxText(segment.text, false));
      }
    }

    return result;
  }

  /**
   * 줄바꿈(\n)이 포함된 텍스트를 <br /> 태그와 함께 생성
   * "첫 번째 줄\n두 번째 줄" → ["첫 번째 줄", <br />, "두 번째 줄"]
   */
  private _createTextWithLineBreaks(text: string): ts.JsxChild[] {
    const lines = text.split("\n");
    const result: ts.JsxChild[] = [];

    for (let i = 0; i < lines.length; i++) {
      // 텍스트 추가
      if (lines[i].length > 0) {
        result.push(this.factory.createJsxText(lines[i], false));
      }

      // 마지막 줄이 아니면 <br /> 추가
      if (i < lines.length - 1) {
        const brElement = this.factory.createJsxSelfClosingElement(
          this.factory.createIdentifier("br"),
          undefined,
          this.factory.createJsxAttributes([])
        );
        result.push(brElement);
      }
    }

    return result;
  }

  /**
   * VECTOR 노드를 JSX SVG Element로 렌더링
   * SVG 문자열을 파싱하여 React JSX로 변환
   */
  private _createVectorSvgElement(
    node: FinalAstTree,
    attributes: ts.JsxAttributeLike[]
  ): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxExpression {
    // variant별로 다른 SVG가 있는 경우 조건부 렌더링
    if (node.metaData.vectorSvgs) {
      return this._createVariantSvgElement(node, attributes);
    }

    const svgString = node.metaData.vectorSvg as string;

    // SVG 문자열을 JSX AST로 변환
    const svgToJsx = new SvgToJsx();
    const svgJsx = svgToJsx.convert(svgString);

    if (svgJsx) {
      // 성공적으로 변환된 경우: css 속성 병합
      if (ts.isJsxSelfClosingElement(svgJsx)) {
        // Self-closing SVG 요소에 css 속성 추가
        const existingAttrs = svgJsx.attributes.properties;
        const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
        return this.factory.createJsxSelfClosingElement(
          svgJsx.tagName,
          undefined,
          this.factory.createJsxAttributes(mergedAttrs)
        );
      } else if (ts.isJsxElement(svgJsx)) {
        // 일반 SVG 요소에 css 속성 추가
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
   * variant별로 다른 SVG를 조건부로 렌더링
   * {customName === "ONiON X1" ? <svg>...</svg> : customName === "ONiON X2" ? <svg>...</svg> : <svg>...</svg>}
   */
  private _createVariantSvgElement(
    node: FinalAstTree,
    attributes: ts.JsxAttributeLike[]
  ): ts.JsxExpression {
    const vectorSvgs = node.metaData.vectorSvgs as Record<string, string>;

    // variant prop 이름 찾기 (type이 "VARIANT"인 prop)
    // originalKey도 함께 저장 (rename된 경우 매칭에 사용)
    let variantPropName: string | null = null;
    let variantOriginalKey: string | null = null;
    for (const [propName, propDef] of Object.entries(this.astTree.props)) {
      if ((propDef as any)?.type === "VARIANT") {
        variantPropName = propName;
        variantOriginalKey = (propDef as any)?.originalKey || null;
        break;
      }
    }

    if (!variantPropName) {
      // variant prop을 찾지 못하면 첫 번째 SVG로 fallback
      const firstSvg = Object.values(vectorSvgs)[0];
      const svgToJsx = new SvgToJsx();
      const svgJsx = svgToJsx.convert(firstSvg);
      if (svgJsx) {
        return this.factory.createJsxExpression(undefined, svgJsx as any);
      }
      return this.factory.createJsxExpression(
        undefined,
        this.factory.createNull()
      );
    }

    // variant name에서 prop value 추출 (예: "Name=ONiON X1" → "ONiON X1")
    const entries = Object.entries(vectorSvgs);
    const svgToJsx = new SvgToJsx();

    // 각 variant에 대한 SVG JSX 생성
    const variantSvgs: Array<{ value: string; jsx: ts.JsxChild }> = [];
    for (const [variantName, svgString] of entries) {
      // variantName 파싱 (예: "Name=ONiON X1, Size=Large" → { Name: "ONiON X1", Size: "Large" })
      const parsed: Record<string, string> = {};
      for (const part of variantName.split(",")) {
        const [key, val] = part.split("=").map((s) => s.trim());
        if (key && val) {
          parsed[key] = val;
        }
      }

      // variantPropName에 해당하는 값 추출
      // originalKey가 있으면 그것도 매칭에 사용 (rename된 경우: Name → customName)
      let propValue: string | null = null;
      for (const [key, val] of Object.entries(parsed)) {
        // originalKey와 직접 비교하거나 camelCase 변환 후 propName과 비교
        if (
          key === variantOriginalKey ||
          toCamelCase(key) === variantPropName
        ) {
          propValue = val;
          break;
        }
      }

      if (!propValue) continue;

      const svgJsx = svgToJsx.convert(svgString);
      if (svgJsx) {
        // css 속성 병합
        let mergedSvg: ts.JsxChild;
        if (ts.isJsxSelfClosingElement(svgJsx)) {
          const existingAttrs = svgJsx.attributes.properties;
          const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
          mergedSvg = this.factory.createJsxSelfClosingElement(
            svgJsx.tagName,
            undefined,
            this.factory.createJsxAttributes(mergedAttrs)
          );
        } else if (ts.isJsxElement(svgJsx)) {
          const existingAttrs = svgJsx.openingElement.attributes.properties;
          const mergedAttrs = [...attributes, ...Array.from(existingAttrs)];
          mergedSvg = this.factory.createJsxElement(
            this.factory.createJsxOpeningElement(
              svgJsx.openingElement.tagName,
              undefined,
              this.factory.createJsxAttributes(mergedAttrs)
            ),
            svgJsx.children,
            svgJsx.closingElement
          );
        } else {
          continue;
        }
        variantSvgs.push({ value: propValue, jsx: mergedSvg });
      }
    }

    if (variantSvgs.length === 0) {
      return this.factory.createJsxExpression(
        undefined,
        this.factory.createNull()
      );
    }

    // 중첩 삼항 연산자 생성: propName === "val1" ? svg1 : propName === "val2" ? svg2 : svg3
    // 역순으로 구성 (마지막 값이 else절이 됨)
    // JSX 요소는 ParenthesizedExpression으로 감싸지 않고 직접 사용
    let conditionalExpr: ts.Expression = variantSvgs[variantSvgs.length - 1].jsx as unknown as ts.Expression;

    for (let i = variantSvgs.length - 2; i >= 0; i--) {
      const { value, jsx } = variantSvgs[i];
      conditionalExpr = this.factory.createConditionalExpression(
        this.factory.createBinaryExpression(
          this.factory.createIdentifier(variantPropName),
          this.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
          this.factory.createStringLiteral(value)
        ),
        this.factory.createToken(ts.SyntaxKind.QuestionToken),
        jsx as unknown as ts.Expression,
        this.factory.createToken(ts.SyntaxKind.ColonToken),
        conditionalExpr
      );
    }

    return this.factory.createJsxExpression(undefined, conditionalExpr);
  }

  private _getTagName(node: FinalAstTree): string {
    // semanticRole을 우선적으로 고려하여 적절한 HTML 태그 결정
    const semanticRole = node.semanticRole;

    // 루트 노드는 항상 HTML 요소로 (자기 자신 참조 방지)
    const isRootNode = node.parent === null;

    // INSTANCE 타입: 루트면 div, 자식이면 컴포넌트 이름
    if (node.type === "INSTANCE") {
      return isRootNode ? "div" : this._normalizeName(node.name);
    }

    switch (semanticRole) {
      case "button":
        return "button";
      case "text":
        return "span";
      case "image":
        return "img";
      case "vector":
        // vectorSvg가 있으면 svg, 없으면 div (배경색으로 표현)
        return node.metaData?.vectorSvg ? "svg" : "div";
      case "icon":
        return "span";
      case "container":
      case "root":
      default:
        return "div";
    }
  }

  /**
   * Style 속성 생성 (css prop 사용)
   * GenerateStyles에서 생성한 CSS 함수 변수를 참조
   */
  private _createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null {
    const hasBaseStyle =
      node.style.base && Object.keys(node.style.base).length > 0;
    const hasDynamicStyle = node.style.dynamic && node.style.dynamic.length > 0;
    const hasPseudoStyle =
      node.style.pseudo && Object.keys(node.style.pseudo).length > 0;

    // 스타일이 없는 경우
    if (!hasBaseStyle && !hasDynamicStyle && !hasPseudoStyle) {
      return null;
    }

    // CSS 함수 변수명 생성 (GenerateStyles와 동일한 로직)
    const cssVarName = this._getCssVariableName(node);

    // Dynamic styles를 prop별로 그룹핑
    const grouped = this._groupDynamicStylesByProp(node.style.dynamic || []);

    // grouped.size > 0 이면 함수 호출, 아니면 변수 참조
    // (GenerateStyles.ts의 params.length > 0 로직과 동일하게 맞춤)
    let cssExpression: ts.Expression;

    if (grouped.size > 0) {
      // 파라미터 생성 (구조 분해된 변수 사용)
      const args: ts.Expression[] = [];
      for (const [propName] of grouped.entries()) {
        // props.size 대신 size 사용 (구조 분해됨)
        const propIdentifier = this.factory.createIdentifier(propName);
        args.push(propIdentifier);
      }

      // CSS 함수 호출: cssVarName(props.size, ...)
      cssExpression = this.factory.createCallExpression(
        this.factory.createIdentifier(cssVarName),
        undefined,
        args
      );
    } else {
      // grouped가 비어있으면 변수 참조: cssVarName
      cssExpression = this.factory.createIdentifier(cssVarName);
    }

    return this.factory.createJsxAttribute(
      this.factory.createIdentifier("css"),
      this.factory.createJsxExpression(undefined, cssExpression)
    );
  }

  /**
   * 노드의 CSS 함수 변수명 가져오기
   * GenerateStyles에서 생성한 이름을 AST에서 참조
   */
  private _getCssVariableName(node: FinalAstTree): string {
    // AST에 저장된 변수명 사용 (GenerateStyles에서 생성)
    if (node.generatedNames?.cssVarName) {
      return node.generatedNames.cssVarName;
    }

    // fallback: 기존 로직 (generatedNames가 없는 경우)
    let nodeName = node.name;
    if (!node.parent && node.metaData.document) {
      nodeName = node.metaData.document.name;
    }
    return `${this._normalizeName(nodeName)}Css`;
  }

  /**
   * 노드 이름을 변수명으로 정규화 - stringUtils의 normalizeName을 사용하여 GenerateStyles와 일관성 유지
   */
  private _normalizeName(name: string): string {
    return normalizeName(name);
  }

  /**
   * kebab-case를 camelCase로 변환
   * 예: flex-direction → flexDirection
   */
  private _kebabToCamel(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 노드의 스타일 변수 이름 생성 (짧고 의미있는 이름) - 사용하지 않음, 호환성 유지
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
   * ESTree 조건에서 prop 이름과 값 추출
   * props.Size === "Large" → { prop: "size", value: "Large" }
   * props.rightIcon != null → { prop: "rightIcon", value: "notNull" }
   * props.rightIcon == null → { prop: "rightIcon", value: "null" }
   */
  private _extractPropAndValue(condition: any): {
    prop: string;
    value: string;
  } | null {
    if (!condition || condition.type !== "BinaryExpression") {
      return null;
    }

    // props.X === "value" 형태 처리
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

    // props.X != null 또는 props.X == null 형태 처리 (SLOT 조건)
    if (
      (condition.operator === "!=" || condition.operator === "==") &&
      condition.left?.type === "MemberExpression" &&
      condition.left.object?.name === "props" &&
      condition.right?.type === "NullLiteral"
    ) {
      const propName = condition.left.property?.name;

      if (propName) {
        // prop 이름을 camelCase로 변환
        const camelPropName =
          propName.charAt(0).toLowerCase() + propName.slice(1);
        // != null → "notNull", == null → "null"
        const value = condition.operator === "!=" ? "notNull" : "null";
        return {
          prop: camelPropName,
          value: value,
        };
      }
    }

    return null;
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

  /**
   * CSS 속성 키를 camelCase로 변환
   * "flex-direction" → "flexDirection"
   */
  private _normalizeCssKey(key: string): string {
    return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
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
   * Variant 스타일 map 생성 (예: sizeStyles: { Large: css({...}), Medium: css({...}) })
   */
  private _createVariantStyleMap(
    mapName: string,
    variants: Array<{ value: string; style: Record<string, any> }>
  ): ts.PropertyAssignment {
    // 객체 리터럴 속성들 생성: { Large: css({...}), Medium: css({...}), ... }
    const variantProperties: ts.PropertyAssignment[] = variants.map(
      (variant) => {
        const cssCall = this._createCssCall(variant.style);

        // 하이픈이나 특수문자가 포함된 경우 문자열 리터럴 사용
        const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(
          variant.value
        );
        const propertyName = isValidIdentifier
          ? this.factory.createIdentifier(variant.value)
          : this.factory.createStringLiteral(variant.value);

        return this.factory.createPropertyAssignment(propertyName, cssCall);
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
   * ESTree AST를 TypeScript Expression으로 변환
   * ConditionNode (BinaryExpression | UnaryExpression | MemberExpression | Literal) → ts.Expression
   */
  private _convertEstreeToTsExpression(estreeNode: any): ts.Expression {
    if (!estreeNode || !estreeNode.type) {
      return this.factory.createTrue(); // fallback
    }

    switch (estreeNode.type) {
      case "BinaryExpression":
        return this._convertBinaryExpression(estreeNode);

      case "UnaryExpression":
        return this._convertUnaryExpression(estreeNode);

      case "MemberExpression":
        return this._convertMemberExpression(estreeNode);

      case "Literal":
        return this._convertLiteral(estreeNode);

      case "LogicalExpression":
        // ESTree의 LogicalExpression (&&, ||)도 BinaryExpression으로 처리
        return this._convertBinaryExpression(estreeNode);

      case "Identifier":
        return this._convertIdentifier(estreeNode);

      case "CallExpression":
        return this._convertCallExpression(estreeNode);

      case "ArrayExpression":
        return this._convertArrayExpression(estreeNode);

      default:
        console.warn(
          `Unknown ESTree node type: ${estreeNode.type}`,
          estreeNode
        );
        return this.factory.createTrue(); // fallback
    }
  }

  /**
   * BinaryExpression 변환 (예: props.size === 'L')
   * Boolean/Slot prop의 경우 === "True" → propName, === "False" → !propName 으로 변환
   */
  private _convertBinaryExpression(node: any): ts.Expression {
    // Boolean/Slot prop 문자열 비교를 실제 boolean 비교로 변환
    // props.serviceCenter === "True" → serviceCenter
    // props.serviceCenter === "False" → !serviceCenter
    // props.doubleButton === "True" → doubleButton (slot truthy check)
    // props.doubleButton === "False" → !doubleButton (slot falsy check)
    if (
      (node.operator === "===" || node.operator === "!==") &&
      node.left?.type === "MemberExpression" &&
      node.left?.object?.name === "props" &&
      node.right?.type === "Literal" &&
      (node.right?.value === "True" || node.right?.value === "False")
    ) {
      const propName = node.left.property?.name;
      if (propName) {
        // astTree.props에서 해당 prop이 BOOLEAN 또는 SLOT 타입인지 확인
        const propDef = this.astTree.props[propName];
        if (propDef?.type === "BOOLEAN" || propDef?.type === "SLOT") {
          const propIdentifier = this.factory.createIdentifier(propName);
          const isTrue = node.right.value === "True";
          const isEquality = node.operator === "===";

          // === "True" → propName (truthy check)
          // === "False" → !propName (falsy check)
          // !== "True" → !propName
          // !== "False" → propName
          const shouldNegate = isEquality ? !isTrue : isTrue;

          if (shouldNegate) {
            return this.factory.createPrefixUnaryExpression(
              ts.SyntaxKind.ExclamationToken,
              propIdentifier
            );
          }
          return propIdentifier;
        }
      }
    }

    const left = this._convertEstreeToTsExpression(node.left);
    const right = this._convertEstreeToTsExpression(node.right);

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
      (this.factory.createToken as any)(syntaxKind),
      right
    );
  }

  /**
   * UnaryExpression 변환 (예: !props.isOpen)
   */
  private _convertUnaryExpression(node: any): ts.PrefixUnaryExpression {
    const operand = this._convertEstreeToTsExpression(node.argument);
    const operatorKind =
      node.operator === "!"
        ? ts.SyntaxKind.ExclamationToken
        : ts.SyntaxKind.MinusToken;
    const operatorToken = this.factory.createToken(operatorKind);

    return this.factory.createPrefixUnaryExpression(
      operatorToken as any,
      operand
    );
  }

  /**
   * MemberExpression 변환 (예: props.size → size)
   * props 객체를 참조하는 경우, 구조 분해된 변수를 직접 사용
   */
  private _convertMemberExpression(node: any): ts.Expression {
    // props.X 형태인 경우, 구조 분해된 변수 X를 직접 사용
    if (
      node.object?.type === "Identifier" &&
      node.object?.name === "props" &&
      !node.computed
    ) {
      const propertyName = node.property.name || node.property;
      return this.factory.createIdentifier(propertyName);
    }

    const object = this._convertEstreeToTsExpression(node.object);

    // computed가 true면 bracket notation (props['Left Icon']), false면 dot notation (props.size)
    if (node.computed) {
      const property = this._convertEstreeToTsExpression(node.property);
      return this.factory.createElementAccessExpression(object, property);
    } else {
      // property가 Identifier인 경우
      const propertyName = node.property.name || node.property;
      return this.factory.createPropertyAccessExpression(
        object,
        this.factory.createIdentifier(propertyName)
      );
    }
  }

  /**
   * Identifier 변환 (예: props, 변수명 등)
   */
  private _convertIdentifier(node: any): ts.Identifier {
    const name = node.name || "unknown";
    return this.factory.createIdentifier(name);
  }

  /**
   * Literal 변환 (string, number, boolean 등)
   */
  private _convertLiteral(node: any): ts.Expression {
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

    // 기본값
    return this.factory.createStringLiteral(String(value));
  }

  /**
   * CallExpression 변환 (예: ["a", "b"].includes(prop))
   */
  private _convertCallExpression(node: any): ts.CallExpression {
    const callee = this._convertEstreeToTsExpression(node.callee);
    const args = (node.arguments || []).map((arg: any) =>
      this._convertEstreeToTsExpression(arg)
    );
    return this.factory.createCallExpression(callee, undefined, args);
  }

  /**
   * ArrayExpression 변환 (예: ["a", "b", "c"])
   */
  private _convertArrayExpression(node: any): ts.ArrayLiteralExpression {
    const elements = (node.elements || []).map((el: any) =>
      this._convertEstreeToTsExpression(el)
    );
    return this.factory.createArrayLiteralExpression(elements);
  }

  /**
   * 조건부 렌더링으로 JSX 요소 감싸기
   */
  private _wrapWithConditionalRendering(
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
}

export default CreateJsxTree;
