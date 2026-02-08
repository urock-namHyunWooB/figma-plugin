/**
 * InputHeuristic
 *
 * Input 컴포넌트의 판별과 세부 패턴 감지를 담당합니다.
 *
 * 판별 기준 (canProcess):
 * - 이름 패턴: input, textfield, searchbar 등
 * - Caret 패턴: "|" 문자 또는 얇은 세로 막대
 *
 * 감지 항목 (process):
 * - Placeholder 텍스트 (회색 텍스트 → 실제 값 텍스트 패턴)
 * - Clear 버튼 (향후)
 * - Prefix/Suffix 아이콘 (향후)
 *
 * 처리 결과:
 * - nodeSemanticTypes에 semanticType 설정 (textInput 등)
 * - excludePropsFromStyles에 제외할 prop 추가
 */

import type { PreparedDesignData } from "@code-generator/types/architecture";
import type { BuildContext, SemanticTypeEntry } from "../../workers/BuildContext";
import type { InternalNode } from "../../workers/interfaces/core";
import type { IComponentHeuristic } from "./IComponentHeuristic";
import { traverseTree } from "../../workers/utils/treeUtils";
import { toCamelCase } from "../../workers/utils/stringUtils";

/**
 * Input 컴포넌트 이름 패턴
 */
const INPUT_NAME_PATTERNS: RegExp[] = [
  /input/i,
  /textfield/i,
  /text.?field/i,
  /text.?input/i,
  /search.?bar/i,
  /search.?field/i,
];

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface VariantColorInfo {
  variantName: string;
  color: RGB | null;
  characters: string;
}

/** 내부용 placeholder 감지 결과 */
interface PlaceholderDetectionResult {
  nodeId: string;
  placeholderText: string;
  linkedPropName: string;
}

export class InputHeuristic implements IComponentHeuristic {
  readonly componentType = "input" as const;
  readonly name = "InputHeuristic";

  /**
   * Placeholder 관련 키워드
   * 이 키워드를 포함하는 prop 이름만 placeholder로 인식
   */
  private static readonly PLACEHOLDER_KEYWORDS = [
    "guide",
    "placeholder",
    "hint",
    "helper",
  ];

  // ===========================================================================
  // canProcess - Input 컴포넌트 판별
  // ===========================================================================

  /**
   * Input 컴포넌트인지 판별
   *
   * 판별 기준:
   * 1. 이름 패턴 (input, textfield 등)
   * 2. Caret 패턴 ("|" 문자 또는 얇은 세로 막대)
   */
  canProcess(ctx: BuildContext): boolean {
    const name = ctx.data.document.name;

    // 1. 이름 패턴 매칭
    if (this.matchesNamePattern(name)) {
      return true;
    }

    // 2. Caret 패턴 감지
    if (this.hasCaretPattern(ctx)) {
      return true;
    }

    return false;
  }

  /**
   * 이름이 Input 패턴과 매칭되는지 확인
   */
  private matchesNamePattern(name: string): boolean {
    return INPUT_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }

  /**
   * Caret(커서) 패턴 감지
   *
   * Input 컴포넌트의 디자인 특성:
   * - TEXT 노드에 "|" 문자만 있음 (커서 표현)
   * - 또는 얇은 세로 RECTANGLE (width 1-3px, height가 더 큼)
   */
  private hasCaretPattern(ctx: BuildContext): boolean {
    if (!ctx.internalTree) return false;

    let found = false;

    traverseTree(ctx.internalTree, (node) => {
      if (found) return;

      // 1. TEXT 노드에 "|" 문자만 있는 경우
      if (node.type === "TEXT") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const characters = spec?.characters?.trim();
        if (characters === "|") {
          found = true;
          return;
        }
      }

      // 2. 얇은 세로 RECTANGLE (Caret 막대)
      if (node.type === "RECTANGLE" || node.type === "LINE") {
        const spec = ctx.data.getNodeById(node.id) as any;
        const width = spec?.absoluteBoundingBox?.width ?? spec?.size?.x ?? 0;
        const height = spec?.absoluteBoundingBox?.height ?? spec?.size?.y ?? 0;

        // 폭이 1-3px이고, 높이가 폭의 5배 이상이면 Caret
        if (width > 0 && width <= 3 && height >= width * 5) {
          found = true;
          return;
        }
      }
    });

