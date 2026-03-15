# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Figma Plugin that converts Figma design components into React component code. The plugin extracts design data from Figma and compiles it to TypeScript React components with Emotion CSS-in-JS or TailwindCSS styling.

## Build Commands

```bash
npm run build          # Build both plugin + UI (development mode)
npm run build:prod     # Build both plugin + UI (production mode)
npm run build:plugin   # Build plugin only → dist/code.js
npm run build:ui       # Build UI only → dist/index.html
npm run dev            # Dev server on localhost:5173
```

## Test Commands

```bash
npm run test                           # Run all tests
npm run test:watch                     # Watch mode
npm run test:browser                   # Browser tests with Playwright
npm run test:coverage                  # Coverage report
npx vitest run path/to/file.test.ts    # Run single test file
npx vitest run -t "test name"          # Run tests matching pattern
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

### Code Generator Pipeline (`src/frontend/ui/domain/code-generator2/layers/`)

**3-Layer Pipeline**:
```
FigmaNodeData → DataManager → TreeManager → CodeEmitter → React Code
                 (Layer 1)     (Layer 2)     (Layer 3)
```

```
layers/
├── data-manager/                # Layer 1: 데이터 접근 (HashMap O(1) lookup)
│   └── DataManager.ts
├── tree-manager/                # Layer 2: IR 생성 (heuristic-based)
│   ├── TreeManager.ts           # Layer 2 오케스트레이터
│   ├── tree-builder/
│   │   ├── TreeBuilder.ts       # Returns UITree
│   │   ├── processors/          # VariantMerger, NodeMatcher, PropsExtractor, SlotProcessor 등
│   │   └── heuristics/          # 점수 기반 컴포넌트 매칭 (14개 + 폴백/모듈)
│   └── post-processors/         # UITree 후처리
│       ├── ComponentPropsLinker.ts  # 외부 컴포넌트 props 연결
│       └── UITreeOptimizer.ts      # FD 분해, 동적 스타일 병합, 미사용 props 제거
└── code-emitter/                # Layer 3: 코드 생성
    ├── react/
    │   ├── ReactEmitter.ts      # ICodeEmitter 구현
    │   ├── generators/          # UITree → JSX/Props/Style 생성
    │   └── style-strategy/      # Emotion/Tailwind 전략 + DynamicStyleDecomposer
    └── ICodeEmitter.ts
```

## Key Concepts

### Variant Merging
COMPONENT_SET with multiple variants (e.g., Size=Large/Small, State=Default/Hover) gets merged into a single InternalTree. Node matching uses:
- **4-Way Position Comparison**: 비례·좌·가운데·우 기준점 비교 (±0.1 threshold)
- **Auto Layout Context Matching**: 왼쪽 형제 type+size 비교로 위치 시프트 보정 (Stage 5.5)
- **Cross-Depth Squash**: 병합 후 IoU ≥ 0.5 기반으로 다른 depth의 중복 노드 통합 (UpdateSquashByIou)

### INSTANCE Override IDs
INSTANCE children have compound IDs like `I704:56;704:29;692:1613`. The last segment (`692:1613`) is the original component's node ID.

### Props Transformation
- `State` prop → CSS pseudo-classes (`:hover`, `:active`, `:disabled`)
- Boolean props controlling INSTANCE visibility → Slot props (`React.ReactNode`)
- `componentPropertyReferences` → prop bindings

### Style Strategy Pattern
`StyleStrategy` interface allows switching between Emotion CSS-in-JS and TailwindCSS output.

## Testing

- **Unit tests**: `test/compiler/` - Compiler logic tests
- **Fixtures**: `test/fixtures/` - JSON test data exported from Figma
- **Browser tests**: `test/compiler/browser/` - Playwright-based visual tests
- Tests use fixture JSON files that represent Figma node data

## Tech Stack

- React 19, TypeScript 5.3, Vite 7
- Figma Plugin API
- TailwindCSS v4 + Emotion CSS-in-JS
- vitest for testing
- Node.js ≥22.0.0 required

## Documentation

Detailed technical docs in `docs/guide/`:
- `0-architecture/pipeline-overview.md` - 파이프라인 아키텍처 (Layer 1-2, 타입, 디렉토리)
- `2a-variant-merging/merging-algorithm.md` - 변형병합 알고리즘
- `2a-variant-merging/node-matching.md` - 노드 매칭 원리 (4-Way Comparison)
- `2b-props/extraction.md` - Props 추출 (Stage 1-2)
- `2b-props/heuristics.md` - 컴포넌트 Heuristics (Stage 3, 14개 상세)
- `2b-props/style-decomposition.md` - 스타일 분해 (Stage 4-5, DynamicStyleDecomposer)
- `3-code-generation/emitter.md` - 코드 생성 레이어 (ReactEmitter, Generators, StyleStrategy)
- `9-deployment/pipeline.md` - 배포 파이프라인

## Workflow Guidelines

### Problem Solving Workflow
1. **Problem Definition (No Code Changes)**: Clearly identify the problem, reproduction conditions, and expected causes
2. **Solution Discussion**: Present possible solutions with pros/cons, decide with user
3. **Pre-modification Review**: Show proposed changes to user before modifying code
4. **Issue Documentation**: Record resolved issues in markdown (problem, cause, solution, related files)
5. **Add Regression Tests**: Write tests for the resolved issue

### Subagent Usage (Mandatory)

Use these subagents proactively when conditions are met:

**browser-validator**: Use when verifying compiled component rendering, comparing with Figma original, checking style values, or testing on `/test` route. Always scroll to capture full content.

**compiler-debugger**: Use when compilation fails, AST tree analysis is needed, 2-phase 11-step pipeline tracing is required, or investigating slot/props/InternalTree issues.

**issue-closer**: Use when a compiler issue is resolved and needs documentation with regression tests.

## Refactoring Status

3-Layer 파이프라인 마이그레이션 완료. 레거시 코드 전량 제거됨.
- ✅ DataManager (Layer 1) + TreeManager (Layer 2) + CodeEmitter (Layer 3)
- ✅ 휴리스틱 중심 아키텍처 (14개 점수 기반 컴포넌트 매칭 + GenericHeuristic 폴백)
- ✅ DynamicStyleDecomposer pseudo-class 네이티브 분배
- ✅ UITreeOptimizer FD 분해 + diagnostics 수집기 주입
- ✅ 4-Way Position Comparison (NodeMatcher)
- ✅ Auto Layout Context Matching — Stage 5.5 왼쪽 컨텍스트 보정 (NodeMatcher)
- ✅ Cross-Depth Squash (UpdateSquashByIou)
