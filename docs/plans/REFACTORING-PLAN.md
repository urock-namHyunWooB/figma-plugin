# Domain Layer Refactoring Plan

> Analysis Date: 2025-02-06
> Target: `src/frontend/ui/domain/`
> Overall Health Score: **7.5/10**

## Executive Summary

`src/frontend/ui/domain/` 디렉토리는 80개의 TypeScript 파일, 20,000+ 라인의 코드로 구성되어 있습니다. 5단계 컴파일러 파이프라인 아키텍처는 우수하나, 일부 기술 부채가 존재합니다.

### Key Findings

| Category | Status | Priority |
|----------|--------|----------|
| SpecDataManager/PreparedDesignData 중복 | Critical | P1 |
| 테스트 커버리지 부족 | High | P1 |
| 대형 클래스 분리 | Medium | P2 |

---

## 1. SpecDataManager vs PreparedDesignData 통합

### 1.1 Current State

두 클래스가 **거의 동일한 역할**을 수행하고 있어 중복이 발생합니다.

#### 기능 비교

| Feature | SpecDataManager (346줄) | PreparedDesignData |
|---------|------------------------|-------------------|
| 노드 조회 | `specHashMap[id]` (Record) | `nodeMap.get(id)` (Map) |
| 스타일 조회 | `renderTreeHashMap[id]` | `styleMap.get(id)` |
| 이미지 URL 조회 | `getImageUrlByNodeId()` | `getImageUrlByNodeId()` |
| 이미지 플레이스홀더 교체 | `_replaceImagePlaceholders()` | `_replaceImagePlaceholders()` |
| SVG 조회 | `getVectorSvgByNodeId()` | `getVectorSvgByNodeId()` |
| 데이터 구조 | Record (Object) | Map |

#### 사용처 분석

**SpecDataManager** (Legacy):
- `FigmaCodeGenerator.ts` - 진입점
- `manager/PropsManager.ts`
- `manager/PropsExtractor.ts`
- `manager/VariantEnrichManager.ts`
- `manager/InstanceOverrideManager.ts`
- `manager/DependencyManager.ts`
- `core/NodeMatcher.ts`

**PreparedDesignData** (New Pipeline):
- `core/data-preparer/DataPreparer.ts`
- `core/tree-builder/TreeBuilder.ts`
- `core/code-emitter/ReactEmitter.ts`

### 1.2 Duplicated Code Example

```typescript
// SpecDataManager.ts:60-92
private _replaceImagePlaceholders(nodeId: string, renderTree: RenderTree): RenderTree {
  const imageUrl = this.getImageUrlByNodeId(nodeId);
  if (!imageUrl) return renderTree;
  const cssStyle = { ...renderTree.cssStyle };
  if (cssStyle.background?.includes("<path-to-image>")) {
    cssStyle.background = cssStyle.background.replace("<path-to-image>", imageUrl);
  }
  // ... identical logic in PreparedDesignData
}
```

### 1.3 SpecDataManager Unique Methods

`PreparedDesignData`에 없는 `SpecDataManager` 전용 메서드:

```typescript
// 마이그레이션 필요
getDependenciesGroupedByComponentSet(): Record<string, {...}>
mergeInstanceVectorSvgs(instanceId: string): string | undefined
getVectorSvgsByInstanceId(instanceId: string): {...}[]
getFirstVectorSvgByInstanceId(instanceId: string): string | undefined
getComponentPropertyDefinitions()
getComponentProperties()
getRootNodeType()
```

### 1.4 Migration Strategy

#### Option A: Adapter Pattern (권장)

`SpecDataManager`가 내부적으로 `PreparedDesignData`를 위임하도록 수정:

```typescript
class SpecDataManager {
  private preparedData: PreparedDesignData;

  constructor(spec: FigmaNodeData) {
    this.preparedData = DataPreparer.prepare(spec);
  }

  getSpecById(id: string) {
    return this.preparedData.getNodeById(id);
  }

  // SpecDataManager 전용 메서드는 유지
  getDependenciesGroupedByComponentSet() { ... }
}
```

**장점**: 기존 코드 변경 최소화
**단점**: 중간 레이어 추가

#### Option B: Direct Migration

Manager 레이어가 직접 `PreparedDesignData`를 받도록 수정:

```typescript
// Before
class PropsManager {
  constructor(private specDataManager: SpecDataManager) {}
}

// After
class PropsManager {
  constructor(private data: PreparedDesignData) {}
}
```

