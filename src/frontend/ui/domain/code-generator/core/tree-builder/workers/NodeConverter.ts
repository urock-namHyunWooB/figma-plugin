/**
 * NodeConverter
 *
 * InternalNode → DesignNode 변환
 *
 * 미리 계산된 Map들(nodeTypes, nodeStyles, nodePropBindings 등)을 사용하여
 * 최종 DesignNode 트리를 조립합니다.
 */

import type { BuildContext } from "./interfaces";
import type { DesignNode, TextSegment, StyleDefinition } from "@code-generator/types/architecture";
import { mapTree } from "./utils/treeUtils";

/**
 * 스타일이 비어있지 않은지 확인
 */
function hasNonEmptyStyles(styles: StyleDefinition): boolean {
  return (
    Object.keys(styles.base || {}).length > 0 ||
    (styles.dynamic || []).length > 0
  );
}

// ============================================================================
// NodeConverter Class
// ============================================================================

export class NodeConverter {
  /**
   * 이미 계산된 Map들을 사용해서 최종 DesignNode 트리를 조립
   *
   * 필요한 ctx 필드:
   * - nodeTypes, nodeStyles, nodePropBindings, nodeExternalRefs, semanticRoles
   */
  static assemble(ctx: BuildContext): BuildContext {
    if (!ctx.internalTree) {
      throw new Error("NodeConverter.assemble: internalTree is required.");
    }
    if (!ctx.nodeTypes) {
      throw new Error("NodeConverter.assemble: nodeTypes is required.");
    }
    if (!ctx.nodeStyles) {
      throw new Error("NodeConverter.assemble: nodeStyles is required.");
    }

    const root = mapTree<DesignNode>(ctx.internalTree, (internal, children) => {
      // 미리 계산된 값들 조회
      const nodeType = ctx.nodeTypes!.get(internal.id) ?? "container";
      const styles = ctx.nodeStyles!.get(internal.id) ?? { base: {}, dynamic: [] };
      const propBindings = ctx.nodePropBindings?.get(internal.id);
      const externalRefData = ctx.nodeExternalRefs?.get(internal.id);
      const semanticResult = ctx.semanticRoles?.get(internal.id);
      const semanticTypeEntry = ctx.nodeSemanticTypes?.get(internal.id);

      // 외부 참조 변환
      const externalRef = externalRefData
        ? {
            componentSetId: externalRefData.componentSetId,
            componentName: externalRefData.componentName,
            props: externalRefData.props,
          }
        : undefined;

      // TEXT 노드의 텍스트 내용 추출 및 textSegments 파싱
      let textContent: string | undefined;
      let textSegments: TextSegment[] | undefined;
      let finalStyles = styles;
      if (internal.type === "TEXT") {
        const nodeSpec = ctx.data.getNodeById(internal.id) as any;
        if (nodeSpec && "characters" in nodeSpec) {
          textContent = nodeSpec.characters;
          // 줄바꿈이 포함된 텍스트에 white-space: pre-line 추가
          if (textContent && textContent.includes("\n")) {
            finalStyles = {
              ...styles,
              base: {
                ...styles.base,
                whiteSpace: "pre-line",
              },
            };
          }

          // characterStyleOverrides 파싱
          if (
            nodeSpec.characterStyleOverrides &&
            nodeSpec.characterStyleOverrides.length > 0 &&
            nodeSpec.styleOverrideTable
          ) {
            textSegments = NodeConverter.parseTextSegments(
              textContent,
              nodeSpec.characterStyleOverrides,
              nodeSpec.styleOverrideTable,
              nodeSpec.style,
              nodeSpec.fills
            );
          }
        }
      }

      // 외부 컴포넌트: wrapper 컨테이너 노드로 감싸기
      if (externalRefData && hasNonEmptyStyles(styles)) {
        const externalNode: DesignNode = {
          id: internal.id,
          type: "component",
          name: internal.name,
          styles: { base: {}, dynamic: [] },
          children: [],
          externalRef,
          conditions: internal.conditions,
        };

        // wrapper 컨테이너가 스타일과 children을 담당
        return {
          id: `wrapper:${internal.id}`,
          type: "container",
          name: `${internal.name}_wrapper`,
          styles: finalStyles,
          children: [externalNode, ...children],
          propBindings: propBindings && Object.keys(propBindings).length > 0 ? propBindings : undefined,
          semanticRole: semanticResult?.role,
          conditions: internal.conditions,
        };
      }

      return {
        id: internal.id,
        type: nodeType,
        name: internal.name,
        styles: finalStyles,
        children,
        propBindings: propBindings && Object.keys(propBindings).length > 0 ? propBindings : undefined,
        externalRef,
        semanticRole: semanticResult?.role,
        semanticType: semanticTypeEntry?.type,
        placeholder: semanticTypeEntry?.placeholder,
        vectorSvg: semanticResult?.vectorSvg,
        variantSvgs: semanticResult?.variantSvgs,
        textContent,
        textSegments,
        conditions: internal.conditions,
      };
    });

    return { ...ctx, root };
  }

  /**
   * characterStyleOverrides를 파싱하여 TextSegment 배열 생성
   */
  static parseTextSegments(
    characters: string,
    styleOverrides: number[],
    styleTable: Record<string, any>,
    baseStyle: any,
    baseFills?: any[]
  ): TextSegment[] {
    const segments: TextSegment[] = [];

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
            style: NodeConverter.extractOverrideStyle(
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
        style: NodeConverter.extractOverrideStyle(
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
  static extractOverrideStyle(
    styleIndex: number,
    styleTable: Record<string, any>,
    baseStyle: any,
    baseFills?: any[]
  ): Record<string, string> | null {
    const cssStyle: Record<string, string> = {};

    const toHex = (v: number) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0");

    // styleIndex가 0이면 기본 스타일 적용
    if (styleIndex === 0) {
      // 기본 fills에서 색상 추출
      if (baseFills && baseFills.length > 0) {
        const fill = baseFills[0];
        if (fill.type === "SOLID" && fill.color) {
          const { r, g, b, a } = fill.color;
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
}

export default NodeConverter;
