# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Figma Plugin that converts Figma design components into React component code. The plugin extracts design data from Figma and compiles it to TypeScript React components with Emotion CSS-in-JS or TailwindCSS styling.

## Build Commands

```bash
npm run build          # Build both plugin + UI
npm run build:plugin   # Build plugin only → dist/code.js
npm run build:ui       # Build UI only → dist/index.html
npm run dev            # Dev server on localhost:5173
```

## Test Commands

```bash
npm run test           # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run test:browser   # Browser tests with Playwright
npm run test:coverage  # Coverage report
```

## Lint/Format

```bash
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

## Architecture

### Two-part Plugin Structure

1. **Backend (Plugin Code)** - `src/backend/`
   - Runs in Figma's plugin sandbox
   - Entry: `FigmaPlugin.ts` - handles selection events, message routing
   - Builds to: `dist/code.js`

2. **Frontend (UI)** - `src/frontend/ui/`
   - React-based UI for preview and code generation
   - Entry: `main.tsx`, `App.tsx`
   - Builds to: `dist/index.html` (single-file bundle)

### Compiler Engine (`src/frontend/ui/domain/compiler/`)

Transforms Figma designs to React code through 6 phases:

1. **Data Loading** - `SpecDataManager` creates HashMaps for O(1) lookup
2. **SuperTree Creation** - `CreateSuperTree` merges Figma Variants into unified tree using IoU-based node matching (≥0.8 threshold)
3. **TempAstTree** - `_TempAstTree` binds props, injects styles, handles visibility/position
4. **FinalAstTree** - `_FinalAstTree` normalizes props, handles external components, slots
5. **Code Generation** - `ReactGenerator` produces TypeScript code via ts.factory AST nodes
6. **Dependency Bundling** - `DependencyManager` recursively compiles dependencies

### Key Manager Classes

```
manager/
├── SpecDataManager.ts           # Data access layer
├── PropsManager.ts              # Props extraction/formatting
├── PropsExtractor.ts            # Extract props from componentPropertyDefinitions
├── InstanceOverrideManager.ts   # INSTANCE override merging
├── VariantEnrichManager.ts      # Variant data enrichment
└── DependencyManager.ts         # External component compilation
```

### Code Generation Pipeline

**새 파이프라인 (권장)**:
```
core/
├── data-preparer/               # Phase 3: 데이터 준비
│   └── DataPreparer.ts
├── tree-builder/                # Phase 4: IR 생성
│   ├── TreeBuilder.ts
│   └── workers/                 # Processor 모듈들
└── code-emitter/                # Phase 5: 코드 생성
    ├── ReactEmitter.ts          # ICodeEmitter 구현
    ├── generators/              # DesignTree용 생성기
    └── style-strategy/          # DesignTree용 전략
```

**레거시 파이프라인 (Engine.ts)**:
```
core/
├── Engine.ts                    # 레거시 오케스트레이터
├── super-tree/                  # Variant 병합
├── ast-tree/                    # TempAst → FinalAst
└── react-generator/             # FinalAstTree → 코드
    └── style-strategy/          # FinalAstTree용 전략
