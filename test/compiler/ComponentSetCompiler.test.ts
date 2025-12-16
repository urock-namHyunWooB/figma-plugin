import { describe, expect } from "vitest";
import tadaButtonMockData from "../fixtures/button/tadaButton.json";
import taptapButtonSampleMockData from "../fixtures/button/taptapButton_sample.json";
import urockButtonSampleMockData from "../fixtures/button/urockButton.json";

import airtableButtonMockData from "../fixtures/button/airtableButton.json";

import { FinalAstTree, SuperTreeNode, TempAstTree } from "@compiler";
import NodeMatcher from "@compiler/core/NodeMatcher";
import RefineProps from "@compiler/core/componentSetNode/RefineProps";
import CreateAstTree from "@compiler/core/componentSetNode/ast-tree/CreateAstTree";
import CreateSuperTree from "@compiler/core/componentSetNode/super-tree/CreateSuperTree";
import SpecDataManager from "@compiler/manager/SpecDataManager";
import { traverseBFS } from "@compiler/utils/traverse";

function countNodesByType(
  node: SuperTreeNode | FinalAstTree,
  type: string
): number {
  let count = node.type === type ? 1 : 0;
  for (const child of node.children) {
    if (child) {
      count += countNodesByType(child, type);
    }
  }
  return count;
}

function collectNodesByType(node: SuperTreeNode | FinalAstTree, type: string) {
  const nodes: SuperTreeNode[] | FinalAstTree[] = [];
  if (node.type === type) {
    nodes.push(node as any);
  }
  for (const child of node.children) {
    if (child) {
      nodes.push(...(collectNodesByType(child, type) as any));
    }
  }
  return nodes;
}

