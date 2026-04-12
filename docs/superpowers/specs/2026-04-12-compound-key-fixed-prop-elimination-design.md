# Compound Key 고정 Prop 제거

## 문제

conditionalGroup branch 안에서 스타일 키에 불필요한 prop이 포함됨.

예: `iconOnly ? (A) : (B)` 분기의 A 안에서, 12개 variant가 전부 `iconOnly=True`인데 스타일 키가 `variant+size+iconOnly+disable` 4차원으로 생성됨.

`iconOnly`는 분기에서 이미 정해진 값이므로 키에 넣을 필요 없음.

### 현재 생성 코드

```tsx
// 스타일 맵: iconOnly 자리가 전부 "false"
"Primary+Large+false+false": css`...`,
"Primary+Large+false+true": css`...`,
"Primary+Medium+false+false": css`...`,
...

// lookup: iconOnly가 불필요하게 포함
styles[`${variant}+${size}+${iconOnly ? "true" : "false"}+${disable ? "true" : "false"}`]
```

### 기대 결과

```tsx
// 스타일 맵: iconOnly 차원 없음
"Primary+Large+false": css`...`,
"Primary+Large+true": css`...`,
"Primary+Medium+false": css`...`,
...

// lookup: iconOnly 제거됨
styles[`${variant}+${size}+${disable ? "true" : "false"}`]
```

## 원인

1. `createConditionFromVariantName`이 variant 이름의 모든 key=value를 AND 조건으로 만듦
2. `DynamicStyleDecomposer.decomposeMultiProp` Step 2에서 prop 이름을 모을 때, 값 종류가 1개뿐인 prop도 제외하지 않음

## 해결 방법

**수정 위치:** `DynamicStyleDecomposer.ts` — `decomposeMultiProp` 메서드의 Step 2

**변경 내용:**

Step 1(matrix 구성)과 Step 2(allProps 수집) 사이에서:

1. 각 prop별로 등장하는 값 종류를 수집
2. 값 종류가 1개뿐인 prop을 식별
3. 해당 prop을 allProps에서 제외
4. 각 matrix entry의 propValues에서도 해당 prop 제거

```typescript
// Step 2 수정안
const propDistinctValues = new Map<string, Set<string>>();
for (const entry of matrix) {
  for (const [propName, propValue] of entry.propValues) {
    if (!propDistinctValues.has(propName)) {
      propDistinctValues.set(propName, new Set());
    }
    propDistinctValues.get(propName)!.add(propValue);
  }
}

// 값 종류가 1개뿐인 prop 제거
const fixedProps = new Set<string>();
for (const [propName, values] of propDistinctValues) {
  if (values.size <= 1) {
    fixedProps.add(propName);
  }
}

// matrix에서 고정 prop 제거
for (const entry of matrix) {
  for (const prop of fixedProps) {
    entry.propValues.delete(prop);
  }
}

// 기존 allProps 수집 (고정 prop 제외됨)
const allProps: string[] = [];
const propSet = new Set<string>();
for (const entry of matrix) {
  for (const propName of entry.propValues.keys()) {
    if (!propSet.has(propName)) {
      propSet.add(propName);
      allProps.push(propName);
    }
  }
}
```

## 영향 범위

- conditionalGroup branch 안: 고정된 branchProp이 키에서 제거됨 (의도한 효과)
- 일반 노드: 모든 variant에서 동일한 값의 prop이 있으면 역시 제거됨 (부작용 아닌 정상 최적화)

## 테스트

- 기존 테스트: `test/compiler/test-buttonsolid-conditional-group.test.ts`에 compound 키 검증 assert 추가
- 기대: branch 안 스타일 키에 `iconOnly`가 포함되지 않음

## 관련 파일

- `src/.../post-processors/DynamicStyleDecomposer.ts` — 수정 대상
- `test/compiler/test-buttonsolid-conditional-group.test.ts` — 테스트 보강