```

## Key Concepts

### Variant Merging
COMPONENT_SET with multiple variants (e.g., Size=Large/Small, State=Default/Hover) gets merged into a single SuperTree. Nodes are matched across variants using IoU (Intersection over Union) position-based similarity - same position ≥0.8 IoU = same node.

### INSTANCE Override IDs
INSTANCE children have compound IDs like `I704:56;704:29;692:1613`. The last segment (`692:1613`) is the original component's node ID.

### Props Transformation
- `State` prop → CSS pseudo-classes (`:hover`, `:active`, `:disabled`)
- Boolean props controlling INSTANCE visibility → Slot props (`React.ReactNode`)
- `componentPropertyReferences` → prop bindings

### Style Strategy Pattern
`StyleStrategy` interface allows switching between Emotion CSS-in-JS and TailwindCSS output.

## Testing

- Unit tests: `test/compiler/` - Tests for compiler logic
- Fixtures: `test/fixtures/` - JSON test data from Figma
- Browser tests: vitest with Playwright

## Tech Stack

- React 19, TypeScript 5.3, Vite 7
- Figma Plugin API
- TailwindCSS v4 + Emotion CSS-in-JS
- vitest for testing
- Node.js ≥22.0.0 required

## Documentation

Detailed technical docs in `docs/`:
- `COMPILER_ENGINE.md` - Architecture and algorithms
- `COMPILE_PIPELINE.md` - Phase-by-phase pipeline walkthrough



다음 워크플로우를 따를 것:

### 1. 문제 정의 (코드 수정 금지)
- 문제 현상을 명확하게 정리
- 재현 조건 파악
- 예상 원인 분석
- **이 단계에서는 절대 코드를 수정하지 않음**

### 2. 해결 방안 논의
- 가능한 해결 방법들을 제시
- 각 방법의 장단점 설명
- 사용자와 함께 최적의 방안 결정

### 3. 코드 수정 전 검토
- 수정할 코드와 변경 내용을 사용자에게 미리 보여줌
- 사용자 승인 후에만 코드 수정 진행

### 4. 이슈 문서화
- 해결된 이슈를 markdown 파일에 기록
- 기록 내용: 문제 설명, 원인, 해결 방법, 관련 파일

### 5. 테스트 코드 추가
- 해당 이슈에 대한 회귀 테스트 작성
- 테스트 실행하여 통과 확인

## 서브에이전트 활용 지침 (필수)

**중요**: 아래 조건에 해당하면 사용자가 요청하지 않아도 **반드시** 해당 서브에이전트를 먼저 실행할 것. 직접 작업하지 말고 서브에이전트에게 위임할 것.

### 필수 서브에이전트 (조건 충족 시 자동 실행)

#### browser-validator (브라우저 검증)
**트리거 조건** - 아래 중 하나라도 해당하면 즉시 실행:
- 컴파일된 컴포넌트의 렌더링 결과 확인 필요
- Figma 원본과 비교 필요
- 스타일 값이 올바른지 확인 필요
- `/test` 라우터에서 테스트 수행
- "렌더링", "화면", "보이는", "안보이는" 등 시각적 이슈 언급

**필수 수행 사항**:
- 스크린샷 촬영 전 **반드시 스크롤하여 전체 컨텐츠 확인**
- 화면 밖에 잘린 요소가 있는지 확인 (overflow, 큰 gap 등)
- fullPage 옵션으로 전체 페이지 캡처 권장
- 요소가 안보이면 스크롤/리사이즈 후 재확인

#### compiler-debugger (컴파일러 디버깅)
**트리거 조건** - 아래 중 하나라도 해당하면 즉시 실행:
- 컴파일 실패 또는 오류 발생
- AST 트리 분석 필요
- 6단계 파이프라인 추적 필요
- slot, props, SuperTree 관련 이슈
- "왜 이렇게 생성됐는지", "원인 분석" 필요

#### issue-closer (이슈 문서화)
**트리거 조건** - 아래 중 하나라도 해당하면 즉시 실행:
- 컴파일러 이슈가 해결됨
- 회귀 테스트 추가 필요
- 해결된 버그 문서화 필요

## 리팩토링 진행 상태

### 새 아키텍처 파이프라인
```
FigmaNodeData → DataPreparer → PreparedDesignData → TreeBuilder → DesignTree → CodeEmitter → 코드
```

### 완료된 Phase
- ✅ Phase 1: 타입 정의 (`types/architecture.ts`)
- ✅ Phase 2: DependencyAnalyzer
- ✅ Phase 3: DataPreparer
- ✅ Phase 4: TreeBuilder (`core/tree-builder/`)
- ✅ Phase 5: CodeEmitter (새 generators 구현 완료)

### Phase 5 완료 상태

**새 아키텍처 (code-emitter/)**:
```
code-emitter/
├── ReactEmitter.ts              # ICodeEmitter 구현체 (직접 코드 생성)
├── generators/
│   ├── ImportsGenerator.ts      # React/스타일 import 생성
│   ├── InterfaceGenerator.ts    # Props interface + type aliases
│   ├── StylesGenerator.ts       # StyleStrategy 위임
│   └── ComponentGenerator.ts    # JSX 트리 + 함수 컴포넌트
└── style-strategy/
    ├── IStyleStrategy.ts        # DesignTree용 인터페이스
    ├── EmotionStyleStrategy.ts  # css() 함수 + Record 객체
    └── TailwindStyleStrategy.ts # className + cn() 유틸리티
```

**레거시 유지 (Engine.ts에서 사용)**:
- `react-generator/` - FinalAstTree 기반 코드 생성기
- 레거시 경로: SuperTree → FinalAstTree → ReactGenerator → 코드

**다음 단계**:
1. Engine.ts를 새 파이프라인(DataPreparer → TreeBuilder → ReactEmitter)으로 마이그레이션
2. FigmaCodeGenerator 업데이트
3. 레거시 react-generator/ 폴더 삭제

자세한 아키텍처 문서: `docs/ARCHITECTURE.md`