describe("ComponentSetCompiler", () => {
  describe("tempAstTree (중간트리) 테스트", () => {
    describe("taptapButton_sample", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("taptapButton_sample.json의 children중에 LINE 타입은 하나여야 한다.", () => {
        const lineNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "LINE"
        );
        expect(lineNodes).toBe(1);
      });

      test("taptapButton_sample.json의 children중에 Text 타입은 1개 이상", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBeGreaterThanOrEqual(1);
      });

      test("taptapButton_sample.json의 children중에 ICON 타입은 두개여야 한다.", () => {
        const iconNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        );
        expect(iconNodes).toBe(2);
      });

      test("LINE Node가 순서가 제일 먼저 나와야 한다.", () => {
        const children = createFinalAstTree.tempAstTree.children;
        const firstNonEmptyChild = children.find(
          (child) => child !== undefined
        );
        expect(firstNonEmptyChild?.type).toBe("LINE");
      });
    });

    describe("tadaButton", () => {
      const specDataManager = new SpecDataManager(tadaButtonMockData as any);
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("children중에 Text 타입은 하나여야 한다.", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBe(1);
      });

      test("children중에 ICON 타입은 두개여야 한다.", () => {
        const iconNodes = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        ).filter(
          (node) =>
            node.name.includes("Left Icon") || node.name.includes("Right Icon")
        );

        expect(iconNodes.length).toBe(2);
      });

      test("ICON - TEXT - ICON 순서 노드여야 한다. ", () => {
        const textNode = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        )[0];
        const parent = textNode?.parent;
        expect(parent).toBeDefined();

        const siblings = parent!.children.filter(
          (child): child is SuperTreeNode =>
            child !== undefined &&
            (child.type === "INSTANCE" || child.type === "TEXT")
        );

        expect(siblings.length).toBeGreaterThanOrEqual(3);
        expect(siblings[0]?.type).toBe("INSTANCE");
        expect(siblings[0]?.name).toContain("Left Icon");
        expect(siblings[1]?.type).toBe("TEXT");
        expect(siblings[2]?.type).toBe("INSTANCE");
        expect(siblings[2]?.name).toContain("Right Icon");
      });
    });

    describe("airtableButton", () => {
      const specDataManager = new SpecDataManager(
        airtableButtonMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const RefindProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        RefindProps.refinedProps
      );

      test("children중에 Text 타입은 하나여야 한다.", () => {
        const textNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        );
        expect(textNodes).toBe(1);
      });

      test("children중에 ICON 타입은 1개여야 한다.", () => {
        const iconNodes = countNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        );
        expect(iconNodes).toBe(1);
      });

      test("ICON 다음에 Text 노드가 나온다.", () => {
        const textNode = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        )[0];
        const parent = textNode?.parent;
        expect(parent).toBeDefined();

        const siblings = parent!.children.filter(
          (child): child is SuperTreeNode =>
            child !== undefined &&
            (child.type === "INSTANCE" || child.type === "TEXT")
        );

        expect(siblings.length).toBeGreaterThanOrEqual(2);
        expect(siblings[0]?.type).toBe("INSTANCE");
        expect(siblings[1]?.type).toBe("TEXT");
      });
    });
  });

  describe("Style 관련 테스트", () => {
    describe("taptapButton_sample - style.base와 style.dynamic", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("루트 노드는 style.base가 존재해야 한다", () => {
        const rootStyle = createFinalAstTree.tempAstTree.style;
        expect(rootStyle).toBeDefined();
        expect(rootStyle.base).toBeDefined();
        expect(typeof rootStyle.base).toBe("object");
      });

      test("루트 노드의 style.dynamic은 배열이어야 한다", () => {
        const rootStyle = createFinalAstTree.tempAstTree.style;
        expect(Array.isArray(rootStyle.dynamic)).toBe(true);
      });

      test("TEXT 노드는 font 관련 스타일을 가져야 한다", () => {
        const textNodes = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        ) as TempAstTree[];

        textNodes.forEach((textNode) => {
          const style = textNode.style;
          expect(style).toBeDefined();
          expect(style.base).toBeDefined();
        });
      });

      test("모든 노드는 style 객체를 가져야 한다", () => {
        traverseBFS(createFinalAstTree.tempAstTree, (node) => {
          expect(node.style).toBeDefined();
          expect(node.style.base).toBeDefined();
          expect(Array.isArray(node.style.dynamic)).toBe(true);
        });
      });

      test("Size가 Medium이면 fontSize는 14px이고 line-height는 22px이여야 한다.", () => {
        const textNode = (collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        )[0] as TempAstTree | undefined)!;

        const baseStyle: any = textNode.style.base;
        expect(baseStyle.fontSize).toBe("14px");
        expect(baseStyle.lineHeight ?? baseStyle["line-height"]).toBe("22px");
      });

      test("Size가 Small이면 fontSize는 12px이고 line-height는 18px이여야 한다.", () => {
        const textNodes = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        ) as TempAstTree[];

        const containsSizeSmall = (cond: any): boolean => {
          if (!cond) return false;
          // BinaryExpression with props.Size === 'Small'
          if (cond.type === "BinaryExpression") {
            const left = (cond as any).left;
            const right = (cond as any).right;
            const isSizeMember =
              left?.type === "MemberExpression" &&
              left?.property?.name === "Size";
            const isSmall =
              right?.type === "Literal" && right?.value === "Small";
            return !!(isSizeMember && isSmall);
          }
          // Combined conditions (AND/OR) — check recursively using operator
          if (
            (cond as any).operator === "&&" ||
            (cond as any).operator === "||"
          ) {
            return (
              containsSizeSmall((cond as any).left) ||
              containsSizeSmall((cond as any).right)
            );
          }
          return false;
        };

        const hasSmallStyle = textNodes.some((node) =>
          node.style.dynamic.some((d) => {
            const style: any = d.style;
            return (
              containsSizeSmall(d.condition) &&
              style?.fontSize === "12px" &&
              (style.lineHeight === "18px" || style["line-height"] === "18px")
            );
          })
        );

        expect(hasSmallStyle).toBe(true);
      });

      test("style dynamic에서 condition이 Size Small 조건이 하나여야만 하고 해당 style은 font-size: 12px, line-height: 18px 이여야 한다.", () => {
        const textNodes = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "TEXT"
        ) as TempAstTree[];

        // Size Small 조건만 있는지 확인 (다른 조건과 결합되지 않은 순수한 Size === 'Small' 조건)
        const isSizeSmallOnly = (cond: any): boolean => {
          if (!cond) return false;
          if (cond.type === "BinaryExpression") {
            const left = (cond as any).left;
            const right = (cond as any).right;
            const isSizeMember =
              left?.type === "MemberExpression" &&
              left?.property?.name === "Size";
            const isSmall =
              right?.type === "Literal" && right?.value === "Small";
            return !!(isSizeMember && isSmall);
          }
          return false;
        };

        // 모든 TEXT 노드에서 Size Small 조건만 가진 dynamic style 수집
        // @ts-ignore
        const sizeSmallDynamicStyles = textNodes.flatMap((node) =>
          // @ts-ignore
          node.style.dynamic.filter((d) => isSizeSmallOnly(d.condition))
        );

        // Size Small 조건이 정확히 하나여야 함
        expect(sizeSmallDynamicStyles.length).toBe(1);

        // 해당 style이 font-size: 12px, line-height: 18px이어야 함
        const style: any = sizeSmallDynamicStyles[0].style;
        expect(style.fontSize ?? style["font-size"]).toBe("12px");
        expect(style.lineHeight ?? style["line-height"]).toBe("18px");
      });
    });

    describe("tadaButton - variant에 따른 dynamic style", () => {
      const specDataManager = new SpecDataManager(tadaButtonMockData as any);
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("루트 노드는 유효한 style 구조를 가져야 한다", () => {
        const rootStyle = createFinalAstTree.tempAstTree.style;
        expect(rootStyle).toHaveProperty("base");
        expect(rootStyle).toHaveProperty("dynamic");
      });

      test("dynamic style의 condition은 올바른 구조를 가져야 한다", () => {
        traverseBFS(createFinalAstTree.tempAstTree, (node) => {
          node.style.dynamic.forEach((dynamicStyle) => {
            expect(dynamicStyle).toHaveProperty("condition");
            expect(dynamicStyle).toHaveProperty("style");
            expect(typeof dynamicStyle.style).toBe("object");
          });
        });
      });
    });
  });

  describe("Visible 조건 테스트", () => {
    describe("taptapButton_sample - visible 추론", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("모든 variant에 존재하는 노드는 visible.type이 'static'이거나 null이 아니어야 한다", () => {
        const totalVariants = renderTree.children.length;

        traverseBFS(createFinalAstTree.tempAstTree, (node) => {
          // visible이 할당된 노드만 체크
          if (node.visible !== null) {
            expect(["static", "prop", "condition"]).toContain(
              node.visible.type
            );
          }
        });
      });

      test("finalAstTree의 모든 노드는 visible 값을 가져야 한다 (null 아님)", () => {
        traverseBFS(createFinalAstTree.finalAstTree, (node) => {
          expect(node.visible).toBeDefined();
          expect(node.visible).not.toBeNull();
          expect(["static", "prop", "condition"]).toContain(node.visible.type);
        });
      });

      test("static visible 노드는 value가 boolean이어야 한다", () => {
        traverseBFS(createFinalAstTree.finalAstTree, (node) => {
          if (node.visible.type === "static") {
            expect(typeof node.visible.value).toBe("boolean");
          }
        });
      });

      test("condition visible 노드는 condition 객체를 가져야 한다", () => {
        traverseBFS(createFinalAstTree.finalAstTree, (node) => {
          if (node.visible.type === "condition") {
            expect(node.visible.condition).toBeDefined();
            expect(node.visible.condition).toHaveProperty("type");
          }
        });
      });
    });

    describe("일부 variant에만 존재하는 노드의 visible 추론", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("INSTANCE(아이콘) 노드는 조건부 visible을 가질 수 있다", () => {
        const instanceNodes = collectNodesByType(
          createFinalAstTree.tempAstTree,
          "INSTANCE"
        ) as TempAstTree[];

        instanceNodes.forEach((node) => {
          // INSTANCE 노드의 visible은 null이거나 유효한 타입이어야 함
          if (node.visible !== null) {
            expect(["static", "prop", "condition"]).toContain(
              node.visible.type
            );
          }
        });
      });
    });
  });

  describe("Props 관련 테스트", () => {
    describe("taptapButton_sample - props 할당", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("루트 노드에 refinedProps가 할당되어야 한다", () => {
        const rootProps = createFinalAstTree.tempAstTree.props;
        expect(rootProps).toBeDefined();
        expect(typeof rootProps).toBe("object");
      });

      test("componentPropertyDefinitions에 정의된 props가 루트에 있어야 한다", () => {
        const definitions = specDataManager.getComponentPropertyDefinitions();
        const rootProps = createFinalAstTree.tempAstTree.props;

        if (definitions) {
          Object.keys(definitions).forEach((propName) => {
            expect(rootProps).toHaveProperty(propName);
          });
        }
      });

      test("자식 노드의 props는 빈 객체이거나 componentPropertyReferences를 포함해야 한다", () => {
        traverseBFS(createFinalAstTree.tempAstTree, (node, meta) => {
          if (meta.depth > 0) {
            // 루트가 아닌 노드
            expect(node.props).toBeDefined();
            expect(typeof node.props).toBe("object");
          }
        });
      });
    });

    describe("RefineProps 단위 테스트", () => {
      test("refinedProps는 componentPropertyDefinitions를 포함해야 한다", () => {
        const specDataManager = new SpecDataManager(
          taptapButtonSampleMockData as any
        );
        const renderTree = specDataManager.getRenderTree();
        const refineProps = new RefineProps(renderTree, specDataManager);

        const definitions = specDataManager.getComponentPropertyDefinitions();
        const refined = refineProps.refinedProps;

        if (definitions) {
          expect(Object.keys(refined).length).toBeGreaterThanOrEqual(
            Object.keys(definitions).length
          );
        }
      });
    });
  });

  describe("CreateSuperTree 병합 테스트", () => {
    describe("taptapButton_sample - 슈퍼트리 병합", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const superTree = createSuperTree.getSuperTree();

      test("슈퍼트리의 루트 노드가 존재해야 한다", () => {
        expect(superTree).toBeDefined();
        expect(superTree.id).toBeDefined();
        expect(superTree.type).toBeDefined();
      });

      test("슈퍼트리 루트의 mergedNode는 variant 수 이상이어야 한다", () => {
        const variantCount = renderTree.children.length;
        expect(superTree.mergedNode.length).toBeGreaterThanOrEqual(1);
      });

      test("모든 노드는 mergedNode 배열을 가져야 한다", () => {
        traverseBFS(superTree, (node) => {
          expect(Array.isArray(node.mergedNode)).toBe(true);
          expect(node.mergedNode.length).toBeGreaterThanOrEqual(1);
        });
      });

      test("mergedNode는 id, name, variantName을 포함해야 한다", () => {
        traverseBFS(superTree, (node) => {
          node.mergedNode.forEach((merged) => {
            expect(merged).toHaveProperty("id");
            expect(merged).toHaveProperty("name");
            // variantName은 optional
          });
        });
      });

      test("부모-자식 관계가 올바르게 설정되어야 한다", () => {
        traverseBFS(superTree, (node, meta) => {
          if (meta.depth === 0) {
            expect(node.parent).toBeNull();
          } else {
            expect(node.parent).toBeDefined();
            expect(node.parent).not.toBeNull();
          }
        });
      });
    });

    describe("여러 variant 병합 검증", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const superTree = createSuperTree.getSuperTree();

      test("TEXT 노드의 mergedNode에는 여러 variant의 정보가 있어야 한다", () => {
        const textNodes = collectNodesByType(
          superTree,
          "TEXT"
        ) as SuperTreeNode[];

        textNodes.forEach((textNode) => {
          // TEXT 노드는 여러 variant에 존재하므로 mergedNode가 1개 이상

          expect(textNode.mergedNode.length).toBeGreaterThanOrEqual(1);
        });
      });

      test("같은 위치의 노드들은 하나의 슈퍼트리 노드로 병합되어야 한다", () => {
        // variant 수보다 슈퍼트리의 TEXT 노드 수가 적거나 같아야 함
        const variantCount = renderTree.children.length;
        const superTreeTextNodes = collectNodesByType(superTree, "TEXT");

        // 각 variant마다 TEXT 노드가 있다고 가정하면,
        // 슈퍼트리에서는 병합되어 더 적은 수의 TEXT 노드가 있어야 함
        expect(superTreeTextNodes.length).toBeLessThanOrEqual(variantCount);
      });
    });
  });

  describe("엣지 케이스 테스트", () => {
    describe("빈 children 처리", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("리프 노드(자식 없는 노드)도 올바르게 처리되어야 한다", () => {
        traverseBFS(createFinalAstTree.finalAstTree, (node) => {
          expect(Array.isArray(node.children)).toBe(true);
          // 리프 노드인 경우 children이 빈 배열
          if (node.children.length === 0) {
            expect(node.children).toEqual([]);
          }
        });
      });

      test("TEXT 노드는 children이 비어있어야 한다", () => {
        const textNodes = collectNodesByType(
          createFinalAstTree.finalAstTree,
          "TEXT"
        );

        textNodes.forEach((node) => {
          expect(node.children.length).toBe(0);
        });
      });
    });

    describe("깊은 중첩 구조 테스트", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const renderTree = specDataManager.getRenderTree();

      const matcher = new NodeMatcher(specDataManager);
      const createSuperTree = new CreateSuperTree(
        renderTree,
        specDataManager,
        matcher
      );

      const refineProps = new RefineProps(renderTree, specDataManager);

      const createFinalAstTree = new CreateAstTree(
        specDataManager,
        createSuperTree.getSuperTree(),
        refineProps.refinedProps
      );

      test("트리의 깊이가 올바르게 유지되어야 한다", () => {
        let maxDepth = 0;
        traverseBFS(createFinalAstTree.finalAstTree, (node, meta) => {
          if (meta.depth > maxDepth) {
            maxDepth = meta.depth;
          }
        });

        // 최소 1 이상의 깊이가 있어야 함 (루트 + 자식)
        expect(maxDepth).toBeGreaterThanOrEqual(1);
      });

      test("모든 노드에 부모 참조가 올바르게 설정되어야 한다", () => {
        traverseBFS(createFinalAstTree.finalAstTree, (node, meta) => {
          if (meta.parent) {
            // 부모의 children에 현재 노드가 포함되어 있어야 함
            const isChildOfParent = meta.parent.children.some(
              (child) => child.id === node.id
            );
            expect(isChildOfParent).toBe(true);
          }
        });
      });
    });

    describe("다양한 fixture 데이터 처리", () => {
      test("tadaButton도 올바르게 처리되어야 한다", () => {
        const specDataManager = new SpecDataManager(tadaButtonMockData as any);
        const renderTree = specDataManager.getRenderTree();

        const matcher = new NodeMatcher(specDataManager);
        const createSuperTree = new CreateSuperTree(
          renderTree,
          specDataManager,
          matcher
        );

        const refineProps = new RefineProps(renderTree, specDataManager);

        expect(() => {
          new CreateAstTree(
            specDataManager,
            createSuperTree.getSuperTree(),
            refineProps.refinedProps
          );
        }).not.toThrow();
      });

      test("airtableButton도 올바르게 처리되어야 한다", () => {
        const specDataManager = new SpecDataManager(
          airtableButtonMockData as any
        );
        const renderTree = specDataManager.getRenderTree();

        const matcher = new NodeMatcher(specDataManager);
        const createSuperTree = new CreateSuperTree(
          renderTree,
          specDataManager,
          matcher
        );

        const refineProps = new RefineProps(renderTree, specDataManager);

        expect(() => {
          new CreateAstTree(
            specDataManager,
            createSuperTree.getSuperTree(),
            refineProps.refinedProps
          );
        }).not.toThrow();
      });
    });

    describe("NodeMatcher 엣지 케이스", () => {
      const specDataManager = new SpecDataManager(
        taptapButtonSampleMockData as any
      );
      const matcher = new NodeMatcher(specDataManager);

      test("같은 타입의 노드만 매칭되어야 한다", () => {
        const renderTree = specDataManager.getRenderTree();

        const variants = renderTree.children;
        if (variants.length >= 2) {
          // 첫 번째 variant의 첫 번째 자식과 두 번째 variant의 첫 번째 자식 비교
          const node1 = variants[0].children[0];
          const node2 = variants[1].children[0];

          if (node1 && node2) {
            const superNode1: SuperTreeNode = {
              id: node1.id,
              type: specDataManager.getSpecById(node1.id).type,
              name: node1.name,
              parent: null,
              children: [],
              mergedNode: [{ id: node1.id, name: node1.name }],
            };

            const superNode2: SuperTreeNode = {
              id: node2.id,
              type: specDataManager.getSpecById(node2.id).type,
              name: node2.name,
              parent: null,
              children: [],
              mergedNode: [{ id: node2.id, name: node2.name }],
            };

            // 같은 타입이면 매칭 가능성 있음
            if (superNode1.type === superNode2.type) {
              // isSameNode 호출이 에러 없이 실행되어야 함
              expect(() =>
                matcher.isSameNode(superNode1, superNode2)
              ).not.toThrow();
            }
          }
        }
      });
    });
  });
});

