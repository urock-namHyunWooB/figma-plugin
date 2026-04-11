# DesignPatternDetector v2 — Pre-Merger 감지 + layoutModeSwitch

## 배경

현재 DesignPatternDetector는 merger 이후(Step 1.0, Step 2.5)에 두 번 실행된다.
이로 인해:
1. 데이터 변경 후 재감지 시 일관성 문제 위험
2. merger가 디자인 패턴 힌트를 활용할 수 없음
3. layoutModeSwitch 같은 구조적 패턴은 raw 데이터에서 감지해야 정확

## 목표

1. DesignPatternDetector를 **merger 이전**으로 이동 — raw Figma 데이터 입력
2. **한 번만 실행**하여 모든 패턴 감지
3. 기존 6개 패턴 마이그레이션
4. **layoutModeSwitch** 패턴 신규 추가
5. UITreeOptimizer에서 **conditionalGroup** 노드 타입 생성
6. CodeEmitter에서 삼항/switch-case 렌더링

## 비목표

- 2번(component map) / 3번(순서 전환) 디자인 패턴은 이 스펙 범위 밖
- merger 내부 로직 변경 (annotation 복사만 추가)

---

## 1. DesignPatternDetector 입출력 변경

### 입력 (Before → After)

```
Before: detect(tree: InternalTree, props?: PropDefinition[])
After:  detect(node: SceneNode, dataManager: DataManager): DesignPattern[]
```

- `node`: raw Figma COMPONENT_SET (또는 COMPONENT) SceneNode
- `dataManager`: 노드 조회용
- props는 `componentPropertyDefinitions`에서 직접 추출

### 출력

```typescript
type DesignPattern =
  /** Alpha mask 조건부 숨김 */
  | { type: "alphaMask"; nodeId: string; visibleRef: string }
  /** Interaction 프레임 */
  | { type: "interactionFrame"; nodeId: string }
  /** 풀커버 배경 노드 */
  | { type: "fullCoverBackground"; nodeId: string }
  /** State → CSS pseudo-class */
  | { type: "statePseudoClass"; prop: string; stateMap: Record<string, string> }
  /** Breakpoint → @media query */
  | { type: "breakpointVariant"; prop: string }
  /** Boolean prop에 의한 위치 이동 */
  | { type: "booleanPositionSwap"; nodeId: string; prop: string }
  /** Variant prop에 의한 레이아웃 모드 전환 (NEW) */
  | {
      type: "layoutModeSwitch";
      /** 자식 구조가 바뀌는 컨테이너의 nodeId */
      containerNodeId: string;
      /** 모드를 제어하는 variant prop 이름 */
      prop: string;
      /** prop 값 → 해당 모드에서만 존재하는 자식 nodeId 목록 */
      branches: Record<string, string[]>;
    };
```

각 패턴이 자기 스코프 정보(nodeId, prop 등)를 직접 포함하므로 별도 Map 불필요.

---

## 2. 실행 시점 및 전달 흐름

### 파이프라인

```
SceneNode (raw)
  → DesignPatternDetector.detect(node, dataManager)  ← 한 번만 실행
  → DesignPattern[] 반환
  → VariantMerger.merge(node, patterns)  ← patterns 전달
      → InternalNode 생성 시 nodeId 매칭하여 metadata.designPatterns에 복사
      → 컴포넌트/구조 레벨 패턴은 root에 부착
  → InteractionLayerStripper (annotation 소비)
  → RedundantNodeCollapser (annotation 소비)
  → PropsExtractor
  → VisibilityProcessor (annotation 소비)
  → StyleProcessor
  → ...
  → UITreeOptimizer (layoutModeSwitch → conditionalGroup 변환)
  → CodeEmitter (conditionalGroup → 삼항/switch-case 렌더링)
```

### TreeBuilder 변경

```typescript
public build(node: SceneNode): UITree {
  // Step 0: 디자인 패턴 감지 (merger 이전, 한 번만)
  const patterns = this.designPatternDetector.detect(node, this.dataManager);

  // Step 1: 변형 병합 (패턴 힌트 전달)
  let tree = this.variantMerger.merge(node, patterns);

  // Step 1.0 제거 (detect 호출 제거)
  // Step 2.5 제거 (detect 호출 제거)
  // 나머지 파이프라인 동일
}
```

---

## 3. 기존 6개 패턴 마이그레이션

각 패턴의 감지 로직을 InternalTree 분석에서 raw Figma 데이터 분석으로 전환.

### alphaMask
- Before: InternalNode의 componentPropertyReferences + DataManager.getById로 isMask/maskType 확인
- After: raw variant children을 순회하며 동일 조건 확인. nodeId 기록.

### interactionFrame
- Before: InternalNode의 name + type 확인
- After: raw variant children에서 name === "Interaction" && type === "FRAME" 탐색

### fullCoverBackground
- Before: InternalNode의 mergedNodes로 variant별 coverage 확인
- After: 각 variant에서 부모-자식 absoluteBoundingBox 비교로 coverage 확인

### statePseudoClass
- Before: props 배열에서 state prop 탐색
- After: componentPropertyDefinitions에서 State/States variant prop 탐색

### breakpointVariant
- Before: props 배열에서 breakpoint 이름 패턴 탐색
- After: componentPropertyDefinitions에서 동일 패턴 탐색

### booleanPositionSwap
- Before: merger 내부 MatchSignal에서 감지 후 annotation 기록
- After: 두 가지 선택지
  - (A) 여전히 merger 내부에서 감지 (매칭 과정에서만 판단 가능) → merger가 결과를 patterns에 추가
  - (B) raw 데이터에서 pre-scan