**장점**: 클린 아키텍처
**단점**: 변경 범위 큼

### 1.5 Action Items

- [ ] `PreparedDesignData`에 누락된 메서드 추가
- [ ] `SpecDataManager` → Adapter 패턴 적용
- [ ] Manager 레이어 점진적 마이그레이션
- [ ] `SpecDataManager` deprecation 표시

---

## 2. Test Coverage Improvement

### 2.1 Current State

핵심 모듈들의 단위 테스트가 부재합니다.

| File | Lines | Test Coverage |
|------|-------|---------------|
| `VariantProcessor.ts` | 968 | ❌ None |
| `SlotProcessor.ts` | 655 | ❌ None |
| `stringUtils.ts` (workers) | 97 | ❌ None |
| `stringUtils.ts` (utils) | 26 | ❌ None |
| `SpecDataManager.ts` | 346 | ❌ None |
| `BuildContext.ts` | 67 | ❌ None |
| `CleanupProcessor.ts` | ~100 | ❌ None |
| `NodeConverter.ts` | 253 | ❌ None |

### 2.2 Risk Analysis

#### High Risk Areas

1. **IoU Calculation** (`VariantProcessor.ts`)
   - 임계값: `IOU_THRESHOLD = 0.8`, `SQUASH_IOU_THRESHOLD = 0.5`
   - 엣지 케이스: 0 크기 박스, 겹치지 않는 박스
   - 버그 발생 시 variant 병합 실패

2. **String Transformation** (`stringUtils.ts`)
   - 숫자로 시작하는 문자열 → `_` 접두사
   - 특수문자/공백 처리
   - 버그 발생 시 잘못된 prop/컴포넌트 이름 생성

3. **Slot Detection** (`SlotProcessor.ts`)
   - visibility-pattern 감지 조건
   - array slot 감지 조건
   - 버그 발생 시 slot 누락 또는 오감지

### 2.3 Recommended Test Cases

#### stringUtils.test.ts

```typescript
import { toCamelCase, toPascalCase, toKebabCase, toValidIdentifier } from './stringUtils';

describe('toCamelCase', () => {
  it('converts space-separated words', () => {
    expect(toCamelCase('Show Icon')).toBe('showIcon');
  });

  it('converts already camelCase (lowercase first char only)', () => {
    expect(toCamelCase('RightIcon')).toBe('rightIcon');
    expect(toCamelCase('withLabel')).toBe('withLabel');
  });

  it('handles special characters', () => {
    expect(toCamelCase('Header/Sub')).toBe('headerSub');
    expect(toCamelCase('button-primary')).toBe('buttonPrimary');
  });

  it('adds underscore prefix for numeric start', () => {
    expect(toCamelCase('063112')).toBe('_063112');
    expect(toCamelCase('123Text')).toBe('_123Text');
  });

  it('handles empty string', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('toPascalCase', () => {
  it('converts to PascalCase', () => {
    expect(toPascalCase('button primary')).toBe('ButtonPrimary');
  });
});

describe('toKebabCase', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebabCase('ShowIcon')).toBe('show-icon');
    expect(toKebabCase('buttonPrimary')).toBe('button-primary');
  });
});
```

#### iouCalculation.test.ts

```typescript
import { calculateIoU } from './VariantProcessor';

describe('calculateIoU', () => {
  it('returns 1 for identical boxes', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(calculateIoU(box, box)).toBe(1);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const box1 = { x: 0, y: 0, width: 100, height: 100 };
    const box2 = { x: 200, y: 200, width: 100, height: 100 };
    expect(calculateIoU(box1, box2)).toBe(0);
  });

  it('calculates partial overlap correctly', () => {
    const box1 = { x: 0, y: 0, width: 100, height: 100 };
    const box2 = { x: 50, y: 50, width: 100, height: 100 };
    // Intersection: 50x50 = 2500
    // Union: 10000 + 10000 - 2500 = 17500
    // IoU: 2500 / 17500 ≈ 0.143
    expect(calculateIoU(box1, box2)).toBeCloseTo(0.143, 2);
  });

  it('handles zero-size boxes', () => {
    const box1 = { x: 0, y: 0, width: 0, height: 0 };
    const box2 = { x: 0, y: 0, width: 0, height: 0 };
    expect(calculateIoU(box1, box2)).toBe(1); // Same position
  });
});
```

