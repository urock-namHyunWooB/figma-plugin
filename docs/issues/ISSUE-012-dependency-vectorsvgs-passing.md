# ISSUE-012: 의존 컴포넌트에 vectorSvgs 전달

## 상태
**RESOLVED**

## 문제 설명

`Gnb.json`의 아이콘들이 SVG로 렌더링되지 않고 빈 `<div>`로 렌더링됨.

## 원인

1. 메인 문서에 `vectorSvgs` 정보가 있음 (각 VECTOR 노드별 SVG 데이터)
2. dependency 컴파일 시 이 정보가 전달되지 않음
3. dependency의 VECTOR 노드에 `vectorSvg`가 없어서 `<div>`로 렌더링됨

```typescript
// dependency 컴파일 시 vectorSvgs가 전달되지 않음
const enrichedVariant = this.variantEnrichManager.enrichWithVectorSvg(...);
// enrichWithVectorSvg는 루트 노드에만 merged SVG를 추가
```

## 해결

dependency 컴파일 시 메인 문서의 `vectorSvgs`를 그대로 전달:

```typescript
// DependencyManager.ts
// 메인 문서의 vectorSvgs를 dependency에 전달
const rootVectorSvgs = this.specDataManager.getSpec().vectorSvgs;
if (rootVectorSvgs && Object.keys(rootVectorSvgs).length > 0) {
  enrichedVariant = {
    ...enrichedVariant,
    vectorSvgs: {
      ...(enrichedVariant.vectorSvgs || {}),
      ...rootVectorSvgs,
    },
  };
}
```

추가로, VECTOR/ELLIPSE 노드의 `fill`/`background` 처리:

```typescript
// _TempAstTree.updateVectorStyles
// 1. styleTree의 노드는 type이 없을 수 있으므로 nodeSpec에서도 확인
const nodeType = node.type || nodeSpec?.type;
if (!vectorTypes.includes(nodeType)) return;

// 2. fill 처리
if ("fill" in base) {
  if (hasVectorSvg) {
    base["color"] = base["fill"]; // SVG 내부 fill="currentColor"가 이 색상 사용
  } else {
    base["background"] = base["fill"]; // SVG 없으면 div의 배경색으로
  }
  delete base["fill"];
}

// 3. background 처리 (ELLIPSE 등은 fill 대신 background로 스타일 제공)
if (hasVectorSvg && "background" in base && !("color" in base)) {
  base["color"] = base["background"];
  delete base["background"];
}
```

태그 결정 시 `vectorSvg` 유무에 따라 `svg` 또는 `div` 선택:

```typescript
// CreateJsxTree._getTagName
case "vector":
  return node.metaData?.vectorSvg ? "svg" : "div";
```

## 결과

- VECTOR 노드에 `vectorSvg`가 있으면 → `<svg>` 태그로 렌더링
- VECTOR 노드에 `vectorSvg`가 없으면 → `<div>` 태그 + `background` 스타일

## 테스트

`test/compiler/dependencyEmptyChildren.test.ts`