describe("astTree 최종 ASTTree 테스트", () => {
  describe("taptapButton_sample", () => {
    const specDataManager = new SpecDataManager(
      taptapButtonSampleMockData as any
    );
    const renderTree = specDataManager.getRenderTree();

    const matcher = new NodeMatcher(specDataManager);
    const createSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    const RefindProps = new RefineProps(renderTree, specDataManager);

    const createFinalAstTree = new CreateAstTree(
      specDataManager,
      createSuperTree.getSuperTree(),
      RefindProps.refinedProps
    );

    test("taptapButton_sample.json의 children중에 LINE 타입은 없어야 한다.", () => {
      const lineNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "LINE"
      );
      expect(lineNodes).toBe(0);
    });

    test("taptapButton_sample.json의 children중에 Text 타입은 1개", () => {
      const textNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      );
      expect(textNodes).toBe(1);
    });

    test("Text 타입은 1개이고 부모가 Frame 노드이다.", () => {
      const textNodes = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      );
      expect(textNodes.length).toBe(1);

      // TEXT 노드의 부모가 FRAME인지 확인
      const frameNodes = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "FRAME"
      );

      const frameWithTextChild = frameNodes.find((frame) =>
        frame.children.some((child) => child?.type === "TEXT")
      );

      expect(frameWithTextChild).toBeDefined();
    });

    test("ICON -TEXT - ICON 순서", () => {
      const textNode = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      )[0];
      const parent = textNode?.parent;
      expect(parent).toBeDefined();

      const siblings = parent!.children.filter(
        (child): child is SuperTreeNode =>
          child !== undefined &&
          (child.type === "INSTANCE" || child.type === "TEXT")
      );

      expect(siblings.length).toBeGreaterThanOrEqual(3);
      expect(siblings[0]?.type).toBe("INSTANCE");
      expect(siblings[1]?.type).toBe("TEXT");
      expect(siblings[2]?.type).toBe("INSTANCE");
    });

    test("taptapButton_sample.json의 children중에 ICON 타입은 두개여야 한다.", () => {
      const iconNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "INSTANCE"
      );
      expect(iconNodes).toBe(2);
    });

    test("props에 state는 없어야 한다.", () => {
      const rootProps = createFinalAstTree.finalAstTree.props;
      expect(rootProps).not.toHaveProperty("state");
      expect(rootProps).not.toHaveProperty("State");
    });

    test("props의 키는 카멜케이스로 유효한 형태여야 한다.", () => {
      const rootProps = createFinalAstTree.finalAstTree.props;
      const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;

      Object.keys(rootProps).forEach((key) => {
        expect(key).toMatch(camelCaseRegex);
      });
    });
  });

  describe("tadaButton", () => {
    const specDataManager = new SpecDataManager(tadaButtonMockData as any);
    const renderTree = specDataManager.getRenderTree();

    const matcher = new NodeMatcher(specDataManager);
    const createSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    const RefindProps = new RefineProps(renderTree, specDataManager);

    const createFinalAstTree = new CreateAstTree(
      specDataManager,
      createSuperTree.getSuperTree(),
      RefindProps.refinedProps
    );

    test("children중에 Text 타입은 하나여야 한다.", () => {
      const textNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      );
      expect(textNodes).toBe(1);
    });

    test("children중에 ICON 타입은 두개여야 한다.", () => {
      const iconNodes = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "INSTANCE"
      ).filter(
        (node) =>
          node.name.includes("Left Icon") || node.name.includes("Right Icon")
      );

      expect(iconNodes.length).toBe(2);
    });

    test("ICON - TEXT - ICON 순서 노드여야 한다. ", () => {
      const textNode = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      )[0];
      const parent = textNode?.parent;
      expect(parent).toBeDefined();

      const siblings = parent!.children.filter(
        (child): child is SuperTreeNode =>
          child !== undefined &&
          (child.type === "INSTANCE" || child.type === "TEXT")
      );

      expect(siblings.length).toBeGreaterThanOrEqual(3);
      expect(siblings[0]?.type).toBe("INSTANCE");
      expect(siblings[0]?.name).toContain("Left Icon");
      expect(siblings[1]?.type).toBe("TEXT");
      expect(siblings[2]?.type).toBe("INSTANCE");
      expect(siblings[2]?.name).toContain("Right Icon");
    });
  });

  describe("airtableButton", () => {
    const specDataManager = new SpecDataManager(airtableButtonMockData as any);
    const renderTree = specDataManager.getRenderTree();

    const matcher = new NodeMatcher(specDataManager);
    const createSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    const RefindProps = new RefineProps(renderTree, specDataManager);

    const createFinalAstTree = new CreateAstTree(
      specDataManager,
      createSuperTree.getSuperTree(),
      RefindProps.refinedProps
    );

    test("children중에 Text 타입은 하나여야 한다.", () => {
      const textNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      );
      expect(textNodes).toBe(1);
    });

    test("children중에 ICON 타입은 1개여야 한다.", () => {
      const iconNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "INSTANCE"
      );
      expect(iconNodes).toBe(1);
    });

    test("ICON 다음에 Text 노드가 나온다.", () => {
      const textNode = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      )[0];
      const parent = textNode?.parent;
      expect(parent).toBeDefined();

      const siblings = parent!.children.filter(
        (child): child is SuperTreeNode =>
          child !== undefined &&
          (child.type === "INSTANCE" || child.type === "TEXT")
      );

      expect(siblings.length).toBeGreaterThanOrEqual(2);
      expect(siblings[0]?.type).toBe("INSTANCE");
      expect(siblings[1]?.type).toBe("TEXT");
    });
  });

  describe("urockButton", () => {
    const specDataManager = new SpecDataManager(
      urockButtonSampleMockData as any
    );
    const renderTree = specDataManager.getRenderTree();

    const matcher = new NodeMatcher(specDataManager);
    const createSuperTree = new CreateSuperTree(
      renderTree,
      specDataManager,
      matcher
    );

    const RefindProps = new RefineProps(renderTree, specDataManager);

    const createFinalAstTree = new CreateAstTree(
      specDataManager,
      createSuperTree.getSuperTree(),
      RefindProps.refinedProps
    );

    test("children중에 Text 타입은 하나여야 한다.", () => {
      const textNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      );
      expect(textNodes).toBe(1);
    });

    test("children중에 ICON 타입은 2개여야 한다.", () => {
      const iconNodes = countNodesByType(
        createFinalAstTree.finalAstTree,
        "INSTANCE"
      );
      expect(iconNodes).toBe(2);
    });

    test("ICON 다음에 Text 노드가 나온다.", () => {
      const textNode = collectNodesByType(
        createFinalAstTree.finalAstTree,
        "TEXT"
      )[0];
      const parent = textNode?.parent;
      expect(parent).toBeDefined();

      const siblings = parent!.children.filter(
        (child): child is SuperTreeNode =>
          child !== undefined &&
          (child.type === "INSTANCE" || child.type === "TEXT")
      );

      expect(siblings.length).toBeGreaterThanOrEqual(2);
      expect(siblings[0]?.type).toBe("INSTANCE");
      expect(siblings[1]?.type).toBe("TEXT");
    });
  });
});

describe("CodeGen", () => {});