### 2.4 Action Items

- [ ] `test/compiler/unit/` 디렉토리 생성
- [ ] `stringUtils.test.ts` 작성
- [ ] `iouCalculation.test.ts` 작성
- [ ] `SlotProcessor.test.ts` 작성
- [ ] CI에 테스트 커버리지 임계값 설정 (예: 70%)

---

## 3. Large Class Decomposition

### 3.1 VariantProcessor.ts (968줄)

#### Current Structure

```
VariantProcessor.ts (968줄)
├── Class: VariantProcessor
│   ├── Static: merge()
│   ├── Public: mergeVariants()
│   ├── Public: convertToInternalNode()
│   ├── Public: calculateIoU()
│   ├── Public: isSameNode()
│   ├── Public: squashByIou()
│   ├── Public: squashWithFunction()
│   ├── Private: mergeTree()
│   ├── Private: getAllNodesOfType()
│   ├── Private: getNodesAtDepth()
│   ├── Private: isSameInternalNode()
│   ├── Private: getNormalizedPosition()
│   ├── Private: getNormalizedY()
│   ├── Private: buildNodeToVariantRootMap()
│   ├── Private: findOriginalRoot()
│   ├── Private: getRoot()
│   ├── Private: getIouFromRoot()
│   ├── Private: flattenWrapperFrames()
│   ├── Private: flattenFrame()
│   ├── Private: mergeFrameInto()
│   └── Private: isSamePositionY()
│
└── Standalone Functions
    ├── getRelativeBounds()
    ├── calculateIoU()
    ├── calculateIouFromBounds()
    ├── groupNodesByType()
    ├── findSquashGroups()
    ├── isValidSquashGroup()
    ├── isAncestorDescendant()
    ├── performSquash()
    └── calculateIouFromRoot()
```

#### Proposed Structure

```
core/tree-builder/workers/
├── VariantProcessor.ts (~400줄)
│   ├── merge()
│   ├── mergeVariants()
│   ├── mergeTree()
│   └── convertToInternalNode()
│
├── utils/
│   ├── iouUtils.ts (~200줄)
│   │   ├── calculateIoU()
│   │   ├── calculateIouFromBounds()
│   │   ├── calculateIouFromRoot()
│   │   └── getRelativeBounds()
│   │
│   ├── squashUtils.ts (~150줄)
│   │   ├── groupNodesByType()
│   │   ├── findSquashGroups()
│   │   ├── isValidSquashGroup()
│   │   ├── isAncestorDescendant()
│   │   └── performSquash()
│   │
│   └── frameFlattenUtils.ts (~170줄)
│       ├── flattenWrapperFrames()
│       ├── flattenFrame()
│       ├── mergeFrameInto()
│       └── isSamePositionY()
```

### 3.2 SlotProcessor.ts (655줄)

#### Current Structure

```
SlotProcessor.ts (655줄)
├── Static Pipeline Methods
│   ├── detectTextSlots()
│   ├── detectSlots()
│   ├── detectArraySlots()
│   ├── enrichArraySlotsWithComponentNames()
│   └── extractItemPropsFromDependencies()
│
├── SlotDetector Methods (ISlotDetector)
│   ├── shouldConvertToSlot()
│   ├── extractSlotDefinition()
│   ├── detectArraySlot()
│   └── findSlotCandidates()
│
├── TextSlotDetector Methods (ITextSlotDetector)
│   ├── shouldBeTextSlot()
│   ├── shouldConvertToTextSlot()
│   ├── generateTextPropName()
│   ├── getDefaultTextValue()
│   ├── detectTextSlot()
│   └── extractDefaultTextContent()
│
└── Private Helpers
    └── normalizeSlotName()
```

#### Proposed Structure

```
core/tree-builder/workers/
├── SlotProcessor.ts (~200줄)
│   ├── detectSlots()
│   ├── findSlotCandidates()
│   ├── shouldConvertToSlot()
│   └── extractSlotDefinition()
│
├── TextSlotProcessor.ts (~150줄)
│   ├── detectTextSlots()
│   ├── shouldBeTextSlot()
│   ├── generateTextPropName()
│   ├── getDefaultTextValue()
│   └── extractDefaultTextContent()
│
└── ArraySlotProcessor.ts (~120줄)
    ├── detectArraySlots()
    ├── detectArraySlot()
    ├── enrichArraySlotsWithComponentNames()
    └── extractItemPropsFromDependencies()
```