**booleanPositionSwap은 (A)로 유지** — 매칭 컨텍스트(정규화 위치, Hungarian 비교)가 필요하므로 raw 데이터만으로는 정확한 감지 불가. merger가 감지 후 InternalNode에 직접 부착하는 현재 방식 유지.

---

## 4. layoutModeSwitch 감지 알고리즘

### 감지 조건

한 컨테이너의 자식들이 **하나의 variant prop 값에 따라 상호 배타적 그룹**으로 나뉘는 경우.

### 알고리즘

1. COMPONENT_SET의 variant들을 variant prop 조합으로 파싱
2. 각 variant에서 같은 이름의 컨테이너를 찾음 (예: "Content")
3. 컨테이너의 직속 자식 이름 집합을 variant별로 수집
4. 하나의 variant prop에 의해 자식 집합이 분기되는지 확인:
   - prop X의 값 A인 variant들의 자식 집합 vs 값 B인 variant들의 자식 집합
   - 두 집합이 다르면 → layoutModeSwitch 후보
5. 다른 variant prop들(Size, Variant 등)에 의한 차이는 제외 — 동일 prop 값 내에서 자식이 일관되어야 함

### 예시: Buttonsolid

```
Icon Only=False variants → Content 자식: {Leading Icon, 텍스트, Trailing Icon}
Icon Only=True variants  → Content 자식: {Icon}
```

→ `{ type: "layoutModeSwitch", containerNodeId: "Content의 ID", prop: "iconOnly", branches: { "False": ["Leading Icon ID", "텍스트 ID", "Trailing Icon ID"], "True": ["Icon ID"] } }`

### 예시: Headersub (N분기)

```
Type=Default  → Sub Header 자식: 3개
Type=Basic    → Sub Header 자식: 2개
Type=Minimal  → Sub Header 자식: 1개
```

→ branches에 3개 키

---

## 5. UITreeOptimizer — conditionalGroup 변환

### 새로운 UINode type

```typescript
interface ConditionalGroupNode {
  type: "conditionalGroup";
  /** 분기 기준 prop */
  prop: string;
  /** prop 값 → 해당 모드에서 렌더링할 자식들 */
  branches: Record<string, UINode[]>;
}
```

UINode 유니온에 추가: `UINode = UIElement | UIText | UISlot | ConditionalGroupNode | ...`

### 변환 로직

UITreeOptimizer에서 layoutModeSwitch annotation이 있는 컨테이너를 찾아:

1. 컨테이너의 자식들을 annotation의 branches 기준으로 그룹핑
2. 모든 모드에 공통으로 존재하는 자식은 그대로 유지
3. 모드별로 다른 자식들을 ConditionalGroupNode로 감싸서 교체

변환 전:
```
Content
├── Leading Icon (visibleCondition: iconOnly === "False")
├── 텍스트 (visibleCondition: iconOnly === "False")
├── Trailing Icon (visibleCondition: iconOnly === "False")
└── Icon (visibleCondition: iconOnly === "True")
```

변환 후:
```
Content
└── ConditionalGroupNode (prop: "iconOnly")
    ├── "False" → [Leading Icon, 텍스트, Trailing Icon]
    └── "True"  → [Icon]
```

---

## 6. CodeEmitter — conditionalGroup 렌더링

### 2분기 (삼항)

```tsx
{iconOnly === "True" ? (
  <Icon />
) : (
  <>
    {leadingIcon && <div>...</div>}
    <span>{label}</span>
    {trailingIcon && <div>...</div>}
  </>
)}
```

### N분기 (즉시 실행 함수 또는 헬퍼)

```tsx
{(() => {
  switch (type) {
    case "Default": return <>{child1}{child2}{child3}</>;
    case "Basic": return <>{child1}{child2}</>;
    case "Minimal": return <>{child1}</>;
  }
})()}
```

또는 object map 패턴:

```tsx
{{ Default: <>{...}</>, Basic: <>{...}</>, Minimal: <>{...}</> }[type]}
```

렌더링 전략은 분기 수에 따라 자동 선택: 2분기 → 삼항, 3분기 이상 → object map.

---

## 7. 마이그레이션 순서

1. DesignPattern 타입 업데이트 (nodeId 필드 추가 + layoutModeSwitch)
2. detect() 시그니처 변경 (raw SceneNode 입력)
3. 기존 5개 패턴 raw 데이터 기반으로 마이그레이션 (booleanPositionSwap 제외)
4. TreeBuilder에서 detect() 호출을 merger 이전으로 이동 + 두 번 호출 제거
5. merger에 patterns 전달 + annotation 복사 로직 추가
6. layoutModeSwitch 감지 구현
7. ConditionalGroupNode UINode type 추가
8. UITreeOptimizer에 모드 전환 변환 로직 추가
9. CodeEmitter(NodeRenderer)에 conditionalGroup 렌더링 추가
10. 기존 테스트 마이그레이션 + 신규 테스트

## 8. 테스트 전략

- 기존 6개 패턴: 감지 테스트를 raw 데이터 mock으로 전환
- layoutModeSwitch: Buttonsolid, Headersub fixture 기반 감지 테스트
- ConditionalGroupNode: UITreeOptimizer 변환 단위 테스트
- 코드 생성: Buttonsolid 렌더링 결과에서 삼항 분기 확인
- 회귀: 전체 fixture 스냅샷 테스트 통과 확인
