# ISSUE-008: 회전된 요소 (transform: rotate) 레이아웃 처리

## 상태
**RESOLVED**

## 문제 설명

Figma에서 `transform: rotate(-90deg)` 등으로 회전된 요소가 CSS에서 잘못 렌더링됨.

```
Figma 원본:
┌────┐
│ T  │  ← 상단 16px 가로선 (회전된 FRAME)
│ |  │  ← 10px 세로선 (회전된 VECTOR)
│40px│  ← 텍스트
│ |  │
│ ⊥  │  ← 하단 16px 가로선
└────┘

잘못된 렌더링:
└── "40px"만 보임 (회전된 요소 안 보임)
```

## 원인

1. CSS `transform: rotate()`는 **시각적 변환만** 수행
2. **레이아웃 계산에는 영향 없음** → flex 공간 할당이 회전 전 크기 기준
3. `absoluteBoundingBox`는 회전 전 크기, `absoluteRenderBounds`는 회전 후 실제 크기

## 해결

`_TempAstTree.updateRotatedElements()`에서:

1. ±90도 회전 감지 (rotation ≈ ±π/2)
2. `transform: rotate()` 제거
3. `absoluteRenderBounds` 기반 실제 크기 설정

```typescript
// rotation 감지
const isRotated90 = Math.abs(absRotation - Math.PI / 2) < 0.01;

if (isRotated90) {
  delete base["transform"];
  base["width"] = `${Math.round(renderBounds.width)}px`;
  base["height"] = `${Math.round(renderBounds.height)}px`;
  base["flex"] = `${flexGrow} ${flexShrink} auto`; // flex-basis 유지
}
```

`_TempAstTree.updateVectorStyles()`에서:

- VECTOR 노드는 항상 `absoluteRenderBounds` 기반 크기 설정
- 부모가 회전된 경우에도 정확한 렌더링 크기 제공

## 결과

```jsx
// 이전: 회전된 상태로 레이아웃 충돌
<div style={{ height: "16px", transform: "rotate(-90deg)" }}>
  <svg width={16} height={1} ... />
</div>

// 이후: 실제 렌더링 크기로 설정
<div style={{ height: "1px", width: "16px" }}>
  <svg width={16} height={1} ... />
</div>
```
