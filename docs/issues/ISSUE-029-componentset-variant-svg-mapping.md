# ISSUE-029: COMPONENT_SET variant별 SVG 매핑 문제

## 상태
**RESOLVED**

## 문제 설명

동일 COMPONENT_SET의 variant들이 `INSTANCE_SWAP`으로 다른 SVG 아이콘을 사용하는 경우, 모든 variant가 첫 번째 variant의 SVG만 사용함.

```
Figma 구조:
- NormalResponsive (COMPONENT_SET)
  ├── Size=Normal variant
  │   └── INSTANCE_SWAP → Arrow Icon (viewBox="0 0 20 16")
  └── Size=Large variant
      └── INSTANCE_SWAP → Dotted Square Icon (viewBox="0 0 32 32")

기대: size === "Normal" ? <ArrowSvg/> : <DottedSquareSvg/>
실제: 모든 variant에서 <ArrowSvg/> 렌더링 (첫 번째 variant만)
```

## 원인

**`_FinalAstTree.ts`에서 루트 노드 처리 시 `_variantSvgs` 체크가 실행되지 않음**:

```typescript
if (isRootDocument) {
  // 루트 노드 처리
  // ...
  return;  // ❌ 여기서 조기 종료 → _variantSvgs 로직에 도달하지 않음
}

// _variantSvgs 체크
// ❌ 루트 노드는 위에서 return되어 이 로직에 도달하지 않음
const variantSvgs = this._variantSvgs[node.id];
```

## 해결

**루트 노드 처리 블록 내에서 `_variantSvgs` 체크 추가**:

```typescript
if (isRootDocument) {
  // 기존 루트 노드 처리 로직
  // ...

  // ✅ _variantSvgs 체크 추가
  const variantSvgs = this._variantSvgs[node.id];
  if (variantSvgs && Object.keys(variantSvgs).length > 0) {
    const firstVariantName = Object.keys(variantSvgs)[0];
    const firstSvgId = variantSvgs[firstVariantName];

    // variant별로 다른 SVG가 있는지 확인
    const hasDifferentSvgs = Object.values(variantSvgs).some(
      (svgId) => svgId !== firstSvgId
    );

    if (hasDifferentSvgs) {
      // variant별 SVG 매핑 설정
      node.metaData.vectorSvgs = variantSvgs;
    } else {
      // 모든 variant가 같은 SVG 사용 → 단일 SVG
      node.metaData.vectorSvg = this.specDataManager.getVectorSvg(firstSvgId);
    }
  }

  return;
}
```

## 결과

```typescript
// 생성된 코드
const NormalResponsiveSvgs: Record<
  NonNullable<NormalResponsiveProps["size"]>,
  React.ReactNode
> = {
  Normal: (
    <svg viewBox="0 0 20 16" fill="none">
      <path d="M..." fill="black"/>  {/* Arrow Icon */}
    </svg>
  ),
  Large: (
    <svg viewBox="0 0 32 32" fill="none">
      <rect d="M..." fill="black"/>  {/* Dotted Square Icon */}
    </svg>
  ),
};

function NormalResponsive({ size }: NormalResponsiveProps) {
  return (
    <div css={NormalResponsiveCss}>
      {NormalResponsiveSvgs[size]}  {/* size에 따라 다른 SVG 렌더링 */}
    </div>
  );
}
```

| size | SVG | 상태 |
|------|-----|------|
| Normal | Arrow Icon (viewBox="0 0 20 16") | ✓ |
| Large | Dotted Square Icon (viewBox="0 0 32 32") | ✓ |

## 테스트

`test/compiler/variantSvg.test.ts`
