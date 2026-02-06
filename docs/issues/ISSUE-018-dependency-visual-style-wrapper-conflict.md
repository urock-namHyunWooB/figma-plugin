# ISSUE-018: Dependency 루트의 시각적 스타일이 Wrapper와 충돌

## 상태
**RESOLVED**

## 문제 설명

Popup 컴포넌트에서 Left Button(Neutral)과 Right Button(Primary)이 서로 다른 배경색을 가져야 하는데, 모두 같은 색(#595B5E)으로 렌더링됨.

```
Figma 원본:
┌─────────────────────────────────────┐
│  [Left Button]    [Right Button]   │
│    (회색)            (파란색)        │
│   #595B5E          #0050FF         │
└─────────────────────────────────────┘

잘못된 렌더링:
┌─────────────────────────────────────┐
│  [Left Button]    [Right Button]   │
│    (회색)            (회색)          │
│   #595B5E          #595B5E         │  ← 둘 다 같은 색!
└─────────────────────────────────────┘
```

## 원인

1. **Figma API 동작**: INSTANCE 노드에 variant의 root fills를 복사
   - Left Button INSTANCE → Neutral variant 배경색 (#595B5E)
   - Right Button INSTANCE → Primary variant 배경색 (#0050FF)

2. **스타일 중복**: wrapper(INSTANCE)와 dependency 모두 시각적 스타일을 가짐
   - wrapper에는 올바른 variant별 배경색 존재
   - dependency는 대표 variant(Neutral) 하나로만 컴파일됨
   - dependency의 `width: 100%; height: 100%`가 wrapper를 완전히 덮음

3. **결과**: dependency의 배경색이 wrapper의 배경색을 가림

## 해결

**역할 분리 원칙**:
- **wrapper (INSTANCE)**: 시각적 스타일 담당 (background, border-radius, border, opacity)
- **dependency**: 레이아웃 스타일만 담당 (display, flex, gap, align-items 등)

**`VariantEnrichManager.makeRootFlexible()` 확장**:

```typescript
public makeRootFlexible(variant: FigmaNodeData): FigmaNodeData {
  const {
    // 크기 관련 (기존)
    width: _width,
    height: _height,
    // 패딩 관련 (기존)
    padding: _padding,
    "padding-top": _paddingTop,
    "padding-right": _paddingRight,
    "padding-bottom": _paddingBottom,
    "padding-left": _paddingLeft,
    // 시각적 스타일 (추가) - wrapper가 담당
    background: _background,
    "border-radius": _borderRadius,
    border: _border,
    opacity: _opacity,
    ...restCssStyle
  } = variant.styleTree.cssStyle;

  return {
    ...variant,
    styleTree: {
      ...variant.styleTree,
      cssStyle: {
        ...restCssStyle,
        width: "100%",
        height: "100%",
      },
    },
  };
}
```

## 제거되는 시각적 스타일

| 스타일 | 설명 |
| ------ | ---- |
| `background` | 배경색 - wrapper가 variant별로 담당 |
| `border-radius` | 모서리 둥글기 - wrapper가 담당 |
| `border` | 테두리 - wrapper가 담당 |
| `opacity` | 투명도 - wrapper가 담당 |

## 결과

```css
/* wrapper CSS - 시각적 스타일 포함 */
const LeftButtonCss = css`
  background: #595B5E;
  border-radius: 8px;
  /* + 레이아웃 스타일 */
`;

const RightButtonCss = css`
  background: #0050FF;      /* 올바른 Primary 색상! */
  border-radius: 8px;
  /* + 레이아웃 스타일 */
`;

/* dependency CSS - 레이아웃만 */
const LargeCss = css`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  /* background, border-radius 제거됨 */
`;
```

## 테스트

`test/compiler/popupVisualStyles.test.ts`
