// test/audits/pairAssertions/assertions.ts

export interface PairAssertion {
  /** 원본 variant의 노드 ID (mergedNodes에서 찾을 ID) */
  nodeA: string;
  /** 원본 variant의 노드 ID */
  nodeB: string;
  /** true: 같은 InternalNode에 합쳐져야 함, false: 다른 InternalNode여야 함 */
  shouldMatch: boolean;
  /** 사람이 읽는 설명 (실패 시 출력) */
  description: string;
}

export interface FixtureAssertions {
  fixture: string;
  pairs: PairAssertion[];
}

export const pairAssertions: FixtureAssertions[] = [
  {
    fixture: "any/Controlcheckbox",
    pairs: [
      {
        nodeA: "16215:34466", // Icon/Normal/Check (State=Checked variant)
        nodeB: "16215:34471", // Icon/Normal/Line Horizontal (State=Indeterminate variant)
        shouldMatch: true,
        description:
          "같은 아이콘 슬롯 — State에 따라 다른 아이콘이 교체되는 정상 패턴",
      },
    ],
  },
  {
    fixture: "any-component-set/airtable-button",
    pairs: [
      {
        nodeA: "15:45", // Label (primary/default variant)
        nodeB: "15:68", // Secondary (secondary variant)
        shouldMatch: true,
        description:
          "같은 텍스트 요소 — 디자이너가 variant별로 이름만 다르게 붙인 legit rename",
      },
    ],
  },
  {
    fixture: "failing/Buttonsolid",
    pairs: [
      {
        nodeA: "16215:37604", // Wrapper (Primary/Large/IconOnly=False/Disable=False)
        nodeB: "16215:37749", // Wrapper (Assistive/Large/IconOnly=True/Disable=False — 이상 variant)
        shouldMatch: true,
        description: "같은 Wrapper 컨테이너 — 이상 variant에서도 Wrapper는 Wrapper끼리 매칭돼야 함",
      },
      {
        nodeA: "16215:37612", // Interaction (Primary/Large/IconOnly=False/Disable=False)
        nodeB: "16215:37749", // Wrapper (이상 variant) — 현재 엔진이 잘못 매칭하는 쌍
        shouldMatch: false,
        description: "Interaction ↔ Wrapper 뒤바뀜 금지 — 역할이 다른 컨테이너를 혼동하면 안 됨",
      },
      {
        nodeA: "16215:37608", // Content (기준 variant Wrapper 내부)
        nodeB: "16215:37605", // Loading (기준 variant Wrapper 내부)
        shouldMatch: false,
        description: "Content ↔ Loading 합침 금지 — 같은 부모(Wrapper) 안의 다른 역할 자식",
      },
    ],
  },
];
