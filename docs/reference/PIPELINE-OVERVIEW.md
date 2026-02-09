# Code Generator 파이프라인 개요

> **핵심**: Figma 디자인 데이터를 React 컴포넌트 코드로 변환합니다.

## 전체 구조

```
FigmaNodeData
     │
     ▼
┌─────────────┐
│ DataPreparer │  Layer 1: 데이터 준비
└─────────────┘
     │
     ▼
PreparedDesignData
     │
     ▼
┌─────────────┐
│ TreeBuilder  │  Layer 2: IR 생성
└─────────────┘
     │
     ▼
DesignTree
     │
     ▼
┌─────────────┐
│ ReactEmitter │  Layer 3: 코드 생성
└─────────────┘
     │
     ▼
React Code
```

---

## 각 레이어 요약

| Layer | 역할 | 입력 | 출력 |
|-------|-----|------|------|
| **DataPreparer** | 데이터 정규화, HashMap 구축 | FigmaNodeData | PreparedDesignData |
| **TreeBuilder** | 플랫폼 독립적 IR 생성 | PreparedDesignData | DesignTree |
| **ReactEmitter** | React 코드 생성 | DesignTree | React Code |

---

## Layer 1: DataPreparer

> "Figma 원본 데이터를 사용하기 편하게 준비한다"

- 깊은 복사로 원본 보호
- HashMap 구축 (O(1) 조회)
- Props 이름 정규화 (camelCase)

**상세**: [LAYER-1-DATA-PREPARER.md](./LAYER-1-DATA-PREPARER.md)

---

## Layer 2: TreeBuilder

> "Figma 구조를 플랫폼 독립적 IR로 변환한다"

내부적으로 4개 Phase + Heuristics로 구성:

| 단계 | 역할 |
|------|------|
| Phase 1 | variant 병합, props 추출 |
| Phase 2 | 역할 분석, 숨김 조건 |
| Heuristics | 컴포넌트 패턴 감지 |
| Phase 3 | 타입, 스타일, 슬롯, 바인딩 |
| Phase 4 | 최종 DesignNode 트리 조립 |

**상세**:
- [LAYER-2-TREE-BUILDER.md](./LAYER-2-TREE-BUILDER.md) (개요)
- [LAYER-2-TREE-BUILDER-PHASE-1.md](./LAYER-2-TREE-BUILDER-PHASE-1.md)
- [LAYER-2-TREE-BUILDER-PHASE-2.md](./LAYER-2-TREE-BUILDER-PHASE-2.md)
- [LAYER-2-TREE-BUILDER-HEURISTICS.md](./LAYER-2-TREE-BUILDER-HEURISTICS.md)
- [LAYER-2-TREE-BUILDER-PHASE-3.md](./LAYER-2-TREE-BUILDER-PHASE-3.md)
- [LAYER-2-TREE-BUILDER-PHASE-4.md](./LAYER-2-TREE-BUILDER-PHASE-4.md)

---

## Layer 3: ReactEmitter

> "DesignTree를 React/TypeScript 코드로 변환한다"

- Imports 생성
- Props Interface 생성
- 스타일 코드 생성 (Emotion/Tailwind)
- JSX 트리 생성

**상세**: [LAYER-3-CODE-EMITTER.md](./LAYER-3-CODE-EMITTER.md)

---

## 핵심 타입

### FigmaNodeData

Figma API에서 받은 원본 데이터입니다.

### PreparedDesignData

DataPreparer가 정리한 데이터입니다.
- `nodeMap`: O(1) 노드 조회
- `styleMap`: O(1) 스타일 조회
- `props`: 정규화된 Props 정의

### DesignTree

플랫폼 독립적 중간 표현(IR)입니다.
- `root`: DesignNode 트리
- `props`: Props 정의
- `slots`: 슬롯 정의
- `conditionals`: 조건부 렌더링 규칙

### EmittedCode

ReactEmitter가 생성한 코드입니다.
- `code`: 컴포넌트 코드 문자열
- `imports`: import 문 목록
- `componentName`: 컴포넌트 이름

---

## 관련 파일

```
src/frontend/ui/domain/code-generator/
├── core/
│   ├── data-preparer/
│   │   ├── DataPreparer.ts
│   │   └── PreparedDesignData.ts
│   ├── tree-builder/
│   │   ├── TreeBuilder.ts
│   │   ├── workers/
│   │   └── heuristics/
│   └── code-emitter/
│       ├── ReactEmitter.ts
│       ├── generators/
│       └── style-strategy/
└── types/
    └── architecture.ts
```