### 3.3 Decomposition Benefits

| Benefit | Description |
|---------|-------------|
| Testability | 작은 단위로 분리하여 단위 테스트 작성 용이 |
| SRP | 단일 책임 원칙 준수 |
| Reusability | IoU 계산 등 유틸리티 재사용 가능 |
| Maintainability | 관심사 분리로 수정 영향 범위 축소 |

### 3.4 Decomposition Risks

| Risk | Mitigation |
|------|------------|
| 기존 인터페이스 (`IVariantMerger`, `ISlotDetector`) 구현 유지 필요 | 메인 클래스가 위임 패턴으로 유틸 호출 |
| 파일 수 증가 | 명확한 디렉토리 구조로 관리 |
| Import 복잡도 증가 | Barrel export (`index.ts`) 활용 |

### 3.5 Action Items

- [ ] `iouUtils.ts` 분리 및 테스트 작성
- [ ] `squashUtils.ts` 분리 및 테스트 작성
- [ ] `TextSlotProcessor.ts` 분리 고려
- [ ] `ArraySlotProcessor.ts` 분리 고려

---

## 4. Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

| Task | Priority | Effort |
|------|----------|--------|
| `stringUtils.test.ts` 작성 | P1 | Low |
| `iouUtils.ts` 분리 + 테스트 | P1 | Low |
| 문서화: BuildContext 필드별 역할 | P2 | Low |

### Phase 2: Test Coverage (3-5 days)

| Task | Priority | Effort |
|------|----------|--------|
| `SlotProcessor.test.ts` 작성 | P1 | Medium |
| `VariantProcessor.test.ts` 작성 | P1 | Medium |
| `SpecDataManager.test.ts` 작성 | P2 | Medium |

### Phase 3: Architecture Improvement (1-2 weeks)

| Task | Priority | Effort |
|------|----------|--------|
| `PreparedDesignData` 누락 메서드 추가 | P1 | Medium |
| `SpecDataManager` Adapter 패턴 적용 | P1 | High |
| Manager 레이어 마이그레이션 | P2 | High |

### Phase 4: Optional Refactoring (As needed)

| Task | Priority | Effort |
|------|----------|--------|
| `VariantProcessor` 대형 클래스 분리 | P3 | High |
| `SlotProcessor` 대형 클래스 분리 | P3 | High |

---

## 5. Architecture Strengths (No Change Needed)

분석 결과 아래 항목들은 현재 상태로 **문제 없음**:

| Item | Initial Assessment | Actual Status |
|------|-------------------|---------------|
| String Utils 중복 | Critical | ✅ 다른 함수들, 역할 분담 명확 |
| BuildContext 과다 상태 | Needs Improvement | ✅ Phase별 주석 + readonly 사용 |
| PropsManager 레거시 | Wrapper | ✅ 실질적인 슬롯 추출 로직 포함 |
| 순환 의존성 | - | ✅ 없음 |
| Strategy Pattern | - | ✅ Emotion/Tailwind 확장성 우수 |
| 5-Phase Pipeline | - | ✅ 클린 아키텍처 |

---

## Appendix

### A. File Locations

```
src/frontend/ui/domain/compiler/
├── core/
│   ├── data-preparer/
│   │   ├── DataPreparer.ts
│   │   └── PreparedDesignData.ts      # New pipeline data structure
│   ├── tree-builder/
│   │   ├── TreeBuilder.ts
│   │   └── workers/
│   │       ├── VariantProcessor.ts    # 968 lines - decomposition target
│   │       ├── SlotProcessor.ts       # 655 lines - decomposition target
│   │       ├── BuildContext.ts
│   │       └── utils/
│   │           └── stringUtils.ts     # needs tests
│   └── code-emitter/
│       └── ReactEmitter.ts
├── manager/
│   ├── SpecDataManager.ts             # 346 lines - merge with PreparedDesignData
│   ├── PropsManager.ts
│   ├── PropsExtractor.ts
│   └── ...
└── utils/
    └── stringUtils.ts                 # needs tests
```

### B. Related Documents

- [ARCHITECTURE-NEW-PIPELINE.md](../ARCHITECTURE-NEW-PIPELINE.md)
- [ARCHITECTURE-LEGACY-ENGINE.md](../ARCHITECTURE-LEGACY-ENGINE.md)
