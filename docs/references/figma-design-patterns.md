# Figma 디자인 패턴 — 코드 생성기가 인식하는 시각 트릭

Figma에는 코드 수준의 조건부 로직을 직접 표현하는 기능이 없다.
디자이너들은 레이아웃, 마스크, 오버레이 등 시각 도구를 조합하여 의도를 표현하며,
코드 생성기는 이 트릭을 인식하여 실제 의도로 번역해야 한다.

---

## 1. Alpha Mask를 이용한 조건부 숨김

### 디자이너 의도
"loading=true일 때 content를 숨기고 spinner를 보여준다"

### Figma 표현
```
Wrapper (FRAME)
├── Loading (FRAME, layoutPositioning: ABSOLUTE, visible: false)
│   └── Spinner (INSTANCE)
├── Mask (RECTANGLE, isMask: true, maskType: ALPHA, visible: false)
│   └── componentPropertyReferences.visible → "Loading#29474:0"
└── Content (FRAME)
    ├── Leading Icon
    ├── Label
    └── Trailing Icon
```

- **Loading**: absolute로 Content 위에 떠서 spinner를 보여줌
- **Mask**: 높이 ≈ 0, fills 비어있는 alpha mask. loading prop으로 켜지면 Content를 클리핑하여 숨김
- **Content**: 별도 visibility 제어 없음 — mask가 대신 가려줌

### 감지 조건 (3가지 모두 충족)
1. `isMask: true`
2. `maskType: "ALPHA"`
3. `componentPropertyReferences.visible` 존재 (prop으로 토글)

### 코드 생성기 처리 (VisibilityProcessor)
1. 위 조건을 만족하는 mask 노드를 감지
2. mask의 visibility prop에서 condition 추출 (예: `{ type: "truthy", prop: "loading" }`)
3. 같은 부모의 flow 자식(Content)에 `visibility: hidden` dynamic style 부여
4. mask 노드 자체는 트리에서 제거

### 생성 코드 예시
```tsx
{/* Content — loading 시 숨김 */}
<div css={[contentCss, loading && css`visibility: hidden`]}>
  {label}
</div>

{/* Loading overlay */}
{loading && <div css={loadingCss}><Spinner /></div>}
```

### Fixture 검증 (87개 전수조사)
| 패턴 | 건수 | Fixture |
|------|------|---------|
| Loading overlay (이 패턴) | 45건 | Buttonsolid, Buttonbutton, List, Breakpoint |

---

## 2. Variant별 자식 구조 교체 (레이아웃 모드 전환)

### 디자이너 의도
"버튼에 아이콘 슬롯(Leading/Trailing)을 준비하되, iconOnly 모드에서는 아이콘 하나만 남긴다"

### Figma 표현
```
Buttonsolid (COMPONENT_SET)
├── Icon Only=False
│   └── Content (FRAME)
│       ├── Leading Icon (FRAME, visible=false, ref=leadingIcon)  ← boolean 슬롯
│       ├── 텍스트 (TEXT)
│       └── Trailing Icon (FRAME, visible=false, ref=trailingIcon) ← boolean 슬롯
└── Icon Only=True
    └── Content (FRAME)
        └── Icon (INSTANCE)  ← 완전히 다른 자식 구성
```

- `Icon Only`는 VARIANT prop — True/False에서 **Content의 자식 트리 자체가 다름**
- `visible` 토글이 아니라, variant별로 디자이너가 **다른 노드 구성을 배치**한 것
- Leading/Trailing Icon은 iconOnly와 무관 — 자기 자신의 boolean prop으로만 토글됨

### 1번 패턴과의 차이
| | Alpha Mask (1번) | 자식 구조 교체 (2번) |
|---|---|---|
| 메커니즘 | 투명 마스크로 간접 가림 | variant별로 다른 자식 트리 배치 |
| 레이아웃 | 공간 유지 (visibility: hidden) | 구조 자체가 바뀜 (display: none) |
| 용도 | loading 시 크기 유지 | iconOnly 시 레이아웃 모드 전환 |

### 코드 생성기 처리
현재 별도 패턴 감지 없음. variant merger가 노드 존재 여부로 기계적으로 `visibleCondition`을 부여하고,
`hoistSharedChildConditions` 후처리가 공통 조건을 부모로 끌어올린다.

### 생성 코드 예시
```tsx
{/* Icon Only=False 모드 */}
{iconOnly === "False" && (
  <>
    {leadingIcon && <div css={leadingIconCss}>{leadingIcon}</div>}
    <span>{label}</span>
    {trailingIcon && <div css={trailingIconCss}>{trailingIcon}</div>}
  </>
)}

{/* Icon Only=True 모드 */}
{iconOnly === "True" && <Icon />}
```

### Fixture 검증
| 패턴 | Fixture |
|------|---------|
| iconOnly 레이아웃 모드 전환 | Buttonsolid |

---

## 3. 장식/컬러 마스크 (처리 불필요)

### 용도
아이콘이나 도형에 색을 입히기 위한 정적 마스크. 토글 없이 항상 활성.

### Figma 표현
```
Mono (INSTANCE)
├── Mask (FRAME, isMask: true, maskType: ALPHA, height: 24)
└── Color (RECTANGLE, layoutPositioning: ABSOLUTE, fills 있음)
```

### 구분 포인트
- `componentPropertyReferences.visible` **없음** — 항상 켜져 있음
- type이 FRAME (loading overlay는 RECTANGLE)
- 정상 크기 (height > 0)

### 코드 생성기 처리
별도 처리 없음. 일반 노드로 취급.

---

## 4. 셰이프 클리핑 마스크 (처리 불필요)

### 용도
이미지를 동그랗게 자르거나, 스위치 컴포넌트의 배경을 둥근 사각형으로 잘라내는 전통적 마스크.

### Figma 표현
```
Switch (INSTANCE)
├── Mask (VECTOR, isMask: true, maskType: VECTOR)
├── Background (RECTANGLE)
└── Knob (INSTANCE)
```

### 구분 포인트
- `maskType: "VECTOR"` (ALPHA가 아님)
- `componentPropertyReferences.visible` **없음**
- type이 VECTOR

### 코드 생성기 처리
별도 처리 없음. 일반 노드로 취급.

---

## 패턴 판별 흐름도

```
isMask: true?
├── NO → 일반 노드
└── YES
    ├── componentPropertyReferences.visible 있음?
    │   ├── NO → 장식/클리핑 마스크 (무시)
    │   └── YES
    │       └── maskType === "ALPHA"?
    │           ├── NO → 무시
    │           └── YES → ★ 조건부 숨김 패턴 → visibility:hidden 부여
    └── (끝)
```
