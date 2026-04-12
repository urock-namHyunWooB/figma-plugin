# Boolean-to-Slot Promotion: 디자인 의도 기반 prop 타입 변환

## 문제

BOOLEAN component property가 INSTANCE visibility를 제어할 때, 엔진이 이를 `ReactNode` 슬롯이 아닌 `boolean`으로 생성한다. 디자이너가 `isExposedInstance: true`로 "이 인스턴스는 소비자가 교체할 수 있다"고 명시했지만, 코드에 반영되지 않는다.

### 현재 출력 (Buttonsolid 기준)

```tsx
interface ButtonsolidOwnProps {
  leadingIcon?: boolean;     // BOOLEAN → INSTANCE visibility 토글
  trailingIcon?: boolean;    // BOOLEAN → INSTANCE visibility 토글
  label?: string;            // TEXT → 정상
  loading?: boolean;         // BOOLEAN → FRAME visibility 토글 (정상)
  variant?: "Primary" | "Assistive";
  size?: "Small" | "Medium" | "Large";
  iconOnly?: boolean;        // VARIANT True/False → boolean (정상)
  disable?: boolean;         // VARIANT True/False → boolean
}
```

### 기대 출력

```tsx
interface ButtonsolidOwnProps {
  leadingIcon?: React.ReactNode;   // ReactNode 슬롯
  trailingIcon?: React.ReactNode;  // ReactNode 슬롯
  icon?: React.ReactNode;          // iconOnly 모드의 중앙 아이콘 슬롯
  label?: string;
  loading?: boolean;               // 고정 스피너, boolean 유지
  variant?: "Primary" | "Assistive";
  size?: "Small" | "Medium" | "Large";
  iconOnly?: boolean;
  disable?: boolean;
}
```

## 근본 원인

### 경로 1: SlotProcessor가 FRAME을 무시

`SlotProcessor.collectVisibilityProps()` (line 93)가 `node.type === "INSTANCE"`만 체크한다. Buttonsolid에서 visibility binding은 FRAME에 있고 INSTANCE는 그 자식이므로 감지 실패.

```
Leading Icon [FRAME] ← componentPropertyReferences.visible = "Leading Icon#438:4"
  └─ Leading Icon [INSTANCE] ← isExposedInstance: true, INSTANCE_SWAP
```

### 경로 2: GenericHeuristic 중복 체크

`GenericHeuristic.detectAndAddInstanceSlots()`이 INSTANCE의 `isExposedInstance: true`를 감지하지만, PropsExtractor가 이미 `leadingIcon: boolean` prop을 생성했으므로 동명 중복 체크(line 185)에 걸려 skip.

### 경로 3: Loading은 정상적으로 boolean 유지

Loading FRAME 안의 INSTANCE는 `isExposedInstance: false`이므로 슬롯 후보에서 제외. 올바른 동작.

## 판별 기준

Figma 공식 API `isExposedInstance` (2022.09 도입)를 핵심 신호로 사용:

| 패턴 | isExposedInstance | 결과 prop 타입 |
|------|-------------------|----------------|
| BOOLEAN → FRAME → INSTANCE(exposed) | true | `React.ReactNode` |
| BOOLEAN → FRAME → INSTANCE(not exposed) | false | `boolean` |
| VARIANT True/False → 레이아웃 분기 → INSTANCE(exposed) | true | 별도 `ReactNode` 슬롯 추가 |

## 변환 규칙

### 규칙 1: BOOLEAN visibility + exposed INSTANCE → ReactNode 슬롯

**조건:**
- BOOLEAN component property가 노드의 visibility를 제어
- 해당 노드(또는 직계 자식)에 `isExposedInstance: true`인 INSTANCE가 존재

**동작:**
- 기존 boolean prop을 `type: "slot"` (ReactNode)으로 승격
- INSTANCE 노드에 `bindings.content` 설정

