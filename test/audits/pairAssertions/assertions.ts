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
    fixture: "button/Btnsbtn",
    pairs: [
      {
        nodeA: "4214:393", // icon_arrow (default variant의 아이콘 인스턴스)
        nodeB: "4214:548", // icon_delete (loading variant의 다른 아이콘 인스턴스)
        shouldMatch: false,
        description: "다른 아이콘 — arrow와 delete는 별개 요소, 합치면 안 됨",
      },
      {
        nodeA: "I4214:393;3:315", // Vector 40 (icon_arrow 내부 벡터)
        nodeB: "I4214:453;3:481", // Rectangle 419 (icon_wastebasket 내부 사각형)
        shouldMatch: false,
        description: "다른 도형 — 아이콘 내부 벡터/사각형은 별개 요소",
      },
    ],
  },
];
