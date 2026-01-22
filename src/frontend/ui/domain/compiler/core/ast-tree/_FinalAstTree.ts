import SpecDataManager from "@compiler/manager/SpecDataManager";
import {
  FinalAstTree,
  NewMergedNode,
  StyleObject,
  TempAstTree,
  ConditionNode,
  VisibleValue,
  StyleTree,
  SemanticRole,
} from "@compiler";
import HelperManager from "@compiler/manager/HelperManager";
import { traverseTree } from "@figma/eslint-plugin-figma-plugins/dist/util";
import { traverseBFS } from "@compiler/utils/traverse";
import { toCamelCase } from "@compiler/utils/normalizeString";
import { generate } from "astring";
import { value } from "happy-dom/lib/PropertySymbol";

import * as estraverse from "estraverse";
import debug from "@compiler/manager/DebuggingManager";
import helper from "@compiler/manager/HelperManager";

type SlotCandidateProp = { key: string; type: string };
type SlotBinding = {
  propName: string;
  node: FinalAstTree;
  bindingType: string;
};
type NodeInfo = {
  node: FinalAstTree;
  x: number;
  y: number;
  normalizedName: string;
};

/**
 * 값을 목적에 맞게 가공하는 역할
 */
class _FinalAstTree {
  private _finalAstTree: FinalAstTree;

  private specDataManager: SpecDataManager;

  public get finalAstTree() {
    return this._finalAstTree;
  }

  constructor(specDataManager: SpecDataManager, tempAstTree: TempAstTree) {
    this.specDataManager = specDataManager;

    let finalAstTree = this.createFinalAstTree(tempAstTree);
    finalAstTree = this.updateCleanupNodes(finalAstTree);
    finalAstTree = this._processHiddenNodes(finalAstTree);
    finalAstTree = this.updateMetaData(finalAstTree);
    finalAstTree = this.updateProps(finalAstTree);
    finalAstTree = this.updateExternalComponents(finalAstTree);
    finalAstTree = this.updateSvgFillToColor(finalAstTree, tempAstTree);
    finalAstTree = this.updateOverrideableProps(finalAstTree);
    finalAstTree = this.removeRedundantVisibleConditions(finalAstTree);

    this._finalAstTree = finalAstTree;
  }

  /**
   * dependency 컴포넌트가 받을 수 있는 오버라이드 props 생성
   * _overrideableProps가 있는 경우에만 (dependency 컴포넌트만)
   * + 오버라이드 가능한 노드의 스타일을 CSS 변수로 변경
   */
  private updateOverrideableProps(astTree: FinalAstTree): FinalAstTree {
    // _overrideableProps 정보가 있으면 사용 (dependency 컴포넌트)
    const spec = this.specDataManager.getSpec() as any;
    if (spec._overrideableProps) {
      astTree.overrideableProps = spec._overrideableProps;

      // 오버라이드 가능한 노드의 스타일을 CSS 변수로 변경
      this._applyOverrideableCssVariables(astTree, spec._overrideableProps);
    }

    // 메인 컴포넌트는 overrideableProps를 생성하지 않음
    // (오버라이드는 dependency 컴포넌트에서만 처리)
    return astTree;
  }

  /**
   * 오버라이드 가능한 노드의 스타일에 CSS 변수 적용
   * 예: background: #D6D6D6 → background: var(--rectangle1-bg, #D6D6D6)
   *
   * 주의:
   * - CSS 변수명은 nodeName을 kebab-case로 변환하여 생성
   * - CreateJsxTree._createOverrideStyleAttribute와 동일한 방식 사용
   * - 이미 CSS 변수가 적용된 경우 중복 적용 방지
   */
  private _applyOverrideableCssVariables(
    node: FinalAstTree,
    overrideableProps: Record<
      string,
      { nodeId: string; nodeName: string; type: string }
    >
  ): void {
    // fills 오버라이드만 처리 (Bg로 끝나는 prop)
    const bgProps = Object.entries(overrideableProps).filter(
      ([propName, info]) => propName.endsWith("Bg") && info.type === "fills"
    );

    if (bgProps.length === 0) {
      return;
    }

    // 모든 노드를 순회하며 매칭되는 노드에 CSS 변수 적용
    this._traverseAndApplyCssVariables(node, bgProps);
  }

  /**
   * 트리를 순회하며 오버라이드 가능한 노드에 CSS 변수 적용
   */
  private _traverseAndApplyCssVariables(
    node: FinalAstTree,
    bgProps: Array<[string, { nodeId: string; nodeName: string; type: string }]>
  ): void {
    const normalizedNodeName = this._toCamelCase(node.name);

    // 현재 노드가 오버라이드 대상인지 확인
    for (const [_propName, info] of bgProps) {
      if (normalizedNodeName === info.nodeName) {
        const background = node.style?.base?.background;

        if (background) {
          // CSS 변수명: CreateJsxTree와 동일한 방식 (nodeName → kebab-case)
          const cssVarName = `--${normalizedNodeName.replace(/([A-Z])/g, "-$1").toLowerCase()}-bg`;

          // 이미 해당 CSS 변수가 적용되었는지 확인 (중복 방지)
          if (background.includes(cssVarName)) {
            break;
          }

          // CSS 변수로 감싸기 (기존 값이 var(...)이어도 중첩 가능)
          node.style.base!.background = `var(${cssVarName}, ${background})`;
        }
        break; // 하나의 노드는 하나의 prop에만 매칭
      }
    }

    // 자식 노드 순회
    if (node.children) {
      for (const child of node.children) {
        this._traverseAndApplyCssVariables(child, bgProps);
      }
    }
  }