**적용 대상:** `leadingIcon`, `trailingIcon`

### 규칙 2: BOOLEAN visibility + non-exposed INSTANCE → boolean 유지

**조건:**
- BOOLEAN component property가 노드의 visibility를 제어
- 자식 INSTANCE가 `isExposedInstance: false`이거나 없음

**동작:** 변환 없음, boolean 유지

**적용 대상:** `loading`

### 규칙 3: VARIANT True/False 레이아웃 분기 + exposed INSTANCE → 별도 슬롯 추가

**조건:**
- VARIANT prop이 True/False 분기를 가짐
- True 분기에서만 존재하는 INSTANCE가 `isExposedInstance: true`

**동작:**
- VARIANT boolean prop은 유지 (`iconOnly: boolean`)
- 해당 INSTANCE를 별도 ReactNode 슬롯으로 추가 (`icon: ReactNode`)
- INSTANCE 노드에 `bindings.content` 설정

**적용 대상:** `iconOnly` → `icon` 슬롯 추가

## 수정 대상 파일

### 1. SlotProcessor.ts — `collectVisibilityProps()` 확장

현재 `node.type === "INSTANCE"` 조건을 완화하여, FRAME 노드의 visibility binding도 감지하고 자식 INSTANCE의 `isExposedInstance`를 확인:

```
변경 전: INSTANCE + visible ref → slot
변경 후: (INSTANCE OR FRAME) + visible ref → 자식에 exposed INSTANCE 있으면 slot
```

- FRAME인 경우: 직계 자식 중 `isExposedInstance: true`인 INSTANCE를 찾아서 슬롯 대상으로 등록
- FRAME인데 exposed INSTANCE가 없으면: boolean 유지 (loading 케이스)

### 2. GenericHeuristic.ts — 기존 boolean prop 승격 로직

`detectAndAddInstanceSlots()`에서 동명 prop이 이미 있을 때 skip하지 않고, 기존 boolean prop을 slot으로 **승격**:

```
변경 전: 같은 이름 있으면 skip
변경 후: 같은 이름이 boolean이면 slot으로 교체
```

### 3. GenericHeuristic.ts — `detectAndAddBooleanVariantSlots()` TODO 해소

Line 80-82의 TODO를 구현하여, boolean variant가 제어하는 INSTANCE를 찾고 exposed면 별도 슬롯 추가.

## 수정하지 않는 파일

- `instanceSlotUtils.ts` — `shouldBeInstanceSlot()` 로직은 이미 올바름
- `PropsGenerator.ts` — slot → `React.ReactNode` 변환은 이미 구현됨
- `PropsExtractor.ts` — BOOLEAN/VARIANT 추출은 그대로 유지

## 생성 코드 변화 (Buttonsolid 기준)

### Props

```tsx
// Before
leadingIcon?: boolean;
trailingIcon?: boolean;

// After
leadingIcon?: React.ReactNode;
trailingIcon?: React.ReactNode;
icon?: React.ReactNode;
```

### JSX

```tsx
// Before
{leadingIcon && (
  <div css={...}>
    <Iconsicons />
  </div>
)}

// After
{leadingIcon && (
  <div css={...}>
    {leadingIcon}
  </div>
)}
```

```tsx
// Before (iconOnly mode)
{iconOnly ? (
  <div css={...}>
    <Iconsicons />
  </div>
) : (...)}

// After
{iconOnly ? (
  <div css={...}>
    {icon}
  </div>
) : (...)}
```

## 테스트 계획

1. **Buttonsolid fixture**: `leadingIcon`/`trailingIcon`이 ReactNode, `loading`이 boolean, `icon` 슬롯 추가 확인
2. **기존 테스트 회귀**: 다른 fixture에서 의도치 않은 slot 승격이 없는지 확인
3. **경계 케이스**: FRAME 안에 exposed INSTANCE가 여러 개인 경우, 중첩 FRAME인 경우