    return found;
  }

  // ===========================================================================
  // process - Input 컴포넌트 처리
  // ===========================================================================

  process(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) return ctx;

    const nodeSemanticTypes = new Map<string, SemanticTypeEntry>(ctx.nodeSemanticTypes);
    const excludePropsFromStyles = new Set<string>(ctx.excludePropsFromStyles);

    traverseTree(ctx.internalTree, (node) => {
      if (node.type !== "TEXT") return;

      const result = this.detectPlaceholder(node, ctx);
      if (result) {
        // 노드에 semanticType 설정
        nodeSemanticTypes.set(result.nodeId, {
          type: "textInput",
          placeholder: result.placeholderText,
        });

        // placeholder 관련 prop은 스타일 조건에서 제외
        if (result.linkedPropName) {
          excludePropsFromStyles.add(result.linkedPropName);
        }
      }
    });

    return {
      ...ctx,
      nodeSemanticTypes,
      excludePropsFromStyles,
    };
  }

  /**
   * TEXT 노드에서 placeholder 패턴 감지
   */
  private detectPlaceholder(
    node: InternalNode,
    ctx: BuildContext
  ): PlaceholderDetectionResult | null {
    // mergedNode가 2개 이상이어야 variant 비교 가능
    if (node.mergedNode.length < 2) return null;

    // 1. mergedNode에서 variant별 색상/텍스트 수집
    const variantInfos = this.collectVariantInfos(node, ctx.data);

    // 2. 회색 variant 찾기
    const grayVariant = variantInfos.find(
      (v) => v.color && this.isGrayColor(v.color)
    );
    if (!grayVariant) return null;

    // 3. 다른 variant에서 검정색인지 확인 (placeholder가 아닌 실제 값)
    const blackVariant = variantInfos.find(
      (v) =>
        v.variantName !== grayVariant.variantName &&
        v.color &&
        this.isBlackColor(v.color)
    );
    if (!blackVariant) return null;

    // 4. 연관된 variant prop 찾기 (variantName에서 추출)
    const linkedPropName = this.findLinkedProp(grayVariant.variantName);

    // 5. linkedPropName이 placeholder 관련 키워드를 포함하는지 확인
    // 이 조건이 없으면 disabled 상태의 회색 텍스트도 placeholder로 인식됨
    if (!this.isPlaceholderRelatedProp(linkedPropName)) {
      return null;
    }

    return {
      nodeId: node.id,
      placeholderText: grayVariant.characters,
      linkedPropName,
    };
  }

  /**
   * prop 이름이 placeholder 관련 키워드를 포함하는지 확인
   */
  private isPlaceholderRelatedProp(propName: string): boolean {
    if (!propName) return false;
    const lowerPropName = propName.toLowerCase();
    return InputHeuristic.PLACEHOLDER_KEYWORDS.some((keyword) =>
      lowerPropName.includes(keyword)
    );
  }

  /**
   * mergedNode에서 각 variant의 색상과 텍스트 정보 수집
   */
  private collectVariantInfos(
    node: InternalNode,
    data: PreparedDesignData
  ): VariantColorInfo[] {
    return node.mergedNode.map((merged) => {
      const spec = data.getNodeById(merged.id);
      const fills = (spec as any)?.fills;
      const characters = (spec as any)?.characters || "";

      let color: RGB | null = null;
      if (fills && fills[0]?.type === "SOLID" && fills[0]?.color) {
        color = fills[0].color;
      }

      return {
        variantName: merged.variantName || "",
        color,
        characters,
      };
    });
  }

  /**
   * variantName에서 연관된 prop 이름 추출
   *
   * "State=Normal, Guide Text=True" -> "guideText" (True인 prop)
   */
  private findLinkedProp(variantName: string): string {
    // variantName 파싱: "State=Normal, Guide Text=True"
    const pairs = variantName.split(",").map((s) => s.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      // True 값을 가진 prop이 placeholder를 제어하는 prop
      if (value === "True" || value === "true") {
        // "Guide Text" -> "guideText"
        return toCamelCase(key);
      }
    }

    return "";
  }

  /**
   * 색상이 회색인지 판단
   *
   * 조건:
   * - R, G, B 값이 거의 같음 (monochrome)
   * - 밝기가 중간 톤 (0.4 ~ 0.7)
   */
  private isGrayColor(color: RGB): boolean {
    const isMonochrome =
      Math.abs(color.r - color.g) < 0.05 && Math.abs(color.g - color.b) < 0.05;
    const isMidTone = color.r > 0.4 && color.r < 0.7;
    return isMonochrome && isMidTone;
  }

  /**
   * 색상이 검정색인지 판단
   *
   * 조건: R, G, B 모두 0.1 이하
   */
  private isBlackColor(color: RGB): boolean {
    return color.r < 0.1 && color.g < 0.1 && color.b < 0.1;
  }
}