  /**
   * 문자열을 camelCase로 변환
   * CreateJsxTree의 toCamelCase와 동일한 로직 사용
   */
  private _toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");
  }

  /**
   * SVG fill 색상을 부모의 CSS color로 변환
   * SVG에서 fill="currentColor"를 사용하므로, 부모에 color 속성이 필요
   *
   * 로직:
   * 1. tempAstTree.mergedNode에서 각 variant의 자식 중 fill 스타일을 찾음
   * 2. Default variant의 fill → base style의 color
   * 3. Disabled variant의 fill → :disabled pseudo style의 color
   */
  private updateSvgFillToColor(
    astTree: FinalAstTree,
    tempAstTree: TempAstTree
  ): FinalAstTree {
    const mergedNode = tempAstTree.mergedNode;
    if (!mergedNode || mergedNode.length === 0) {
      return astTree;
    }

    // mergedNode의 variantName에서 State가 있는지 확인
    // (Plus 같은 내부 컴포넌트는 State가 없으므로 부모의 color를 상속받음)
    const hasStateInVariants = mergedNode.some((variant) => {
      const variantName = variant.variantName || variant.name || "";
      return /State=/i.test(variantName);
    });
    if (!hasStateInVariants) {
      return astTree;
    }

    // 각 variant에서 fill 색상 추출
    const fillByVariant = new Map<string, string>();

    for (const variant of mergedNode) {
      const variantName = variant.variantName || variant.name || "";
      const fillColor = this._findFillColorInChildren(variant);
      if (fillColor) {
        fillByVariant.set(variantName, fillColor);
      }
    }

    if (fillByVariant.size === 0) {
      return astTree;
    }

    // State 값 추출 (예: "Size=Large, State=Disabled" → "Disabled")
    const getStateFromVariantName = (name: string): string | null => {
      const match = name.match(/State=(\w+)/i);
      return match ? match[1] : null;
    };

    // Default variant의 fill → base color
    let defaultColor: string | null = null;
    let disabledColor: string | null = null;

    for (const [variantName, fillColor] of fillByVariant.entries()) {
      const state = getStateFromVariantName(variantName);
      if (state === "Default" || state === null) {
        if (!defaultColor) defaultColor = fillColor;
      } else if (state === "Disabled") {
        disabledColor = fillColor;
      }
    }

    // 모든 fill이 같으면 base에만 적용
    const uniqueColors = new Set(fillByVariant.values());
    if (uniqueColors.size === 1) {
      const color = uniqueColors.values().next().value;
      astTree.style.base = { ...astTree.style.base, color };
    } else {
      // Default color → base
      if (defaultColor) {
        astTree.style.base = { ...astTree.style.base, color: defaultColor };
      }

      // Disabled color → :disabled pseudo
      if (disabledColor && disabledColor !== defaultColor) {
        if (!astTree.style.pseudo) {
          astTree.style.pseudo = {};
        }
        astTree.style.pseudo[":disabled"] = {
          ...astTree.style.pseudo[":disabled"],
          color: disabledColor,
        };
      }
    }

    return astTree;
  }

  /**
   * variant의 자식 노드들에서 fill 색상 찾기
   */
  private _findFillColorInChildren(variant: StyleTree): string | null {
    const cssStyle = variant.cssStyle || {};

    // 현재 노드에 fill이 있으면 반환
    if (cssStyle.fill) {
      return this._extractColorFromFill(cssStyle.fill);
    }

    // 자식 노드들에서 찾기
    if (variant.children) {
      for (const child of variant.children) {
        const childFill = this._findFillColorInChildren(child);
        if (childFill) return childFill;
      }
    }

    return null;
  }

  /**
   * fill 값에서 색상 추출
   * "var(--Neutral-600, #4B4B4B)" → "#4B4B4B"
   * "#4B4B4B" → "#4B4B4B"
   */
  private _extractColorFromFill(fill: string): string | null {
    if (!fill) return null;

    // var(--name, #color) 형태에서 fallback 색상 추출
    const varMatch = fill.match(/var\([^,]+,\s*([^)]+)\)/);
    if (varMatch) {
      return varMatch[1].trim();
    }

    // 직접 색상 값
    if (fill.startsWith("#") || fill.startsWith("rgb")) {
      return fill;
    }

    return null;
  }

  private createFinalAstTree(tempAstTree: TempAstTree): FinalAstTree {
    const convert = (
      node: TempAstTree,
      parent: FinalAstTree | null
    ): FinalAstTree => {
      const finalNode: FinalAstTree = {
        id: node.id,
        name: node.name,
        type: node.type,
        props: { ...node.props },
        parent: parent,
        visible: node.visible ?? { type: "static", value: true },
        style: node.style,
        children: [],
        semanticRole: "container", // 기본값, updateMetaData에서 정확한 값 할당
        metaData: {
          // mergedNode 정보 복사 (variant별 SVG 처리에 필요)
          mergedNode: node.mergedNode,
        },
      };

      finalNode.children = node.children.map((child) =>
        convert(child, finalNode)
      );

      return finalNode;
    };

    return convert(tempAstTree, null);
  }

  /**
   * 불필요한 노드 삭제
   * 높이값이 0인 노드 삭제 (absoluteBoundingBox)
   * 그리는데 불필요한 노드 삭제(node.id가 I258:34208;250:78017 이런 형태)
   * visible이 false인 것들
   * @param astTree
   * @private
   */
  private updateCleanupNodes(astTree: FinalAstTree) {
    const nodesToRemove: FinalAstTree[] = [];

    // 루트가 INSTANCE인 경우, 자식 노드들을 삭제하지 않음
    const isRootInstance = astTree.type === "INSTANCE";

    // dependency 컴파일 판단:
    // 원래 children이 비어있었고, enrichVariantWithInstanceChildren로 채워진 경우
    // 이 경우에만 I... 노드를 유지해야 함 (실제 콘텐츠이므로)
    const specData = this.specDataManager.getSpec();
    const enrichedFromEmptyChildren =
      (specData as any)._enrichedFromEmptyChildren === true;

    // 1. 삭제할 노드 수집
    traverseBFS(astTree, (node, meta) => {
      const targetSpec = this.specDataManager.getSpecById(node.id);
      if (targetSpec.absoluteBoundingBox?.height === 0) {
        nodesToRemove.push(node);
      }

      // INSTANCE 내부 노드 정리:
      // - 루트가 INSTANCE이면 I... 노드 유지
      // - 원래 children이 비어있고 enrichment로 채워진 경우 I... 노드 유지
      // - TEXT 노드는 항상 유지 (사용자에게 보이는 콘텐츠)
      // - I... 노드가 INSTANCE이고 dependency에 있는 componentId를 참조하면 유지 (externalComponent로 변환됨)
      // - I... 노드의 자손 중에 dependency 참조가 있으면 유지 (부모도 필요)
      // - 그 외에는 I... 노드 삭제
      const isInstanceChild = node.id.startsWith("I");
      if (isInstanceChild && !isRootInstance && !enrichedFromEmptyChildren) {
        // TEXT 노드는 삭제하지 않음 (사용자에게 보이는 콘텐츠이므로)
        if (node.type === "TEXT") {
          return;
        }

        const dependencies = this.specDataManager.getDependencies();

        // 현재 노드 또는 자손 중에 dependency 참조가 있는지 확인
        const hasDescendantWithDependency = this._hasDescendantWithDependency(
          node,
          dependencies
        );

        if (!hasDescendantWithDependency) {
          nodesToRemove.push(node);
        }
      }

      // visible: false 노드 처리:
      // - 기존: 제거
      // - 변경: 제거하지 않고 show{NodeName} props로 조건부 렌더링
      // - 이유: INSTANCE에서 visible override 가능하므로 노드를 유지해야 함
      // → _processHiddenNodes 메서드에서 별도 처리
    });

    // 2. 수집된 노드들을 트리에서 제거
    nodesToRemove.forEach((node) => {
      if (node.parent) {
        node.parent.children = node.parent.children.filter(
          (child) => child !== node
        );
      }
    });

    return astTree;
  }

  /**
   * visible: false인 노드를 조건부 렌더링으로 변환
   * - visible: false 노드를 제거하지 않고 유지
   * - show{NodeName} props 생성 (기본값 false)
   * - visible을 조건부로 변경 (showXxx === true일 때 렌더링)
   *
   * 이유: INSTANCE에서 visible을 override할 수 있으므로 노드를 유지해야 함
   */
  private _processHiddenNodes(astTree: FinalAstTree): FinalAstTree {
    const hiddenNodes: FinalAstTree[] = [];

    // 1. visible: false인 노드 수집
    traverseBFS(astTree, (node) => {
      // static false인 노드
      if (node.visible?.type === "static" && node.visible.value === false) {
        hiddenNodes.push(node);
        return;
      }

      // spec에서 visible: false이고 prop binding이 없는 노드
      const spec = this.specDataManager.getSpecById(node.id);
      if (
        spec?.visible === false &&
        !spec.componentPropertyReferences?.visible &&
        node.visible?.type !== "condition"
      ) {
        hiddenNodes.push(node);
      }
    });

    // 2. 각 hidden 노드에 대해 show{NodeName} props 생성 및 visible 조건 설정
    const usedPropNames = new Set<string>();

    for (const node of hiddenNodes) {
      // prop 이름 생성: show{NodeName}
      const basePropName = `show${this._capitalizeFirstLetter(toCamelCase(node.name) || "Hidden")}`;
      let propName = basePropName;

      // 중복 이름 처리
      let counter = 2;
      while (usedPropNames.has(propName)) {
        propName = `${basePropName}${counter}`;
        counter++;
      }
      usedPropNames.add(propName);

      // props에 추가 (기본값 false)
      astTree.props[propName] = {
        type: "BOOLEAN",
        defaultValue: false,
      };

      // visible을 조건부로 변경
      node.visible = {
        type: "condition",
        condition: helper.createBinaryCondition(propName, true),
      };

      // hiddenNodeProp 정보 저장 (INSTANCE에서 override 시 사용)
      node.hiddenNodeProp = propName;
    }

    return astTree;
  }

  /**
   * 첫 글자를 대문자로 변환
   */
  private _capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 노드 또는 자손 중에 dependency 참조가 있는지 확인
   * INSTANCE 타입이고 componentId가 dependencies에 있으면 true
   */
  private _hasDescendantWithDependency(
    node: FinalAstTree,
    dependencies: Record<string, any> | undefined
  ): boolean {
    if (!dependencies) return false;

    // 현재 노드 확인
    const nodeSpec = this.specDataManager.getSpecById(node.id);
    const isInstance = (nodeSpec as any)?.type === "INSTANCE";
    const componentId = (nodeSpec as any)?.componentId;
    if (isInstance && componentId && dependencies[componentId]) {
      return true;
    }

    // 자손 확인
    if (node.children) {
      for (const child of node.children) {
        if (this._hasDescendantWithDependency(child, dependencies)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 최적의 스타일을 세팅한다.
   * @param astTree
   * @private
   */
  private updateStyle(astTree: FinalAstTree) {
    return astTree;
  }

  /**
   * 버튼 컴포넌트인지 추론
   * 1. 속성 기반: disabled, state, pressed, loading 같은 버튼 특성 prop 존재 여부
   * 2. interactions 기반: 클릭 인터랙션 존재 여부
   * 3. 이름 기반 (백업): 이름에 button, btn 포함 여부
   */
  private _isButtonComponent(): boolean {
    const propDefs = this.specDataManager.getComponentPropertyDefinitions();
    const document = this.specDataManager.getDocument();

    // 1. 속성 기반: disabled, state 같은 버튼 특성 prop 존재 여부
    const buttonPropNames = ["disabled", "state", "pressed", "loading"];
    const hasButtonProps =
      propDefs &&
      Object.keys(propDefs).some((key) =>
        buttonPropNames.includes(key.toLowerCase())
      );

    // 2. interactions 기반: 클릭 인터랙션 존재 여부
    const hasClickInteraction =
      "interactions" in document &&
      Array.isArray(document.interactions) &&
      document.interactions.some(
        (i: any) =>
          i.trigger?.type === "ON_CLICK" || i.trigger?.type === "ON_TAP"
      );

    // 3. 이름 기반 (백업)
    const nameContainsButton =
      document.name.toLowerCase().includes("button") ||
      document.name.toLowerCase().includes("btn");

    return !!(hasButtonProps || hasClickInteraction || nameContainsButton);
  }

  /**
   * 메타 데이터 추가
   * 유사한 태그 유추
   * @param astTree
   * @private
   */
  private updateMetaData(astTree: FinalAstTree) {
    const isButtonComponent = this._isButtonComponent();

    astTree.metaData.document = this.specDataManager.getDocument();

    // 각 노드에 semanticRole 할당
    traverseBFS(astTree, (node) => {
      // 루트 노드 (COMPONENT)

      if (node.parent === null) {
        node.semanticRole = isButtonComponent ? "button" : "root";
        // 루트 노드에도 vectorSvg가 있을 수 있음 (의존 컴포넌트가 아이콘인 경우)
        const vectorSvg = this.specDataManager.getVectorSvgByNodeId(node.id);
        if (vectorSvg) {
          node.metaData.vectorSvg = vectorSvg;
        }
        return;
      }

      // Figma 타입별 semanticRole 매핑
      switch (node.type) {
        case "TEXT": {
          node.semanticRole = "text";

          // variant 간 TEXT characters 비교 (slot 여부 결정)
          const mergedNodes = node.metaData.mergedNode as Array<{
            id: string;
            variantName?: string | null;
          }> | undefined;

          // COMPONENT_SET의 전체 variant 개수 확인
          const originalDocument = this.specDataManager.getDocument();
          const totalVariantCount = originalDocument?.type === "COMPONENT_SET"
            ? originalDocument.children?.length ?? 0
            : 0;

          if (mergedNodes && mergedNodes.length >= 1) {
            // TEXT가 일부 variant에만 존재하는 경우 (예: 3개 variant 중 2개만 TEXT 있음)
            if (totalVariantCount > 0 && mergedNodes.length < totalVariantCount) {
              node.metaData.shouldBeTextSlot = true;
            }

            // 병합된 노드가 2개 이상인 경우: 각 variant의 characters 비교
            if (mergedNodes.length > 1 && !node.metaData.shouldBeTextSlot) {
              let firstCharacters: string | undefined | null = undefined;
              let allSame = true;
              let hasMissing = false;

              for (const merged of mergedNodes) {
                const textSpec = this.specDataManager.getSpecById(merged.id);
                const characters = textSpec && "characters" in textSpec
                  ? (textSpec as any).characters
                  : null;

                if (characters === null || characters === undefined) {
                  hasMissing = true;
                }

                if (firstCharacters === undefined) {
                  firstCharacters = characters;
                } else if (characters !== firstCharacters) {
                  allSame = false;
                }
              }

              // variant 간 TEXT가 다르거나 일부에 없으면 slot으로 표시
              if (!allSame || hasMissing) {
                node.metaData.shouldBeTextSlot = true;
              }
            }
          }

          // TEXT 노드의 characters 저장 (고정 텍스트용)
          const textSpec = this.specDataManager.getSpecById(node.id);
          if (textSpec && "characters" in textSpec) {
            node.metaData.characters = (textSpec as any).characters;

            // 부분 텍스트 스타일링 처리 (characterStyleOverrides)
            const characters = (textSpec as any).characters as string;
            const styleOverrides = (textSpec as any).characterStyleOverrides as
              | number[]
              | undefined;
            const styleTable = (textSpec as any).styleOverrideTable as
              | Record<string, any>
              | undefined;

            if (
              styleOverrides &&
              styleOverrides.length > 0 &&
              styleTable &&
              Object.keys(styleTable).length > 0
            ) {
              // 스타일 오버라이드가 있으면 텍스트를 세그먼트로 분할
              node.metaData.textSegments = this._parseTextSegments(
                characters,
                styleOverrides,
                styleTable,
                (textSpec as any).style, // 기본 스타일
                (textSpec as any).fills // 기본 fills (색상)
              );
            }
          }
          break;
        }

        case "INSTANCE": {
          // INSTANCE는 보통 아이콘
          node.semanticRole = "icon";
          // 아이콘 INSTANCE인 경우, 내부 Vector들의 SVG를 합성하여 metaData에 저장
          const mergedSvg = this.specDataManager.mergeInstanceVectorSvgs(
            node.id
          );
          if (mergedSvg) {
            node.metaData.vectorSvg = mergedSvg;
          }
          // INSTANCE의 spec(absoluteBoundingBox 포함) 저장 - wrapper 크기 설정용
          const instanceSpec = this.specDataManager.getSpecById(node.id);
          if (instanceSpec) {
            node.metaData.spec = instanceSpec;
          }
          break;
        }

        case "VECTOR":
        case "LINE":
        case "STAR":
        case "ELLIPSE":
        case "POLYGON":
        case "BOOLEAN_OPERATION": {
          node.semanticRole = "vector";
          // vectorSvg 데이터가 있으면 metaData에 저장
          // 병합된 노드의 경우 각 variant별 SVG를 수집하여 다르면 vectorSvgs로 저장
          const mergedNodes = node.metaData.mergedNode as Array<{
            id: string;
            variantName?: string | null;
          }> | undefined;

          if (mergedNodes && mergedNodes.length > 1) {
            // 병합된 노드: 각 variant의 SVG 수집
            const svgByVariant: Record<string, string> = {};
            let firstSvg: string | undefined;
            let allSame = true;

            for (const merged of mergedNodes) {
              const svg = this.specDataManager.getVectorSvgByNodeId(merged.id);
              if (svg && merged.variantName) {
                svgByVariant[merged.variantName] = svg;
                if (firstSvg === undefined) {
                  firstSvg = svg;
                } else if (svg !== firstSvg) {
                  allSame = false;
                }
              }
            }

            if (Object.keys(svgByVariant).length > 0) {
              if (allSame && firstSvg) {
                // 모든 variant의 SVG가 동일하면 단일 값 저장
                node.metaData.vectorSvg = firstSvg;
              } else {
                // variant별로 다른 SVG가 있으면 map으로 저장
                node.metaData.vectorSvgs = svgByVariant;
                // 기본값으로 첫 번째 SVG도 저장 (fallback용)
                node.metaData.vectorSvg = firstSvg;
              }
            }
          } else {
            // 단일 노드: 기존 로직
            const vectorSvg = this.specDataManager.getVectorSvgByNodeId(node.id);
            if (vectorSvg) {
              node.metaData.vectorSvg = vectorSvg;
            }
          }
          break;
        }

        case "FRAME":
        case "GROUP":
        case "RECTANGLE":
          node.semanticRole = "container";
          break;

        case "IMAGE":
          node.semanticRole = "image";
          break;

        default:
          node.semanticRole = "container";
      }
    });

    return astTree;
  }

  /**
   * visible 최적화
   * @param astTree
   * @private
   */
  private updateVisible(astTree: FinalAstTree) {}

  /**
   * Props 최적화
   * 유효하지 않는 name을 가공
   * props에 state 있으면 삭제하고 바인딩된 노드를 찾아서 수정한다.
   * @param astTree
   * @private
   */
  private updateProps(astTree: FinalAstTree) {
    astTree = this._normalizePropsName(astTree);
    astTree = this._normalizePropsType(astTree);
    astTree = this._refinePropsForNativeAttr(astTree);
    astTree = this._refineStateProp(astTree);
    astTree = this._refineDisabledProp(astTree);
    astTree = this._refineComponentLikeProp(astTree);
    astTree = this._refinePropsForButton(astTree);

    return astTree;
  }

  /**
   * prop에서 native 속성과 겹치는 prop이 있으면 custom prop으로 이름이 변경된다.
   * native는 semanticRole로 판단
   * @param astTree
   * @param customPrefix - 충돌 시 사용할 prefix (기본값: "custom")
   * @private
   */
  private _refinePropsForNativeAttr(
    astTree: FinalAstTree,
    customPrefix: string = "custom"
  ) {
    const semanticRole = astTree.semanticRole;
    const props = astTree.props;
    const propKeys = Object.keys(props);

    // 충돌하는 prop 이름 찾기 및 변경
    const renameMap: Record<string, string> = {};

    for (const propKey of propKeys) {
      const isNative = this._isNativeAttribute(propKey, semanticRole);

      if (isNative) {
        // 네이티브 속성과 충돌 → custom prefix 추가
        const newPropKey = `${customPrefix}${
          propKey.charAt(0).toUpperCase() + propKey.slice(1)
        }`;

        // renameMap에 여러 버전의 이름을 모두 매핑 (대소문자 변형)
        // 1. 원본 이름 (camelCase)
        renameMap[propKey] = newPropKey;

        // 2. 대문자 시작 버전 (PascalCase) - condition에서 사용될 수 있음
        const pascalCaseName =
          propKey.charAt(0).toUpperCase() + propKey.slice(1);
        renameMap[pascalCaseName] = newPropKey;

        // 3. 소문자 버전
        renameMap[propKey.toLowerCase()] = newPropKey;

        // props 객체에서 이름 변경
        props[newPropKey] = props[propKey];
        delete props[propKey];
      }
    }

    // 이름이 변경된 prop이 있으면 전체 트리를 순회하며 참조 업데이트
    if (Object.keys(renameMap).length > 0) {
      this._updatePropReferences(astTree, renameMap);
    }

    return astTree;
  }

  /**
   * semanticRole에 해당하는 HTML 태그 이름 반환
   * @param semanticRole
   * @private
   */
  private _getHtmlTagForSemanticRole(semanticRole: SemanticRole): string {
    const tagMap: Record<SemanticRole, string> = {
      button: "button",
      text: "span",
      image: "img",
      container: "div",
      root: "div",
      vector: "svg",
      icon: "span",
    };

    return tagMap[semanticRole] || "div";
  }

  /**
   * prop 이름이 네이티브 HTML 속성인지 체크
   * @param propKey
   * @param semanticRole
   * @private
   */
  private _isNativeAttribute(
    propKey: string,
    semanticRole: SemanticRole
  ): boolean {
    // React 이벤트 핸들러 체크 (onClick, onChange 등)
    if (propKey.startsWith("on") && propKey.length > 2) {
      const thirdChar = propKey.charAt(2);
      if (thirdChar === thirdChar.toUpperCase()) {
        return true;
      }
    }

    // React 특수 속성
    const reactSpecialProps = [
      "key",
      "ref",
      "className",
      "dangerouslySetInnerHTML",
      "children",
    ];
    if (reactSpecialProps.includes(propKey)) {
      return true;
    }

    // DOM 속성 체크 (브라우저 환경에서만 가능)
    if (typeof document !== "undefined") {
      try {
        const tagName = this._getHtmlTagForSemanticRole(semanticRole);
        const element = document.createElement(tagName);

        // 속성 이름을 소문자로 변환하여 체크 (HTML 속성은 대소문자 구분 안함)
        const lowerPropKey = propKey.toLowerCase();

        // element에 해당 속성이 존재하는지 체크
        if (lowerPropKey in element) {
          return true;
        }

        // ARIA 속성 체크 (aria-*)
        if (propKey.startsWith("aria")) {
          return true;
        }

        // data 속성 체크 (data-*)
        if (propKey.startsWith("data")) {
          return true;
        }
      } catch (e) {
        // createElement 실패 시 안전하게 처리
        console.warn(`Failed to create element for tag: ${semanticRole}`, e);
      }
    }

    // 브라우저 환경이 아니거나 체크 실패 시 - 흔한 HTML 속성만 하드코딩으로 체크
    const commonNativeAttrs = [
      "id",
      "class",
      "style",
      "title",
      "hidden",
      "tabindex",
      "disabled",
      "value",
      "type",
      "name",
      "placeholder",
      "checked",
      "selected",
      "readonly",
      "required",
      "multiple",
      "accept",
      "autocomplete",
      "autofocus",
      "form",
      "href",
      "src",
      "alt",
      "width",
      "height",
    ];

    return commonNativeAttrs.includes(propKey.toLowerCase());
  }

  /**
   * 트리 전체를 순회하며 이름이 변경된 prop 참조를 업데이트
   * @param astTree
   * @param renameMap - { oldName: newName }
   * @private
   */
  private _updatePropReferences(
    astTree: FinalAstTree,
    renameMap: Record<string, string>
  ) {
    traverseBFS(astTree, (node) => {
      // 노드의 props에서 참조 업데이트
      for (const key in node.props) {
        const value = node.props[key] as any;
        // 값이 문자열이고 renameMap에 있으면 업데이트 (다른 prop을 참조하는 경우)
        if (typeof value === "string" && renameMap[value]) {
          (node.props as any)[key] = renameMap[value];
        }
      }

      // visible condition에서 prop 이름 업데이트
      if (node.visible.type === "condition") {
        this._updateConditionPropNames(node.visible.condition, renameMap);
      }

      // dynamic style에서 prop 이름 업데이트
      if (node.style.dynamic && node.style.dynamic.length > 0) {
        for (const dynamicStyle of node.style.dynamic) {
          this._updateConditionPropNames(dynamicStyle.condition, renameMap);
        }
      }
    });
  }

  /**
   * condition AST에서 prop 이름을 renameMap에 따라 업데이트
   * @param condition
   * @param renameMap
   * @private
   */
  private _updateConditionPropNames(
    condition: any,
    renameMap: Record<string, string>
  ) {
    estraverse.traverse(condition, {
      enter(node: any) {
        // MemberExpression: props.XXX 형태
        if (
          node.type === "MemberExpression" &&
          node.object?.type === "Identifier" &&
          node.object?.name === "props" &&
          node.property?.type === "Identifier"
        ) {
          const propName = node.property.name;
          if (renameMap[propName]) {
            node.property.name = renameMap[propName];
          }
        }
      },
    });
  }

  /**
   * ComponentLike 타입의 prop을 최적화한다.
   * Slot 후보 Props 찾기 → Slot 바인딩 확인 → Slot 바인딩된 노드 처리
   */
  private _refineComponentLikeProp(astTree: FinalAstTree) {
    const slotCandidateProps = this._findSlotCandidateProps(astTree);

    const allNodes = this._collectAllNodes(astTree);
    const slotBindings = this._findSlotBindings(slotCandidateProps, allNodes);
    this._convertPropsToSlots(astTree, slotBindings);

    return astTree;
  }

  private _findSlotCandidateProps(astTree: FinalAstTree): SlotCandidateProp[] {
    const props = astTree.props;
    return Object.entries(props)
      .filter(([key, value]: [string, any]) => {
        // BOOLEAN 타입 처리
        if (value.type === "BOOLEAN") {
          // VARIANT에서 변환된 BOOLEAN (True/False VARIANT)은 slot으로 변환하지 않음
          // 단, icon이 포함된 prop 이름은 slot 후보로 유지 (아이콘은 교체 패턴이 일반적)
          if (value.variantOptions) {
            // icon 관련 prop은 slot 후보로 유지
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes("icon")) {
              return !this._isOnlyStyleChangeByBoolean(astTree, key);
            }
            // 그 외 True/False VARIANT는 visibility toggle이므로 slot이 아님
            return false;
          }
          // 원본 BOOLEAN은 스타일만 변경하는 경우가 아니면 slot 후보
          return !this._isOnlyStyleChangeByBoolean(astTree, key);
        }

        // VARIANT 타입 - slot 후보로 변환하지 않음
        // VARIANT는 스타일 변경 용도(Size, Color 등)로 사용되므로 slot으로 변환하면 안됨
        if (value.type === "VARIANT") {
          return false;
        }
        return false;
      })
      .map(([key, value]: [string, any]) => ({ key, type: value.type }));
  }

  /**
   * 모든 노드 수집 (위치 정보 포함)
   */
  private _collectAllNodes(astTree: FinalAstTree): NodeInfo[] {
    const allNodes: NodeInfo[] = [];

    traverseBFS(astTree, (node) => {
      const targetSpec = this.specDataManager.getSpecById(node.id);
      const box = targetSpec?.absoluteBoundingBox;
      allNodes.push({
        node,
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        normalizedName: node.name.toLowerCase().replace(/[_\s-]+/g, ""),
      });
    });

    return allNodes;
  }

  /**
   * Slot 바인딩 찾기 (패턴 A, B, C 순차 적용)
   */
  private _findSlotBindings(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[]
  ): Map<string, SlotBinding> {
    const slotBindings = new Map<string, SlotBinding>();

    // 패턴 A: visible condition 바인딩
    this._findBindingsByVisibleCondition(
      slotCandidateProps,
      allNodes,
      slotBindings
    );

    // 패턴 B: 노드 이름 매칭 바인딩
    this._findBindingsByNameMatching(
      slotCandidateProps,
      allNodes,
      slotBindings
    );

    // 패턴 C: 위치 기반 매칭
    this._findBindingsByPosition(slotCandidateProps, allNodes, slotBindings);

    return slotBindings;
  }

  /**
   * 패턴 A: visible condition 바인딩 확인 (OR 조건 없는 단일 prop 매칭만)
   */
  private _findBindingsByVisibleCondition(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
    for (const { node } of allNodes) {
      if (node.visible.type === "condition") {
        const conditionCode = generate(node.visible.condition);

        // OR 조건이 있으면 제외 (복합 조건은 slot이 아님)
        if (conditionCode.includes("||")) {
          continue;
        }

        for (const { key: propName } of slotCandidateProps) {
          const patterns = [
            new RegExp(
              `props\\.${propName}\\s*(===|==)\\s*(true|'True'|"True")`,
              "i"
            ),
            new RegExp(
              `props\\['${propName}'\\]\\s*(===|==)\\s*(true|'True'|"True")`,
              "i"
            ),
          ];

          if (patterns.some((p) => p.test(conditionCode))) {
            if (!slotBindings.has(propName)) {
              slotBindings.set(propName, {
                propName,
                node,
                bindingType: "visible_condition",
              });
            }
            break;
          }
        }
      }
    }
  }

  /**
   * 패턴 B: 노드 이름 매칭 바인딩 확인 (아직 바인딩 안된 것만)
   */
  private _findBindingsByNameMatching(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
    for (const { node, normalizedName } of allNodes) {
      if (node.visible.type === "static") {
        for (const { key: propName } of slotCandidateProps) {
          if (slotBindings.has(propName)) continue;

          // 노드 이름이 prop 이름을 포함 (예: "lefticon" includes "lefticon")
          if (normalizedName.includes(propName.toLowerCase())) {
            slotBindings.set(propName, {
              propName,
              node,
              bindingType: "name_matching",
            });
            break;
          }
        }
      }
    }
  }

  /**
   * 패턴 C: 위치 기반 매칭 (여러 동일 이름 노드와 left/right prop 매칭)
   */
  private _findBindingsByPosition(
    slotCandidateProps: SlotCandidateProp[],
    allNodes: NodeInfo[],
    slotBindings: Map<string, SlotBinding>
  ) {
    // 아직 바인딩되지 않은 slot prop 중 left/right 키워드가 있는 것들 찾기
    const unboundProps = slotCandidateProps.filter(
      (p) => !slotBindings.has(p.key)
    );

    // left/right 위치 키워드를 포함하는 prop 쌍 찾기
    const leftProp = unboundProps.find((p) =>
      p.key.toLowerCase().includes("left")
    );
    const rightProp = unboundProps.find((p) =>
      p.key.toLowerCase().includes("right")
    );

    if (!leftProp && !rightProp) return;

    // 아직 바인딩되지 않은 노드 중 공통 키워드(icon 등)를 가진 것들 찾기
    const boundNodeIds = new Set(
      [...slotBindings.values()].map((b) => b.node.id)
    );

    // 공통 키워드 추출 (예: iconLeft, iconRight에서 "icon" 추출)
    const keyword = this._extractCommonKeyword([leftProp?.key, rightProp?.key]);

    if (!keyword) return;

    const matchingUnboundNodes = allNodes
      .filter(
        ({ node, normalizedName }) =>
          !boundNodeIds.has(node.id) && normalizedName.includes(keyword)
      )
      .sort((a, b) => a.x - b.x); // x 좌표로 정렬 (왼쪽 → 오른쪽)

    if (matchingUnboundNodes.length >= 2) {
      // 노드가 2개 이상: 첫 번째와 마지막 노드를 left/right에 매칭
      if (leftProp) {
        const leftNode = matchingUnboundNodes[0];
        slotBindings.set(leftProp.key, {
          propName: leftProp.key,
          node: leftNode.node,
          bindingType: "positional_left",
        });
      }

      if (rightProp) {
        const rightNode = matchingUnboundNodes[matchingUnboundNodes.length - 1];
        slotBindings.set(rightProp.key, {
          propName: rightProp.key,
          node: rightNode.node,
          bindingType: "positional_right",
        });
      }
    } else if (matchingUnboundNodes.length === 1) {
      // 노드가 1개: leftProp 우선, 없으면 rightProp 사용
      const singleNode = matchingUnboundNodes[0];
      const propToUse = leftProp || rightProp;
      if (propToUse) {
        slotBindings.set(propToUse.key, {
          propName: propToUse.key,
          node: singleNode.node,
          bindingType: "keyword_matching",
        });
      }
    }
    // matchingUnboundNodes.length === 0인 경우는 아무것도 하지 않음 (이미 바인딩됨)
  }

  /**
   * Slot으로 확정된 props 변환 및 노드 마킹
   */
  private _convertPropsToSlots(
    astTree: FinalAstTree,
    slotBindings: Map<string, SlotBinding>
  ) {
    const slotPropNames = new Set<string>();

    for (const [propName, binding] of slotBindings) {
      const propDef = astTree.props[propName] as any;
      if (!propDef) continue;

      slotPropNames.add(propName);

      // prop 타입을 SLOT으로 변환
      (astTree.props as any)[propName] = {
        type: "SLOT",
        defaultValue: null,
        originalType: propDef.type,
      };

      // 바인딩된 노드 처리
      const { node } = binding;

      // 루트 노드는 슬롯이 될 수 없음 (JSX 트리 전체가 사라짐)
      if (node.parent === null) {
        continue;
      }

      // visible condition 제거 (항상 보이도록)
      node.visible = { type: "static", value: true };

      // 노드를 slot 렌더링 노드로 표시
      (node as any).slotName = propName;
      (node as any).isSlot = true;

      // 부모 노드의 visible condition에서 slot prop 관련 조건 제거
      // (slot 노드 자체의 조건만 제거, 다른 노드는 boolean 비교로 변환됨)
      if (node.parent && node.parent.visible.type === "condition") {
        node.parent.visible = this._removeSlotPropsFromCondition(
          node.parent.visible.condition,
          slotPropNames
        );
      }
    }
  }

  /**
   * Condition에서 slot prop 관련 조건 제거
   * 모든 조건이 제거되면 static: true 반환
   */
  private _removeSlotPropsFromCondition(
    condition: ConditionNode,
    slotPropNames: Set<string>
  ): VisibleValue {
    const cleaned = this._removePropsFromConditionNode(
      condition,
      slotPropNames
    );

    if (!cleaned) {
      // 모든 조건이 제거된 경우
      return { type: "static", value: true };
    }

    return { type: "condition", condition: cleaned };
  }

  /**
   * ConditionNode에서 특정 prop 참조를 재귀적으로 제거
   */
  private _removePropsFromConditionNode(
    node: any,
    slotPropNames: Set<string>
  ): ConditionNode | null {
    if (!node || !node.type) return null;

    if (node.type === "BinaryExpression") {
      const operator = node.operator;

      // props.X === "value" 형태인 경우, X가 slot prop이면 null 반환 (제거)
      if (operator === "===") {
        const left = node.left;
        if (
          left?.type === "MemberExpression" &&
          left.object?.name === "props" &&
          left.property?.name
        ) {
          const propName = left.property.name;
          // 원본 이름, camelCase 변환된 이름, 소문자 변환 모두 확인
          const camelPropName = toCamelCase(propName);
          const lowerPropName = propName.toLowerCase();

          // slotPropNames의 각 항목과 비교 (대소문자 무시)
          for (const slotProp of slotPropNames) {
            if (
              slotProp === propName ||
              slotProp === camelPropName ||
              slotProp.toLowerCase() === lowerPropName ||
              toCamelCase(slotProp) === camelPropName
            ) {
              return null; // 제거
            }
          }
        }
      }

      // && 또는 || 연산자의 경우 좌우 재귀 처리
      if (operator === "&&" || operator === "||") {
        const left = this._removePropsFromConditionNode(
          node.left,
          slotPropNames
        );
        const right = this._removePropsFromConditionNode(
          node.right,
          slotPropNames
        );

        // 둘 다 null이면 전체 제거
        if (!left && !right) return null;

        // 한쪽만 null이면 다른 쪽만 반환
        if (!left) return right!;
        if (!right) return left;

        // 둘 다 있으면 연산자 유지
        return {
          ...node,
          left,
          right,
        } as ConditionNode;
      }

      // 다른 연산자는 그대로 유지
      return node as ConditionNode;
    }

    // 다른 타입의 노드는 그대로 유지
    return node as ConditionNode;
  }

  /**
   * prop 이름들에서 공통 키워드 추출
   * 예: ["iconLeft", "iconRight"] → "icon"
   */
  private _extractCommonKeyword(
    propNames: (string | undefined)[]
  ): string | null {
    const validNames = propNames.filter((n): n is string => !!n);
    if (validNames.length === 0) return null;

    // 소문자로 변환 후 공통 접두사/키워드 찾기
    const lowerNames = validNames.map((n) => n.toLowerCase());

    // 간단한 접근: 첫 번째 이름에서 위치 키워드 제거
    const firstWithoutPosition = lowerNames[0]
      .replace(/left|right|top|bottom|start|end/gi, "")
      .trim();

    if (firstWithoutPosition.length >= 2) {
      return firstWithoutPosition;
    }

    return null;
  }

  private _refineStateProp(astTree: FinalAstTree) {
    // State → pseudo-class 매핑 (null: base, undefined: unresolved)
    const STATE_TO_PSEUDO: Record<string, string | null> = {
      // base로 이동
      Default: null,
      default: null,
      // pseudo로 변환
      Hover: ":hover",
      hover: ":hover",
      Pressed: ":active",
      Active: ":active",
      active: ":active",
      Focused: ":focus",
      Focus: ":focus",
      focus: ":focus",
      Disabled: ":disabled",
      disabled: ":disabled",
      disable: ":disabled",
    };

    // State prop 이름 후보들
    const STATE_PROP_NAMES = ["state", "State", "states", "States"];

    // 1. 루트 props에서 State prop 찾기 및 처리
    let statePropName: string | null = null;
    for (const name of STATE_PROP_NAMES) {
      if (name in astTree.props) {
        statePropName = name;
        break;
      }
    }

    // State prop이 있으면 제거 (단, keep 값만 있으면 유지)
    if (statePropName) {
      const stateProp = astTree.props[statePropName] as any;
      const stateOptions =
        typeof stateProp === "object" && stateProp?.variantOptions
          ? stateProp.variantOptions
          : [];
      const hasKeepOnly =
        stateOptions.length > 0 &&
        stateOptions.every((v: string) => STATE_TO_PSEUDO[v] === "keep");

      if (!hasKeepOnly) {
        delete astTree.props[statePropName];
      }
    }

    // State 조건 패턴 (props.state, props.State, props.states 등)
    const stateConditionPattern =
      /props\.(?:state|State|states|States)\s*===\s*['"](\w+)['"]/;

    // 2. 모든 노드 순회하며 dynamic style과 visible condition 처리
    traverseBFS(astTree, (node) => {
      // 2-1. visible condition 처리
      if (node.visible.type === "condition") {
        const conditionCode = generate(node.visible.condition);

        // State 단독 조건인지 확인
        const stateOnlyMatch = conditionCode.match(
          /^props\.(?:state|State|states|States)\s*===\s*['"](\w+)['"]$/
        );

        if (stateOnlyMatch) {
          const stateValue = stateOnlyMatch[1];
          const pseudoClass = STATE_TO_PSEUDO[stateValue];

          if (pseudoClass === undefined) {
            // loading 등 CSS 변환 불가 → condition 유지 (런타임 처리 필요)
            // (이미 condition이므로 아무것도 하지 않음)
          } else {
            // Default, Hover, Pressed 등 → visible: true (항상 보임)
            // CSS나 pseudo-class로 처리할 수 없으므로 항상 보이게 변경
            node.visible = { type: "static", value: true };
          }
        } else if (conditionCode.match(stateConditionPattern)) {
          // 복합 조건에 state가 포함된 경우
          // state 부분을 제거한 새로운 조건 생성
          const newCondition = this._removeStateFromCondition(
            node.visible.condition,
            STATE_PROP_NAMES
          );

          if (newCondition) {
            node.visible = { type: "condition", condition: newCondition };
          } else {
            // 조건이 모두 제거되면 항상 보임
            node.visible = { type: "static", value: true };
          }
        }
      }

      if (!node.style.dynamic || node.style.dynamic.length === 0)
        // 2-2. dynamic style 처리
        return;

      const newDynamic: typeof node.style.dynamic = [];
      const pseudo: Record<string, Record<string, any>> = {};
      const unresolved: typeof node.style.dynamic = [];

      // 복합 조건에서 State 포함된 것들을 그룹핑 (스타일 비교용)
      const stateComplexStyles: Array<{
        condition: any;
        style: Record<string, any>;
        stateValue: string;
      }> = [];

      for (const dynamicStyle of node.style.dynamic) {
        const conditionCode = generate(dynamicStyle.condition);

        // State 단독 조건인지 확인
        const stateOnlyMatch = conditionCode.match(
          /^props\.(?:state|State|states|States)\s*===\s*['"](\w+)['"]$/
        );

        if (stateOnlyMatch) {
          const stateValue = stateOnlyMatch[1];
          const pseudoClass = STATE_TO_PSEUDO[stateValue];

          if (pseudoClass === undefined) {
            // loading 등 CSS 변환 불가 → unresolved로 이동
            unresolved.push(dynamicStyle);
          } else if (pseudoClass === null) {
            // Default → base로 이동
            node.style.base = { ...node.style.base, ...dynamicStyle.style };
          } else {
            // Hover, Pressed 등 → pseudo로 이동
            pseudo[pseudoClass] = {
              ...(pseudo[pseudoClass] || {}),
              ...dynamicStyle.style,
            };
          }
          continue;
        }

        // 복합 조건에서 State 포함 여부 확인
        const stateMatch = conditionCode.match(stateConditionPattern);

        if (stateMatch) {
          const stateValue = stateMatch[1];
          stateComplexStyles.push({
            condition: dynamicStyle.condition,
            style: dynamicStyle.style,
            stateValue,
          });
        } else {
          // State 관련 없는 조건은 그대로 유지
          newDynamic.push(dynamicStyle);
        }
      }

      // 3. 복합 조건 처리: 스타일 비교
      if (stateComplexStyles.length > 0) {
        // 모든 복합 조건의 스타일이 동일한지 확인
        const firstStyle = JSON.stringify(stateComplexStyles[0].style);
        const allSameStyle = stateComplexStyles.every(
          (s) => JSON.stringify(s.style) === firstStyle
        );

        if (allSameStyle) {
          // 모두 같은 스타일 → base로 이동
          node.style.base = {
            ...node.style.base,
            ...stateComplexStyles[0].style,
          };
        } else {
          // 다른 스타일 → State 제거 후 dynamic 유지
          for (const complexStyle of stateComplexStyles) {
            const pseudoClass = STATE_TO_PSEUDO[complexStyle.stateValue];

            if (pseudoClass === undefined) {
              // loading 등 CSS 변환 불가 → unresolved로 이동
              unresolved.push({
                condition: complexStyle.condition,
                style: complexStyle.style,
              });
            } else if (pseudoClass !== null) {
              // pseudo로 이동 (조건 제거)
              pseudo[pseudoClass] = {
                ...(pseudo[pseudoClass] || {}),
                ...complexStyle.style,
              };
            } else {
              // Default → base로
              node.style.base = { ...node.style.base, ...complexStyle.style };
            }
          }
        }
      }

      // 결과 적용
      node.style.dynamic = newDynamic;
      if (Object.keys(pseudo).length > 0) {
        node.style.pseudo = pseudo as any;
      }
      if (unresolved.length > 0) {
        node.style.unresolved = unresolved;
      }
    });

    return astTree;
  }

  /**
   * Disabled prop을 :disabled pseudo-class로 변환
   *
   * Disabled/disabled prop이 VARIANT 타입으로 True/False 값을 가질 때:
   * - props.Disabled === "True" 조건의 스타일 → :disabled pseudo-class
   * - props.Disabled === "False" 조건의 스타일 → base style
   * - Disabled prop 자체는 boolean으로 변환되어 customDisabled?: boolean
   *
   * @param astTree
   * @private
   */
  private _refineDisabledProp(astTree: FinalAstTree) {
    // Disabled prop 이름 후보들 (camelCase 변환 후의 이름 포함)
    const DISABLED_PROP_NAMES = [
      "disabled",
      "Disabled",
      "customDisabled",
      "isDisabled",
    ];

    // 1. 루트 props에서 Disabled prop 찾기
    let disabledPropName: string | null = null;
    for (const name of DISABLED_PROP_NAMES) {
      if (name in astTree.props) {
        disabledPropName = name;
        break;
      }
    }

    // Disabled prop이 없으면 리턴
    if (!disabledPropName) {
      return astTree;
    }

    // Disabled prop 값이 Boolean 타입인지 확인
    // _normalizePropsType 이후에는 type이 "BOOLEAN"으로 변환됨
    const disabledProp = astTree.props[disabledPropName] as any;
    const isBooleanType =
      typeof disabledProp === "object" && disabledProp?.type === "BOOLEAN";
    const isVariantType =
      typeof disabledProp === "object" &&
      disabledProp?.variantOptions &&
      (disabledProp.variantOptions.includes("True") ||
        disabledProp.variantOptions.includes("False"));

    // Boolean 또는 Variant 타입이 아니면 리턴
    if (!isBooleanType && !isVariantType) {
      return astTree;
    }

    // Disabled 조건 패턴 (props.disabled === "True" 또는 props.customDisabled === "True")
    const disabledConditionPattern = new RegExp(
      `props\\.(?:${DISABLED_PROP_NAMES.join("|")})\\s*===\\s*['"]True['"]`
    );
    const disabledFalseConditionPattern = new RegExp(
      `props\\.(?:${DISABLED_PROP_NAMES.join("|")})\\s*===\\s*['"]False['"]`
    );

    // 2. 모든 노드 순회하며 dynamic style 처리
    traverseBFS(astTree, (node) => {
      if (!node.style.dynamic || node.style.dynamic.length === 0) return;

      const newDynamic: typeof node.style.dynamic = [];
      const disabledStyles: Record<string, any> = {};

      for (const dynamicStyle of node.style.dynamic) {
        const conditionCode = generate(dynamicStyle.condition);

        // Disabled === "True" 조건인지 확인
        const isDisabledTrue = disabledConditionPattern.test(conditionCode);
        const isDisabledFalse = disabledFalseConditionPattern.test(conditionCode);

        // Disabled === "True" 단독 조건
        if (isDisabledTrue && !conditionCode.includes("&&")) {
          // :disabled pseudo-class로 이동
          Object.assign(disabledStyles, dynamicStyle.style);
          continue;
        }

        // Disabled === "False" 단독 조건
        if (isDisabledFalse && !conditionCode.includes("&&")) {
          // base로 이동 (default 상태)
          node.style.base = { ...node.style.base, ...dynamicStyle.style };
          continue;
        }

        // 복합 조건에서 Disabled 포함
        if (isDisabledTrue || isDisabledFalse) {
          // Disabled 조건 제거한 새 조건 생성
          const newCondition = this._removeDisabledFromCondition(
            dynamicStyle.condition,
            DISABLED_PROP_NAMES
          );

          if (isDisabledTrue) {
            // Disabled=True면 해당 스타일을 :disabled pseudo로 이동
            Object.assign(disabledStyles, dynamicStyle.style);
          } else if (newCondition) {
            // Disabled=False면 조건만 제거하고 dynamic 유지
            newDynamic.push({
              condition: newCondition,
              style: dynamicStyle.style,
            });
          } else {
            // 조건이 모두 제거되면 base로 이동
            node.style.base = { ...node.style.base, ...dynamicStyle.style };
          }
          continue;
        }

        // Disabled 조건이 아닌 경우 그대로 유지
        newDynamic.push(dynamicStyle);
      }

      // 결과 적용
      node.style.dynamic = newDynamic;
      if (Object.keys(disabledStyles).length > 0) {
        node.style.pseudo = {
          ...node.style.pseudo,
          ":disabled": {
            ...(node.style.pseudo?.[":disabled"] || {}),
            ...disabledStyles,
          },
        } as any;
      }
    });

    // 3. dynamic style에서 Disabled 스타일을 찾지 못한 경우,
    //    variant 데이터에서 직접 추출하여 TEXT 노드에 :disabled 스타일 적용
    this._applyDisabledStylesFromVariants(astTree, disabledPropName);

    // 4. Color prop이 있으면 버튼의 :disabled { color }를 제거 (텍스트 색상은 indexedConditional로 처리)
    const hasColorProp = Object.keys(astTree.props).some(
      (k) => k.toLowerCase() === "color"
    );
    if (hasColorProp && astTree.style.pseudo?.[":disabled"]?.color) {
      delete astTree.style.pseudo[":disabled"].color;
      if (Object.keys(astTree.style.pseudo[":disabled"]).length === 0) {
        delete astTree.style.pseudo[":disabled"];
      }
    }

    return astTree;
  }

  /**
   * variant 데이터에서 Disabled=True 스타일을 추출하여 적용
   * - 텍스트 색상: TEXT 노드에 동적 스타일로 적용
   * - 배경색: Color prop별로 다르므로 동적 스타일로 적용
   */
  private _applyDisabledStylesFromVariants(
    astTree: FinalAstTree,
    disabledPropName: string
  ) {
    const document = this.specDataManager.getDocument();
    if (!document?.children) return;

    // variant를 파싱하여 Color별로 그룹화
    // { Color값: { disabledTrue: variant, disabledFalse: variant } }
    const variantsByColor = new Map<
      string,
      { disabledTrue?: any; disabledFalse?: any }
    >();

    for (const child of document.children) {
      const variantName = child.name || "";

      // Color 값 추출
      const colorMatch = variantName.match(/Color\s*=\s*(\w+)/i);
      const disabledMatch = variantName.match(/Disabled\s*=\s*(\w+)/i);

      if (colorMatch && disabledMatch) {
        const colorValue = colorMatch[1];
        const disabledValue = disabledMatch[1].toLowerCase();

        if (!variantsByColor.has(colorValue)) {
          variantsByColor.set(colorValue, {});
        }

        const colorGroup = variantsByColor.get(colorValue)!;
        if (disabledValue === "true") {
          colorGroup.disabledTrue = child;
        } else if (disabledValue === "false") {
          colorGroup.disabledFalse = child;
        }
      }
    }

    // Color prop이 없는 경우 (단순 Disabled만 있는 경우)
    if (variantsByColor.size === 0) {
      // 기존 로직 사용
      this._applySimpleDisabledStyles(astTree, disabledPropName);
      return;
    }

    // 헬퍼 함수: RGB를 hex로 변환
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");

    const rgbToHex = (color: { r: number; g: number; b: number }) =>
      `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();

    // 헬퍼 함수: 노드에서 배경색 추출
    const extractBackground = (node: any): string | null => {
      if (node.fills && node.fills.length > 0) {
        const fill = node.fills[0];
        if (fill.type === "SOLID" && fill.color) {
          return rgbToHex(fill.color);
        }
      }
      return null;
    };

    // 헬퍼 함수: TEXT 노드에서 색상 추출
    const extractTextColor = (node: any): string | null => {
      if (node.type === "TEXT" && node.fills && node.fills.length > 0) {
        const fill = node.fills[0];
        if (fill.type === "SOLID" && fill.color) {
          return rgbToHex(fill.color);
        }
      }
      return null;
    };

    // Color별로 disabled 배경색 및 텍스트 색상 비교
    const disabledBackgrounds: Record<string, string> = {};
    const disabledTextColors: Record<string, string> = {};

    const traverseForText = (node: any): string | null => {
      const color = extractTextColor(node);
      if (color) return color;
      if (node.children) {
        for (const child of node.children) {
          const found = traverseForText(child);
          if (found) return found;
        }
      }
      return null;
    };

    for (const [colorValue, variants] of variantsByColor) {
      if (!variants.disabledTrue || !variants.disabledFalse) continue;

      // 배경색 비교
      const normalBg = extractBackground(variants.disabledFalse);
      const disabledBg = extractBackground(variants.disabledTrue);

      if (normalBg && disabledBg && normalBg !== disabledBg) {
        disabledBackgrounds[colorValue] = disabledBg;
      }

      // 텍스트 색상 비교 (Color별로)
      const normalTextColor = traverseForText(variants.disabledFalse);
      const disabledText = traverseForText(variants.disabledTrue);

      if (
        normalTextColor &&
        disabledText &&
        normalTextColor !== disabledText
      ) {
        disabledTextColors[colorValue] = disabledText;
      }
    }

    // Color prop 이름 찾기 (props에서)
    let colorPropName: string | null = null;
    for (const propName of Object.keys(astTree.props)) {
      if (propName.toLowerCase() === "color") {
        colorPropName = propName;
        break;
      }
    }

    // 1. 루트 노드(button)에 disabled 배경색 - indexedConditional 사용
    if (
      Object.keys(disabledBackgrounds).length > 0 &&
      colorPropName &&
      astTree.semanticRole === "button"
    ) {
      // Color별 disabled 배경색을 indexedConditional로 추가
      // 생성 코드: ${$customDisabled ? DisabledColorStyles[$color] : {}}
      const indexedStyles: Record<string, Record<string, any>> = {};
      for (const [colorValue, bgColor] of Object.entries(disabledBackgrounds)) {
        indexedStyles[colorValue] = { background: bgColor };
      }

      astTree.style.indexedConditional = {
        booleanProp: disabledPropName,
        indexProp: colorPropName,
        styles: indexedStyles,
      };
    }

    // 2. 루트 노드의 :disabled pseudo-class에서 color 제거 (텍스트 색상은 indexedConditional로 처리)
    if (colorPropName && astTree.style.pseudo?.[":disabled"]?.color) {
      delete astTree.style.pseudo[":disabled"].color;
      // :disabled가 비어있으면 삭제
      if (Object.keys(astTree.style.pseudo[":disabled"]).length === 0) {
        delete astTree.style.pseudo[":disabled"];
      }
    }

    // 3. TEXT 노드에 indexedConditional 적용 (Color별 disabled 텍스트 색상)
    // Color prop이 있으면 기존 boolean dynamic style을 제거하고 indexedConditional로 대체
    if (colorPropName) {
      // Color prop의 모든 옵션 가져오기
      const colorPropDef = astTree.props[colorPropName];
      const allColorOptions: string[] =
        (colorPropDef as any)?.variantOptions || [];

      traverseBFS(astTree, (node) => {
        if (node.type === "TEXT" && node.semanticRole === "text") {
          // 기존 customDisabled boolean dynamic style 제거
          if (node.style.dynamic) {
            node.style.dynamic = node.style.dynamic.filter((ds) => {
              const condStr = JSON.stringify(ds.condition);
              return !condStr.includes(disabledPropName);
            });
          }

          // 기존 :disabled pseudo-class 제거
          if (node.style.pseudo?.[":disabled"]) {
            delete node.style.pseudo[":disabled"];
          }

          // 모든 Color 옵션에 대해 스타일 설정 (변화 없으면 빈 객체)
          const indexedStyles: Record<string, Record<string, any>> = {};
          for (const colorValue of allColorOptions) {
            if (disabledTextColors[colorValue]) {
              indexedStyles[colorValue] = { color: disabledTextColors[colorValue] };
            } else {
              indexedStyles[colorValue] = {}; // 변화 없음 (예: Primary는 흰색 유지)
            }
          }

          // indexedConditional 설정
          if (Object.keys(indexedStyles).length > 0) {
            node.style.indexedConditional = {
              booleanProp: disabledPropName,
              indexProp: colorPropName,
              styles: indexedStyles,
            };
          }
        }
      });
    }
  }

  /**
   * Color prop이 없는 단순한 Disabled 처리
   */
  private _applySimpleDisabledStyles(
    astTree: FinalAstTree,
    disabledPropName: string
  ) {
    const document = this.specDataManager.getDocument();
    if (!document?.children) return;

    const disabledTrueVariants: any[] = [];
    const disabledFalseVariants: any[] = [];

    for (const child of document.children) {
      const variantName = child.name || "";
      const disabledMatch = variantName.match(/Disabled\s*=\s*(\w+)/i);
      if (disabledMatch) {
        const disabledValue = disabledMatch[1].toLowerCase();
        if (disabledValue === "true") {
          disabledTrueVariants.push(child);
        } else if (disabledValue === "false") {
          disabledFalseVariants.push(child);
        }
      }
    }

    if (disabledTrueVariants.length === 0 || disabledFalseVariants.length === 0)
      return;

    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");

    const extractTextColor = (node: any): string | null => {
      if (node.type === "TEXT" && node.fills && node.fills.length > 0) {
        const fill = node.fills[0];
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b } = fill.color;
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
        }
      }
      return null;
    };

    const disabledTextColors = new Set<string>();
    const normalTextColors = new Set<string>();

    const traverse = (node: any, colorSet: Set<string>) => {
      const color = extractTextColor(node);
      if (color) colorSet.add(color);
      if (node.children) {
        for (const child of node.children) {
          traverse(child, colorSet);
        }
      }
    };

    traverse(disabledTrueVariants[0], disabledTextColors);
    traverse(disabledFalseVariants[0], normalTextColors);

    const disabledOnlyColors = [...disabledTextColors].filter(
      (c) => !normalTextColors.has(c)
    );

    if (disabledOnlyColors.length > 0) {
      const disabledColor = disabledOnlyColors[0];

      if (astTree.semanticRole === "button") {
        astTree.style.pseudo = {
          ...astTree.style.pseudo,
          ":disabled": {
            ...(astTree.style.pseudo?.[":disabled"] || {}),
            color: disabledColor,
          },
        } as any;
      }

      traverseBFS(astTree, (node) => {
        if (node.type === "TEXT" && node.semanticRole === "text") {
          if (node.style.pseudo?.[":disabled"]?.color) return;

          const disabledCondition = {
            type: "BinaryExpression",
            operator: "===",
            left: {
              type: "MemberExpression",
              object: { type: "Identifier", name: "props" },
              property: { type: "Identifier", name: disabledPropName },
            },
            right: { type: "Literal", value: "True" },
          };

          node.style.dynamic = node.style.dynamic || [];
          node.style.dynamic.push({
            condition: disabledCondition as any,
            style: { color: disabledColor },
          });
        }
      });
    }
  }

  /**
   * condition에서 Disabled prop 참조를 제거
   */
  private _removeDisabledFromCondition(
    condition: any,
    disabledPropNames: string[]
  ): any | null {
    if (!condition || !condition.type) return null;

    if (condition.type === "BinaryExpression") {
      const operator = condition.operator;

      // props.disabled === "value" 형태인 경우
      if (operator === "===") {
        const left = condition.left;
        if (
          left?.type === "MemberExpression" &&
          left.object?.name === "props" &&
          left.property?.name
        ) {
          const propName = left.property.name;
          if (disabledPropNames.includes(propName)) {
            return null; // 제거
          }
        }
      }

      // && 또는 || 연산자의 경우 좌우 재귀 처리
      if (operator === "&&" || operator === "||") {
        const left = this._removeDisabledFromCondition(
          condition.left,
          disabledPropNames
        );
        const right = this._removeDisabledFromCondition(
          condition.right,
          disabledPropNames
        );

        if (!left && !right) return null;
        if (!left) return right;
        if (!right) return left;

        return { ...condition, left, right };
      }

      return condition;
    }

    return condition;
  }

  /**
   * condition에서 state prop 참조를 제거
   * @param condition
   * @param statePropNames
   * @private
   */
  private _removeStateFromCondition(
    condition: any,
    statePropNames: string[]
  ): any | null {
    if (!condition || !condition.type) return null;

    if (condition.type === "BinaryExpression") {
      const operator = condition.operator;

      // props.state === "value" 형태인 경우, state prop이면 null 반환 (제거)
      if (operator === "===") {
        const left = condition.left;
        if (
          left?.type === "MemberExpression" &&
          left.object?.name === "props" &&
          left.property?.name
        ) {
          const propName = left.property.name;
          // statePropNames 중 하나와 매칭되면 제거
          const lowerPropName = propName.toLowerCase();
          if (
            statePropNames.some((name) => name.toLowerCase() === lowerPropName)
          ) {
            return null;
          }
        }
      }

      // && 또는 || 연산자의 경우 좌우 재귀 처리
      if (operator === "&&" || operator === "||") {
        const left = this._removeStateFromCondition(
          condition.left,
          statePropNames
        );
        const right = this._removeStateFromCondition(
          condition.right,
          statePropNames
        );

        // 둘 다 null이면 전체 제거
        if (!left && !right) return null;

        // 한쪽만 null이면 다른 쪽만 반환
        if (!left) return right;
        if (!right) return left;

        // 둘 다 있으면 연산자 유지
        return {
          ...condition,
          left,
          right,
        };
      }

      // 다른 연산자는 그대로 유지
      return condition;
    }

    // 다른 타입의 노드는 그대로 유지
    return condition;
  }

  /**
   * 모든 node 순회해서 props에 해당하는 유효하지 않는 name을 카멜케이스로 바꾼다.
   * props, visible 탐색
   * @param astTree
   * @private
   */
  private _normalizePropsName(astTree: FinalAstTree) {
    const propKeys = Object.keys(astTree.props);
    const propRefs: Record<string, any[]> = Object.fromEntries(
      propKeys.map((key) => [key, []])
    );

    // 1. prop을 참조하는 노드 수집
    traverseBFS(astTree, (node) => {
      if (node.type === "COMPONENT") return;

      // props 값에서 참조 수집
      for (const key in node.props) {
        const value = node.props[key];
        // value가 문자열인 경우에만 (참조값)
        if (typeof value === "string" && propRefs[value]) {
          propRefs[value].push(node.props);
        }
      }

      // visible condition에서 참조 수집 (공백 포함 prop 이름 처리)
      if (node.visible.type === "condition") {
        const code = generate(node.visible.condition);

        // props.XXX === 'YYY' 패턴에서 XXX 추출 (공백 포함)
        // 예: "props.Left Icon === 'True'" → "Left Icon"
        const propMatches = [
          ...code.matchAll(/props\.([^=!<>\s]+(?:\s+[^=!<>\s]+)*)\s*[=!<>]/g),
        ];

        for (const match of propMatches) {
          const extractedName = match[1].trim();
          // 원본 propKeys에서 매칭되는 키 찾기
          if (propRefs[extractedName]) {
            propRefs[extractedName].push(node.visible);
          }
        }
      }
    });

    // 2. 루트 props 키를 camelCase로 변환
    for (const key of propKeys) {
      const camelKey = toCamelCase(key);
      astTree.props[camelKey] = astTree.props[key];
      if (key !== camelKey) {
        delete astTree.props[key];
      }
    }

    // 3. 수집된 참조들도 camelCase로 변환
    for (const key in propRefs) {
      for (const ref of propRefs[key]) {
        if (ref.type === "condition" && ref.condition) {
          // AST traverse로 Identifier 변환
          estraverse.traverse(ref.condition, {
            enter(node) {
              if (node.type === "Identifier") {
                node.name = toCamelCase(node.name);
              }
            },
          });

          // 추가: generate된 코드에서 공백 포함 prop 이름을 camelCase로 변환
          // MemberExpression의 computed property도 처리
          this._normalizeConditionPropNames(ref.condition, propKeys);
        } else {
          for (const k of Object.keys(ref)) {
            ref[k] = toCamelCase(ref[k]);
          }
        }
      }
    }

    return astTree;
  }

  /**
   * condition AST에서 공백이 포함된 prop 이름을 camelCase로 변환
   * @param condition
   * @param originalPropKeys
   * @private
   */
  private _normalizeConditionPropNames(
    condition: any,
    originalPropKeys: string[]
  ) {
    estraverse.traverse(condition, {
      enter(node: any) {
        // MemberExpression: props.XXX 또는 props["XXX"]
        if (node.type === "MemberExpression") {
          const obj = node.object;
          const prop = node.property;

          // props.XXX 형태 (공백 있는 이름이 여러 Identifier로 파싱된 경우는 generate에서 처리됨)
          if (
            obj?.type === "Identifier" &&
            obj?.name === "props" &&
            prop?.type === "Identifier"
          ) {
            // 원본 prop 이름 중 현재 Identifier와 매칭되는 것 찾기
            const matchedOriginal = originalPropKeys.find((key) => {
              // "Left Icon" → "Left" (첫 단어)와 매칭되는지 확인
              const firstWord = key.split(" ")[0];
              return firstWord === prop.name || key === prop.name;
            });

            if (matchedOriginal) {
              // 전체 이름을 camelCase로 변환
              prop.name = toCamelCase(matchedOriginal);
            }
          }
        }
      },
    });
  }

  /**
   * Button 전용으로 Component 유형을 둘러봐서 text 관련 노드가 있는지 확인
   * text 관련 노드가 있고
   * props에 text가 없다면
   * props에 text 넣고
   * text 관련 노드에 해당 prop을 바인딩 해야한다.
   * @param astTree
   * @private
   */
  private _refinePropsForButton(astTree: FinalAstTree) {
    if (astTree.semanticRole !== "button") return astTree;

    let isTextButton = false;
    const textLikeComponents: FinalAstTree[] = [];

    traverseBFS(astTree, (node, _meta) => {
      if (node.semanticRole === "text") {
        isTextButton = true;
        textLikeComponents.push(node);
        return;
      }
    });

    if (!isTextButton) return astTree;

    // 버튼 내부에 text 노드가 있는데, 루트 props에 text 정의가 없으면 자동으로 생성한다.
    // - type은 ReactGenerator에서 지원하는 "TEXT"로 설정
    // - defaultValue는 첫 text 노드의 characters(없으면 node.name)를 사용
    const hasTextPropAlready =
      "text" in (astTree.props as any) || "label" in (astTree.props as any);

    // 이미 text/label prop이 있으면 굳이 추가하지 않음 (기존 정의 우선)
    const propNameToUse = "text";
    if (!hasTextPropAlready) {
      const firstTextNode = textLikeComponents[0];
      const firstTextSpec = this.specDataManager.getSpecById(firstTextNode.id);

      const defaultText =
        (firstTextSpec as any)?.characters ??
        (firstTextSpec as any)?.text ??
        firstTextNode.name ??
        "";

      (astTree.props as any)[propNameToUse] = {
        type: "TEXT",
        defaultValue: defaultText,
      };
    }

    // text 노드에 text prop을 바인딩한다.
    // 이 프로젝트의 AST에서는 node.props 값이 "루트 prop key"를 문자열로 참조하는 패턴을 사용한다.
    // 따라서 TEXT 노드의 characters를 props.text로 연결한다.
    for (const textNode of textLikeComponents) {
      // 이미 characters 바인딩이 있으면 유지
      if ((textNode.props as any)?.characters) continue;
      (textNode.props as any).characters = propNameToUse;
    }

    return astTree;
  }

  /**
   * 어떤 타입인지 유추해서 노멀라이즈
   * node props를 수집
   * prop에서 type이 "VARIANT"이고
   * variantOptions에 "TRUE", "FALSE"만 있다면 Boolean Type으로 반환
   * @param astTree
   * @private
   */
  private _normalizePropsType(astTree: FinalAstTree) {
    traverseBFS(astTree, (node) => {
      // 루트 props에서 Boolean 타입 변환
      for (const [key, value] of Object.entries(node.props)) {
        if (
          typeof value === "object" &&
          value.type === "VARIANT" &&
          value.variantOptions?.length === 2
        ) {
          const options = value.variantOptions.map((o: string) =>
            o.toLowerCase()
          );
          if (options.includes("true") && options.includes("false")) {
            astTree.props[key] = {
              ...value,
              type: "BOOLEAN",
              defaultValue: ["true", "True", "TRUE"].includes(
                value.defaultValue
              ),
            };
          }
        }
      }
    });

    return astTree;
  }

  /**
   * Boolean prop의 True/False 차이가 style만 바꾸는지 확인
   * @returns true면 style만 변경 (slot candidate 아님), false면 tree 구조 변경
   */
  private _isOnlyStyleChangeByBoolean(
    astTree: FinalAstTree,
    boolPropKey: string
  ): boolean {
    // 모든 노드를 순회하면서 해당 Boolean prop이 visible에 바인딩된 노드가 있는지 확인
    const hasVisibleBinding = this._hasVisibleBindingToBoolean(
      astTree,
      boolPropKey
    );

    // visible 바인딩이 있으면 tree 변화 → false, 없으면 style만 변화 → true
    return !hasVisibleBinding;
  }

  /**
   * 특정 Boolean prop이 어떤 노드의 visible에 바인딩되어 있는지 확인
   */
  private _hasVisibleBindingToBoolean(
    node: FinalAstTree,
    boolPropKey: string
  ): boolean {
    if (node.visible.type === "condition") {
      // 케이스 1: visible.type === "condition"인 경우
      // condition AST에서 해당 prop을 참조하는지 확인
      const code = generate(node.visible.condition);
      // "props.LeftIcon" 또는 "props['Left Icon']" 패턴 확인
      if (
        node.type === "INSTANCE" &&
        this._conditionReferencesProp(code, boolPropKey)
      ) {
        return true;
      }
    }

    // 케이스 2: props.visible (직접 바인딩 - 문자열 참조)
    const propsVisible = node.props?.visible;
    if (typeof propsVisible === "string") {
      if (this._matchesBoolProp(propsVisible, boolPropKey)) {
        return true;
      }
    }

    // children 순회
    if (node.children) {
      for (const child of node.children) {
        if (this._hasVisibleBindingToBoolean(child, boolPropKey)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * condition 코드가 특정 prop을 참조하는지 확인
   */
  private _conditionReferencesProp(code: string, propKey: string): boolean {
    const normalizedPropKey = this._normalizeForComparison(propKey);

    // "props.XXX" 패턴에서 prop 이름 추출
    const propMatches = [
      ...code.matchAll(/props\.([^=!<>\s\]]+(?:\s+[^=!<>\s\]]+)*)/g),
      ...code.matchAll(/props\['([^']+)'\]/g),
      ...code.matchAll(/props\["([^"]+)"\]/g),
    ];

    for (const match of propMatches) {
      const extractedProp = match[1].trim();
      if (this._normalizeForComparison(extractedProp) === normalizedPropKey) {
        return true;
      }
    }

    return false;
  }

  /**
   * prop 참조값이 해당 Boolean prop과 매칭되는지 확인
   * "Left Icon#89:20" → "Left Icon" 추출 후 비교
   */
  private _matchesBoolProp(refValue: string, boolPropKey: string): boolean {
    const refPropName = refValue.split("#")[0];
    return (
      this._normalizeForComparison(refPropName) ===
      this._normalizeForComparison(boolPropKey)
    );
  }

  private _normalizeForComparison(str: string): string {
    return str.toLowerCase().replace(/[\s_-]+/g, "");
  }

  /**
   * 두 tree의 구조가 동일한지 비교 (노드 개수 기준)
   */
  private _isSameTreeStructure(tree1: StyleTree, tree2: StyleTree): boolean {
    const count1 = this._countNodes(tree1);
    const count2 = this._countNodes(tree2);
    return count1 === count2;
  }

  /**
   * tree의 총 노드 개수 계산
   */
  private _countNodes(tree: StyleTree): number {
    let count = 1;
    for (const child of tree.children) {
      count += this._countNodes(child);
    }
    return count;
  }

  /**
   * INSTANCE 노드를 slot 또는 externalComponent로 변환
   *
   * 루트 타입에 따른 처리:
   * - COMPONENT_SET: 내부 INSTANCE는 slot으로 처리 (커스터마이징 가능)
   * - INSTANCE/COMPONENT/FRAME: 내부 INSTANCE는 externalComponent로 처리 (인라인 렌더링)
   *
   * ArraySlot 조건 (2개 이상 반복):
   * - 같은 부모 아래에 2개 이상의 INSTANCE가 같은 컴포넌트를 참조
   * → externalComponent로 처리 (배열 렌더링에서 사용)
   *
   * isExposedInstance: true
   * → 항상 slot으로 처리 (Figma에서 명시적으로 노출된 인스턴스)
   */
  private updateExternalComponents(astTree: FinalAstTree): FinalAstTree {
    const dependencies = this.specDataManager.getDependencies();

    // dependencies가 없으면 처리할 필요 없음
    if (!dependencies || Object.keys(dependencies).length === 0) {
      return astTree;
    }

    // 루트 타입 확인: COMPONENT_SET인 경우 내부 INSTANCE를 slot으로 처리
    // astTree.id가 COMPONENT_SET의 첫 번째 variant ID일 수 있으므로
    // 원본 document의 타입도 확인
    const rootSpec = this.specDataManager.getSpecById(astTree.id);
    const originalDocument = this.specDataManager.getDocument();
    const isComponentSetRoot =
      rootSpec?.type === "COMPONENT_SET" ||
      originalDocument?.type === "COMPONENT_SET";

    // ComponentSet별 그룹핑 정보 가져오기
    const groupedDeps =
      this.specDataManager.getDependenciesGroupedByComponentSet();

    // componentId → { componentSetId, componentName } 매핑 생성
    const componentIdToInfo = new Map<
      string,
      { componentSetId: string; componentName: string }
    >();

    for (const [componentSetId, group] of Object.entries(groupedDeps)) {
      const componentName = this._normalizeComponentName(
        group.componentSetName
      );
      for (const variant of group.variants) {
        const componentId = variant.info.document.id;
        componentIdToInfo.set(componentId, { componentSetId, componentName });
      }
    }

    // ArraySlot에 속하는 INSTANCE ID 집합 수집
    const arraySlotInstanceIds = this._collectArraySlotInstanceIds(
      astTree,
      componentIdToInfo
    );

    // 생성된 slot 이름 수집 (props에 추가하기 위함)
    const collectedSlotNames = new Set<string>();

    // 트리 순회하며 INSTANCE 노드 처리
    const processNode = (node: FinalAstTree): void => {
      // 루트 노드는 처리하지 않음 (자기 자신을 컴포넌트로 렌더링하면 안 됨)
      if (node.parent === null) {
        node.children.forEach(processNode);
        return;
      }

      // 이미 slot으로 처리된 노드는 스킵 (_refineComponentLikeProp에서 처리됨)
      if ((node as any).isSlot) {
        return; // 자식 처리도 불필요 (children 이미 비워짐)
      }

      // INSTANCE 노드이고 componentId가 있는 경우
      if (node.type === "INSTANCE") {
        const spec = this.specDataManager.getSpecById(node.id);
        const componentId = (spec as any)?.componentId;

        if (componentId && componentIdToInfo.has(componentId)) {
          const info = componentIdToInfo.get(componentId)!;

          const isArraySlot = arraySlotInstanceIds.has(node.id);

          // slot으로 처리해야 하는 경우:
          // COMPONENT_SET 루트이고 ArraySlot이 아닌 INSTANCE (커스터마이징 가능)
          const shouldBeSlot = isComponentSetRoot && !isArraySlot;

          if (shouldBeSlot) {
            // slot 이름 생성 (중복 시 번호 추가)
            let baseSlotName = toCamelCase(info.componentName);
            let slotName = baseSlotName;
            let counter = 2;
            while (collectedSlotNames.has(slotName)) {
              slotName = `${baseSlotName}${counter}`;
              counter++;
            }

            (node as any).isSlot = true;
            (node as any).slotName = slotName;
            collectedSlotNames.add(slotName);

            // children 비우기 (slot으로 렌더링되므로)
            node.children = [];

            return; // 자식 처리 불필요
          }

          // externalComponent로 처리 (인라인 렌더링):
          // 1. ArraySlot에 속하는 INSTANCE (2개 이상 반복)
          // 2. INSTANCE/COMPONENT/FRAME 내부의 일반 INSTANCE - 기본 인스턴스 그대로 렌더링
          // componentProperties에서 props 추출
          const componentProperties = (spec as any)?.componentProperties || {};
          const props: Record<string, string> = {};

          for (const [key, value] of Object.entries(componentProperties)) {
            const propValue = (value as any)?.value;
            if (propValue !== undefined) {
              const propName = toCamelCase(key);
              if (!propName) continue;
              props[propName] = propValue;
            }
          }

          // INSTANCE children의 오버라이드 추출
          // dependency의 styleTree.children에서 원본 노드 정보 가져오기
          const instanceChildren = (spec as any)?.children || [];
          const variantData = dependencies[componentId];
          const variantStyleChildren = variantData?.styleTree?.children || [];
          const variantInfoChildren = variantData?.info?.document?.children || [];
          const overrideProps = this._extractOverridePropsFromStyle(
            instanceChildren,
            variantStyleChildren
          );

          // visible override된 props 추출 (원본에서 visible=false, INSTANCE에서 visible=true)
          // → dependency의 show{NodeName} props에 true 전달
          const visibleOverrideProps = this._extractVisibleOverrideProps(
            spec,
            variantInfoChildren
          );

          // externalComponent 필드 설정
          node.externalComponent = {
            componentId,
            componentSetId: info.componentSetId,
            componentName: info.componentName,
            props,
            overrideProps:
              Object.keys(overrideProps).length > 0 ? overrideProps : undefined,
            visibleOverrideProps:
              Object.keys(visibleOverrideProps).length > 0
                ? visibleOverrideProps
                : undefined,
          };

          // children 비우기 (외부 컴포넌트로 렌더링되므로)
          node.children = [];

          return; // 자식 처리 불필요
        }
      }

      // TEXT 노드를 slot으로 변환 (variant 간 TEXT가 다르거나 일부에 없는 경우)
      // - shouldBeTextSlot 플래그가 있는 TEXT만 slot으로 변환
      // - 모든 variant에서 동일한 TEXT는 하드코딩 유지
      if (isComponentSetRoot && node.type === "TEXT" && node.metaData?.shouldBeTextSlot) {
        // slot 이름 생성: TEXT 노드의 name을 camelCase로 변환
        let baseSlotName = toCamelCase(node.name) || "text";
        let slotName = baseSlotName;
        let counter = 2;
        while (collectedSlotNames.has(slotName)) {
          slotName = `${baseSlotName}${counter}`;
          counter++;
        }

        (node as any).isSlot = true;
        (node as any).slotName = slotName;
        (node as any).isTextSlot = true; // TEXT slot임을 표시
        collectedSlotNames.add(slotName);

        return; // 자식 처리 불필요
      }

      // 자식 노드 처리
      node.children.forEach(processNode);
    };

    processNode(astTree);

    // 수집된 slot 이름들을 루트 props에 추가
    for (const slotName of collectedSlotNames) {
      if (!astTree.props[slotName]) {
        astTree.props[slotName] = {
          type: "SLOT",
          defaultValue: null,
        };
      }
    }

    return astTree;
  }

  /**
   * 트리 전체에서 같은 componentSetId를 참조하는 INSTANCE가 2개 이상인 경우 수집
   * - 1개: slot으로 처리
   * - 2개 이상: externalComponent로 처리 (ArraySlot)
   */
  private _collectArraySlotInstanceIds(
    astTree: FinalAstTree,
    componentIdToInfo: Map<
      string,
      { componentSetId: string; componentName: string }
    >
  ): Set<string> {
    const arraySlotInstanceIds = new Set<string>();

    // 1단계: 트리 전체에서 componentSetId별 INSTANCE 수집
    const componentSetGroups = new Map<string, FinalAstTree[]>();

    const collectInstances = (node: FinalAstTree): void => {
      if (node.type === "INSTANCE") {
        // 이미 slot으로 처리된 INSTANCE는 ArraySlot 카운트에서 제외
        // (boolean variant에 의해 제어되는 INSTANCE 등)
        if ((node as any).isSlot) {
          return;
        }

        const spec = this.specDataManager.getSpecById(node.id);
        const componentId = (spec as any)?.componentId;

        if (componentId && componentIdToInfo.has(componentId)) {
          const info = componentIdToInfo.get(componentId)!;
          const key = info.componentSetId;

          if (!componentSetGroups.has(key)) {
            componentSetGroups.set(key, []);
          }
          componentSetGroups.get(key)!.push(node);
        }
      }

      for (const child of node.children) {
        collectInstances(child);
      }
    };

    collectInstances(astTree);

    // 2단계: 2개 이상인 그룹의 INSTANCE ID 수집
    for (const [, instances] of componentSetGroups) {
      if (instances.length >= 2) {
        for (const instance of instances) {
          arraySlotInstanceIds.add(instance.id);
        }
      }
    }

    return arraySlotInstanceIds;
  }

  /**
   * 부모-자식 간 중복 visible 조건 제거
   * 부모가 이미 같은 조건을 가지고 있으면 자식의 조건을 static: true로 변경
   */
  private removeRedundantVisibleConditions(astTree: FinalAstTree): FinalAstTree {
    const processNode = (
      node: FinalAstTree,
      ancestorConditions: string[]
    ): void => {
      // 현재 노드의 조건을 문자열로 변환
      let currentConditionStr: string | null = null;
      if (node.visible.type === "condition") {
        currentConditionStr = generate(node.visible.condition);

        // 조상 노드 중 같은 조건이 있으면 중복 → static: true로 변경
        if (ancestorConditions.includes(currentConditionStr)) {
          node.visible = { type: "static", value: true };
          currentConditionStr = null; // 조건이 제거되었으므로 자식에게 전달하지 않음
        }
      }

      // 자식 노드 처리
      const newAncestorConditions = currentConditionStr
        ? [...ancestorConditions, currentConditionStr]
        : ancestorConditions;

      for (const child of node.children) {
        processNode(child, newAncestorConditions);
      }
    };

    processNode(astTree, []);
    return astTree;
  }

  /**
   * 텍스트를 스타일별 세그먼트로 분할
   * characterStyleOverrides와 styleOverrideTable을 기반으로 연속된 같은 스타일의 글자를 그룹화
   */
  private _parseTextSegments(
    characters: string,
    styleOverrides: number[],
    styleTable: Record<string, any>,
    baseStyle: any,
    baseFills?: any[]
  ): Array<{
    text: string;
    styleIndex: number;
    style: Record<string, string> | null;
  }> {
    const segments: Array<{
      text: string;
      styleIndex: number;
      style: Record<string, string> | null;
    }> = [];

    if (characters.length === 0) return segments;

    // styleOverrides 배열이 characters보다 짧을 수 있음 (뒤쪽 글자는 기본 스타일)
    let currentStyleIndex = styleOverrides[0] ?? 0;
    let currentText = "";

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const styleIndex = styleOverrides[i] ?? 0;

      if (styleIndex === currentStyleIndex) {
        // 같은 스타일이면 텍스트 누적
        currentText += char;
      } else {
        // 스타일이 바뀌면 현재 세그먼트 저장하고 새 세그먼트 시작
        if (currentText) {
          segments.push({
            text: currentText,
            styleIndex: currentStyleIndex,
            style: this._extractOverrideStyle(
              currentStyleIndex,
              styleTable,
              baseStyle,
              baseFills
            ),
          });
        }
        currentStyleIndex = styleIndex;
        currentText = char;
      }
    }

    // 마지막 세그먼트 저장
    if (currentText) {
      segments.push({
        text: currentText,
        styleIndex: currentStyleIndex,
        style: this._extractOverrideStyle(
          currentStyleIndex,
          styleTable,
          baseStyle,
          baseFills
        ),
      });
    }

    return segments;
  }

  /**
   * styleOverrideTable에서 CSS 스타일 추출
   * styleIndex가 0이면 기본 스타일 적용 (부모 CSS 상속 방지를 위해 명시적으로 설정)
   */
  private _extractOverrideStyle(
    styleIndex: number,
    styleTable: Record<string, any>,
    baseStyle: any,
    baseFills?: any[]
  ): Record<string, string> | null {
    const cssStyle: Record<string, string> = {};

    // styleIndex가 0이면 기본 스타일 적용
    // 부모 CSS에서 오버라이드 스타일이 적용될 수 있으므로 기본 스타일을 명시적으로 설정
    if (styleIndex === 0) {
      // 기본 fills에서 색상 추출
      if (baseFills && baseFills.length > 0) {
        const fill = baseFills[0];
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b, a } = fill.color;
          const toHex = (v: number) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0");
          if (a !== undefined && a < 1) {
            cssStyle.color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
          } else {
            cssStyle.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          }
        }
      }
      // 기본 fontWeight
      if (baseStyle?.fontWeight) {
        cssStyle.fontWeight = String(baseStyle.fontWeight);
      }
      return Object.keys(cssStyle).length > 0 ? cssStyle : null;
    }

    const override = styleTable[String(styleIndex)];
    if (!override) return null;

    // fills에서 색상 추출 (가장 중요한 오버라이드)
    if (override.fills && override.fills.length > 0) {
      const fill = override.fills[0];
      if (fill.type === "SOLID" && fill.color) {
        const { r, g, b, a } = fill.color;
        const toHex = (v: number) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0");
        if (a !== undefined && a < 1) {
          cssStyle.color = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
        } else {
          cssStyle.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
      }
    }

    // fontWeight 오버라이드
    if (override.fontWeight && override.fontWeight !== baseStyle?.fontWeight) {
      cssStyle.fontWeight = String(override.fontWeight);
    }

    // fontSize 오버라이드
    if (override.fontSize && override.fontSize !== baseStyle?.fontSize) {
      cssStyle.fontSize = `${override.fontSize}px`;
    }

    // fontFamily 오버라이드
    if (override.fontFamily && override.fontFamily !== baseStyle?.fontFamily) {
      cssStyle.fontFamily = override.fontFamily;
    }

    // textDecoration 오버라이드 (underline 등)
    if (override.textDecoration) {
      cssStyle.textDecoration = override.textDecoration.toLowerCase();
    }

    // fontStyle 오버라이드 (italic 등)
    if (override.fontStyle && override.fontStyle.toLowerCase() === "italic") {
      cssStyle.fontStyle = "italic";
    }

    return Object.keys(cssStyle).length > 0 ? cssStyle : null;
  }

  /**
   * INSTANCE children에서 오버라이드된 속성(fills, characters)을 추출
   * styleTree 기반 비교 (dependency의 info.document.children이 비어있을 수 있음)
   * prop 형태로 반환: { rectangle1Bg: "#D6D6D6", aaText: "90" }
   */
  private _extractOverridePropsFromStyle(
    instanceChildren: any[],
    variantStyleChildren: any[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};

    if (!instanceChildren || instanceChildren.length === 0) {
      return overrideProps;
    }

    // variantStyleChildren을 이름으로 매핑 (ID가 아닌 이름으로 비교)
    const variantStyleMap = new Map<string, any>();
    const buildStyleMap = (children: any[]) => {
      for (const child of children) {
        // 이름을 정규화하여 키로 사용
        const normalizedName = child.name?.toLowerCase().replace(/\s+/g, "");
        if (normalizedName) {
          variantStyleMap.set(normalizedName, child);
        }
        if (child.children) {
          buildStyleMap(child.children);
        }
      }
    };
    buildStyleMap(variantStyleChildren);

    // INSTANCE children 순회하며 오버라이드 추출
    const extractFromChildren = (children: any[]) => {
      for (const child of children) {
        // 노드 이름으로 원본 스타일 찾기
        const normalizedName = child.name?.toLowerCase().replace(/\s+/g, "");
        const originalStyle = variantStyleMap.get(normalizedName);

        // 노드 이름을 prop 이름으로 변환 (camelCase)
        const baseName = toCamelCase(child.name || "");

        if (baseName) {
          // fills 오버라이드 (background color)
          if (child.fills && child.fills.length > 0) {
            const bgColor = this._extractColorFromFills(child.fills);
            if (bgColor) {
              // 원본 스타일의 background와 비교
              const originalBg = originalStyle?.cssStyle?.background;
              // 원본과 다르면 오버라이드로 추가
              if (!originalBg || !originalBg.includes(bgColor)) {
                overrideProps[`${baseName}Bg`] = bgColor;
              }
            }
          }

          // characters 오버라이드 (text)
          if (child.characters !== undefined) {
            overrideProps[`${baseName}Text`] = child.characters;
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceChildren);

    return overrideProps;
  }

  /**
   * INSTANCE children에서 오버라이드된 속성(fills, characters)을 추출
   * prop 형태로 반환: { rectangle1Bg: "#D6D6D6", aaText: "90" }
   */
  private _extractOverrideProps(
    instanceChildren: any[],
    variantChildren: any[]
  ): Record<string, string> {
    const overrideProps: Record<string, string> = {};

    if (!instanceChildren || instanceChildren.length === 0) {
      return overrideProps;
    }

    // 원본 variant children을 ID로 매핑
    const variantMap = new Map<string, any>();
    const buildVariantMap = (children: any[]) => {
      for (const child of children) {
        variantMap.set(child.id, child);
        if (child.children) {
          buildVariantMap(child.children);
        }
      }
    };
    buildVariantMap(variantChildren);

    // INSTANCE children 순회하며 오버라이드 추출
    const extractFromChildren = (children: any[]) => {
      for (const child of children) {
        const originalId = this._getOriginalIdFromInstanceId(child.id);
        const original = variantMap.get(originalId);

        if (original) {
          // 노드 이름을 prop 이름으로 변환 (camelCase)
          const baseName = toCamelCase(original.name);

          // fills 오버라이드 (background color)
          if (
            child.fills !== undefined &&
            JSON.stringify(child.fills) !== JSON.stringify(original.fills)
          ) {
            const bgColor = this._extractColorFromFills(child.fills);
            if (bgColor) {
              overrideProps[`${baseName}Bg`] = bgColor;
            }
          }

          // characters 오버라이드 (text)
          if (
            child.characters !== undefined &&
            child.characters !== original.characters
          ) {
            overrideProps[`${baseName}Text`] = child.characters;
          }
        }

        // 재귀적으로 children 처리
        if (child.children) {
          extractFromChildren(child.children);
        }
      }
    };

    extractFromChildren(instanceChildren);

    return overrideProps;
  }

  /**
   * INSTANCE child ID에서 원본 ID 추출
   * 예: I704:56;704:29;692:1613 → 692:1613
   */
  private _getOriginalIdFromInstanceId(instanceId: string): string {
    if (!instanceId.startsWith("I")) return instanceId;
    const parts = instanceId.split(";");
    return parts[parts.length - 1];
  }

  /**
   * fills 배열에서 색상 추출 (hex 형식)
   */
  private _extractColorFromFills(fills: any[]): string | null {
    if (!fills || fills.length === 0) return null;

    const fill = fills[0];
    if (fill.type !== "SOLID" || !fill.color) return null;

    const { r, g, b, a } = fill.color;
    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");

    if (a !== undefined && a < 1) {
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * INSTANCE spec에서 visible override된 props 추출
   * 원본에서 visible: false인 노드가 INSTANCE에서 visible: true로 override된 경우
   * dependency의 show{NodeName} props에 true 전달
   *
   * @param instanceSpec INSTANCE의 Figma spec (overrides 포함)
   * @param variantInfoChildren dependency의 info.document.children
   * @returns { showInteraction: true } 형태의 객체
   */
  private _extractVisibleOverrideProps(
    instanceSpec: any,
    variantInfoChildren: any[]
  ): Record<string, boolean> {
    const visibleOverrideProps: Record<string, boolean> = {};

    // overrides 배열에서 visible override 찾기
    const overrides = instanceSpec?.overrides || [];

    for (const override of overrides) {
      // overriddenFields에 'visible'이 있는지 확인
      if (!override.overriddenFields?.includes("visible")) {
        continue;
      }

      // override된 nodeId에서 원본 nodeId 추출
      const overrideNodeId = override.id;
      const originalNodeId = this._getOriginalIdFromInstanceId(overrideNodeId);

      // variantInfoChildren에서 해당 노드 찾기
      const originalNode = this._findNodeById(
        variantInfoChildren,
        originalNodeId
      );

      // 원본 노드가 visible: false인지 확인
      if (originalNode && originalNode.visible === false) {
        // INSTANCE children에서 해당 노드가 visible: true인지 확인
        const instanceChildren = instanceSpec?.children || [];
        const instanceNode = this._findNodeById(instanceChildren, overrideNodeId);

        // INSTANCE에서 visible이 명시적으로 false가 아니면 true로 간주
        // (Figma에서 visible override는 기본적으로 보이게 하는 것)
        if (!instanceNode || instanceNode.visible !== false) {
          // prop 이름 생성: show{NodeName}
          const propName = `show${this._capitalizeFirstLetter(toCamelCase(originalNode.name) || "Hidden")}`;
          visibleOverrideProps[propName] = true;
        }
      }
    }

    return visibleOverrideProps;
  }

  /**
   * children 배열에서 특정 ID의 노드를 재귀적으로 찾기
   */
  private _findNodeById(children: any[], nodeId: string): any | null {
    if (!children || children.length === 0) return null;

    for (const child of children) {
      if (child.id === nodeId) {
        return child;
      }
      if (child.children) {
        const found = this._findNodeById(child.children, nodeId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * 컴포넌트 이름 정규화 (PascalCase, 특수문자 제거)
   * 한글/비ASCII 문자가 포함된 경우 fallback 이름 생성
   */
  private _normalizeComponentName(name: string): string {
    // 먼저 영문/숫자만 추출 시도
    let normalized = name
      .replace(/[^a-zA-Z0-9\s]/g, "") // 특수문자 및 한글 제거
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");

    // 영문/숫자가 없으면 (한글만 있는 경우 등) fallback 이름 생성
    if (!normalized || normalized.length === 0) {
      // 원본 이름에서 고유한 해시 생성
      const hash = this._simpleHash(name);
      normalized = `Component${hash}`;
    }

    // 숫자로 시작하면 앞에 _ 추가
    if (/^[0-9]/.test(normalized)) {
      normalized = "_" + normalized;
    }

    return normalized;
  }

  /**
   * 간단한 해시 함수 (이름에서 고유한 숫자 생성)
   */
  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32bit 정수로 변환
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }
}

export default _FinalAstTree;
