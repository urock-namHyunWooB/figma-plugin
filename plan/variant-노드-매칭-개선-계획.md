# Variant 노드 매칭 개선 계획

## 현재 방식의 문제

### 현재 매칭 로직 (`VariantProcessor.isSameInternalNode`)

1. 타입 일치 확인
2. ID 동일 여부
3. **정규화된 위치 비교** (variant 루트 기준 0~1 범위, ±0.1 허용) ← 주요 매칭
4. TEXT 노드만 이름 기반 폴백
5. squash 후처리 (IoU ≥ 0.5)

### 문제점

- **위치라는 단일 신호에 의존**: auto-layout에서 요소가 숨겨지면 나머지 노드의 위치가 밀려서 매칭 실패
- **여러 prop이 동시에 다른 variant를 비교**: 변화가 겹쳐서 어떤 차이가 어떤 prop 때문인지 구분 불가
- squash 후처리도 위치(IoU) 기반이라, 위치가 틀리면 둘 다 실패

### 위치/이름/순서 기반 매칭의 한계

단일 신호로는 모든 케이스를 커버할 수 없다:

- **위치**: auto-layout에서 요소 숨김 시 나머지가 밀려서 실패
- **이름**: 같은 이름의 노드가 여러 개면 구분 불가
- **sibling index**: 요소가 빠지면 인덱스가 밀려서 오매칭
- **트리 구조 (visible:false 포함)**: 위치는 여전히 밀린 값이고, Figma API로 prop을 바꿔 재렌더링할 수 없음

---

## 개선 방안: 1-prop 차이 기반 매칭

### 핵심 아이디어

모든 variant를 한꺼번에 비교하는 대신, **prop 하나만 다른 variant 쌍끼리 비교**하여 변화를 격리한다. 그 결과를 이행적(transitive)으로 연결하면 전체 variant 간 매핑이 확보된다.

### 원리

COMPONENT_SET의 variant 이름은 `"State=Default, hasIcon=true"` 형식으로, prop 파싱이 가능하다.

```
Variant A: State=Default, hasIcon=true   → [Icon, Label, Badge]
Variant B: State=Default, hasIcon=false  → [Label, Badge]
Variant C: State=Hover,   hasIcon=true   → [Icon, Label, Badge]
Variant D: State=Hover,   hasIcon=false  → [Label, Badge]
```

- A↔B: hasIcon만 다름 → Icon이 빠진 것, 나머지 소거법으로 매칭
- A↔C: State만 다름 → 레이아웃 동일, 스타일만 변화 → 매칭 용이
- B↔D: A를 경유하여 이행적(transitive) 매칭

### 1-prop 차이일 때 매칭이 쉬운 이유

prop 하나만 다르면, 변화의 범위와 종류가 제한된다:

| Prop 종류 | 변화 내용 | 매칭 난이도 |
|-----------|----------|------------|
| State (Default→Hover) | 스타일만 변화, 레이아웃 동일 | 쉬움 (구조 동일) |
| Boolean (true→false) | 노드 1개 숨김/제거 | 쉬움 (차이 1개 노드) |
| Size (Large→Small) | 비례 변화 | 보통 (구조 동일, 비율 변화) |
| Instance swap | INSTANCE 교체 | 쉬움 (위치 동일) |

여러 prop이 동시에 다를 때 발생하는 "변화 겹침" 문제가 원천적으로 없다.

### 이행적 연결

```
variant 그래프 (노드=variant, 엣지=1-prop 차이):

  A ─── B
  │     │
  C ─── D

A↔B 매핑 + A↔C 매핑 → B↔C 매핑 자동 확보 (A 경유)
```

모든 variant가 1-prop 차이 경로로 연결되면, 전체 매핑이 확보된다.

### 빈칸(missing variant) 처리

variant 매트릭스에 빈칸이 있어 그래프가 끊기는 경우, 단계적으로 허용 범위를 넓힌다:

```
1순위: 1-prop 차이 쌍으로 매칭 (가장 정확)
2순위: 2-prop 차이 쌍으로 매칭 (1순위로 커버 안 되는 경우)
3순위: 현재의 위치 기반 휴리스틱 (최후 폴백)
```

---

## 구현 단계

### Step 1: Prop 파싱 및 variant 그래프 구축

- variant 이름에서 prop key-value 파싱
- 1-prop 차이 쌍을 엣지로 하는 variant 그래프 생성
- 연결 컴포넌트 분석 (끊기는 경우 2-prop 차이 엣지 추가)

**신규 코드**: prop 파서, variant 그래프 빌더

### Step 2: 1-prop 차이 기반 병합 순서 결정

현재 `mergeVariants()`는 variant 배열 순서대로 순차 병합한다. 이를 variant 그래프의 BFS/DFS 순서로 변경하여, 항상 1-prop 차이 쌍끼리 병합되도록 한다.

**변경 대상**: `VariantProcessor.mergeVariants()`의 병합 순서 로직

### Step 3: 1-prop 차이 쌍 전용 매칭 로직

1-prop 차이 쌍에서는 변화가 격리되어 있으므로, 기존 위치 기반 매칭보다 정확한 매칭이 가능하다:

- **State prop 차이**: 구조 동일 → 기존 위치 매칭으로 충분
- **Boolean prop 차이**: 노드 추가/제거 1개 → 소거법으로 매칭
- **Size prop 차이**: 구조 동일, 비례 변화 → 기존 위치 매칭으로 충분

**변경 대상**: `VariantProcessor.isSameInternalNode()`, `VariantProcessor.mergeTree()`

### Step 4: 폴백 체계 정리

```
매칭 시도 순서:
1. 1-prop 차이 기반 매칭 (변화 격리)
2. 2-prop 차이 기반 매칭 (그래프 끊김 시)
3. 정규화 위치 비교 ±0.1 (최후 폴백)
4. IoU squash ≥0.5 (최후 폴백)
```

---

## 기대 효과

- **auto-layout 밀림 문제 해결**: 1-prop 차이로 비교 범위를 제한하여, 변화가 격리된 상태에서 매칭
- **복합 prop 변화 대응**: 이행적 연결로 여러 prop이 다른 variant 간에도 정확한 매핑 확보
- **하위 호환**: 기존 위치 기반 로직은 폴백으로 유지, 점진적 개선 가능
