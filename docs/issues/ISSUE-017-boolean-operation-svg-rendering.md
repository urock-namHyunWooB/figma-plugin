# ISSUE-017: BOOLEAN_OPERATION 노드 SVG 렌더링 누락

## 상태
**RESOLVED**

## 문제 설명

Status Bar 같은 복잡한 UI 컴포넌트에서 배터리 아이콘, 신호 강도 아이콘 등이 렌더링되지 않음.

```
Figma 원본:
┌─────────────────────────────────────┐
│ 12:22  📶  📶  🔋                   │
└─────────────────────────────────────┘

잘못된 렌더링:
┌─────────────────────────────────────┐
│ 12:22  [ ]  [ ]  [ ]                │  ← 아이콘들이 빈 박스로 표시
└─────────────────────────────────────┘
```

## 원인

Figma의 복잡한 도형들은 `BOOLEAN_OPERATION` 노드로 표현됨:

```
GROUP (Status Bar – Battery)
└── BOOLEAN_OPERATION (booleanOperation: "UNION")
    ├── BOOLEAN_OPERATION (booleanOperation: "EXCLUDE")
    │   ├── VECTOR (Outer)
    │   └── VECTOR (Inner)
    └── VECTOR (Path)
```

- `BOOLEAN_OPERATION`: 여러 VECTOR를 조합한 복합 도형
  - `UNION`: 합집합
  - `SUBTRACT`: 차집합
  - `INTERSECT`: 교집합
  - `EXCLUDE`: 배타적 OR (XOR)

SVG 수집 및 처리 로직에서 `BOOLEAN_OPERATION` 타입이 누락되어 있었음.

## 해결

**1. 백엔드 (FigmaPlugin.ts)**: BOOLEAN_OPERATION SVG 수집 추가

```typescript
// _traverseAndCollectVectors
if (
  node.type === "VECTOR" ||
  node.type === "LINE" ||
  node.type === "STAR" ||
  node.type === "ELLIPSE" ||
  node.type === "POLYGON" ||
  node.type === "BOOLEAN_OPERATION"  // 추가
) {
  const svgBytes = await node.exportAsync({ format: "SVG" });
  vectorSvgs[node.id] = String.fromCharCode(...svgBytes);
}
```

**2. 컴파일러 (_TempAstTree.ts)**: VECTOR 스타일 처리에 BOOLEAN_OPERATION 추가

```typescript
// updateVectorStyles
const vectorTypes = [
  "VECTOR", "LINE", "STAR", "ELLIPSE", "POLYGON",
  "BOOLEAN_OPERATION"  // 추가
];
```

**3. 컴파일러 (_FinalAstTree.ts)**: semanticRole 및 vectorSvg 메타데이터 처리

```typescript
// updateMetaData switch case
case "VECTOR":
case "LINE":
case "STAR":
case "ELLIPSE":
case "POLYGON":
case "BOOLEAN_OPERATION": {  // 추가
  node.semanticRole = "vector";
  const vectorSvg = this.specDataManager.getVectorSvgByNodeId(node.id);
  if (vectorSvg) {
    node.metaData.vectorSvg = vectorSvg;
  }
  break;
}
```

## 결과

```jsx
// 이전: 빈 div (SVG 없음)
<div css={BodyCss} />

// 이후: 실제 SVG 렌더링
<svg css={BodyCss} width={24} height={12} viewBox="0 0 24 12" fill="none">
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    d="M19.4481 0H2.49335C1.11631 0 0 1.11929 0 2.5V9..."
    fill="black"
    fillOpacity={0.38}
  />
</svg>
```

## 테스트

`test/compiler/booleanOperation.test.ts`
