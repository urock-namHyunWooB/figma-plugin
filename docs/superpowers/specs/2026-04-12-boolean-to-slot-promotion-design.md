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
- VARIANT prop이 True/False 분기를 가짐 (기존 `layoutModeSwitch` 패턴으로 이미 감지됨)
- 해당 분기 내 INSTANCE가 `isExposedInstance: true`

**동작:**
- VARIANT boolean prop은 유지 (`iconOnly: boolean`)
- 해당 INSTANCE를 별도 ReactNode 슬롯으로 추가 (`icon: ReactNode`)
- INSTANCE 노드에 `bindings.content` 설정

**적용 대상:** `iconOnly` → `icon` 슬롯 추가

## 아키텍처: 감지/변환 책임 분리

현재 SlotProcessor가 감지와 변환을 모두 담당한다. 이번 작업에서 **감지는 DesignPatternDetector**, **변환은 SlotProcessor**로 책임을 분리한다.

### 파이프라인 흐름

```
Step 0: DesignPatternDetector.detect()
        ├─ 기존 패턴: alphaMask, interactionFrame, fullCoverBackground, ...
        └─ 신규 패턴: exposedInstanceSlot  ← 추가
        
Step 1: VariantMerger.merge(node, patterns)
        └─ applyPatternAnnotations() → node.metadata.designPatterns에 저장

Step 2: PropsExtractor.extract()
        └─ BOOLEAN → boolean prop, VARIANT → variant prop 생성

Step 3: SlotProcessor.process()
        └─ 변환만 수행: metadata.designPatterns에서 exposedInstanceSlot을 읽어
           해당 boolean prop을 slot으로 승격 + bindings 설정
```

## 수정 대상 파일

### 1. types/types.ts — `DesignPattern` 타입 확장

`exposedInstanceSlot` 패턴 타입 추가:

```typescript
| {
    type: "exposedInstanceSlot";
    nodeId: string;          // visibility-controlled 노드 ID (FRAME 또는 INSTANCE)
    instanceNodeId: string;  // exposed INSTANCE 노드 ID
    visibleRef: string;      // componentPropertyReferences.visible 값 (prop sourceKey)
  }
```

### 2. DesignPatternDetector.ts — `exposedInstanceSlot` 감지 추가

Raw Figma 노드를 순회하며 감지:

```
walkRawNode() 내에서:
1. componentPropertyReferences.visible이 있는 노드를 찾음
2. 해당 노드 또는 직계 자식에서 isExposedInstance: true인 INSTANCE가 있는지 확인
3. 있으면 → exposedInstanceSlot 패턴 생성
4. 없으면 → 패턴 생성하지 않음 (loading 케이스)
```

규칙 3(`layoutModeSwitch` + exposed INSTANCE)도 여기서 감지:

```
detectLayoutModeSwitch() 확장:
1. 기존 layoutModeSwitch 감지 로직 유지
2. 각 분기의 고유 children 중 isExposedInstance: true인 INSTANCE가 있으면
   → 추가로 exposedInstanceSlot 패턴 생성 (visibleRef 대신 분기 prop 정보 포함)
```

### 3. SlotProcessor.ts — 감지 로직 제거, 패턴 소비로 전환

**제거:**
- `collectVisibilityProps()` 내부의 감지 로직 (line 87-117)
- `collectVariantVisibilitySlots()` 내부의 감지 로직 (line 119-179)

**추가:**
- `node.metadata.designPatterns`에서 `exposedInstanceSlot` 패턴을 읽어 변환 수행
- 기존 boolean prop을 slot으로 승격하는 로직
- INSTANCE 노드에 `bindings.content` 설정

**유지:**
- 배열 slot 감지 (이건 merged tree 상태에 의존하므로 SlotProcessor에 남김)
- `applySlotBindings()`, `applyVariantSlotBindings()` 등 변환 유틸리티

### 4. DesignPatternDetector 기술 문서 업데이트

작업 완료 후 DesignPatternDetector를 기술하는 기존 문서를 업데이트하여 `exposedInstanceSlot` 패턴 추가 반영.

## 수정하지 않는 파일

- `instanceSlotUtils.ts` — `shouldBeInstanceSlot()` 로직은 이미 올바름
- `PropsGenerator.ts` — slot → `React.ReactNode` 변환은 이미 구현됨
- `PropsExtractor.ts` — BOOLEAN/VARIANT 추출은 그대로 유지
- `GenericHeuristic.ts` — Buttonsolid는 ButtonHeuristic에서 처리되므로 무관

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
4. **DesignPatternDetector 단위 테스트**: exposedInstanceSlot 패턴이 올바르게 감지되는지 확인
