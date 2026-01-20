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

```
core/
├── Engine.ts                    # Pipeline orchestration
├── NodeMatcher.ts               # IoU-based node matching
├── ArraySlotDetector.ts         # Detect repeated INSTANCEs for .map() rendering
├── super-tree/                  # Variant merging
├── ast-tree/                    # AST tree creation
└── react-generator/
    ├── ReactGenerator.ts
    ├── generate-imports/
    ├── generate-interface/
    ├── generate-styles/
    ├── generate-component/
    └── style-strategy/          # Emotion/Tailwind strategies
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

## 서브에이전트 활용 지침

설정된 서브에이전트는 해당 작업이 필요할 때 **자동으로 사용**할 것. 사용자가 요청하기 전에 proactively 활용.

### 필수 서브에이전트
- **browser-validator**: 컴파일된 React 컴포넌트의 브라우저 렌더링 검증 시 사용
  - Figma 원본과 렌더링 결과 비교
  - 스타일 값 확인, 시각적 비교
  - `/test` 라우터에서 테스트 실행
- **compiler-debugger**: 컴파일러 오류 분석 및 디버깅
  - 컴파일 실패, AST 트리 문제, 6단계 파이프라인 추적
- **issue-closer**: 해결된 컴파일러 이슈 문서화 및 회귀 테스트 추가
