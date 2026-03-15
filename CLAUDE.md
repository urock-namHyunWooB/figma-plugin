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
FigmaNodeData → DataPreparer → PreparedDesignData → TreeBuilder → UITree → CodeEmitter → Code
```

```
layers/
├── data-manager/                # Layer 1: Data preparation
│   └── DataPreparer.ts
├── tree-manager/                # Layer 2: IR generation (heuristic-based)
│   ├── tree-builder/
│   │   ├── TreeBuilder.ts       # Returns UITree
│   │   ├── processors/          # Processor modules
│   │   └── heuristics/          # Score-based component matching
└── code-emitter/                # Layer 3: Code generation
    ├── ReactEmitter.ts          # ICodeEmitter implementation
    ├── generators/              # UITree → code generators
    └── style-strategy/          # Emotion/Tailwind strategies
```

### Key Manager Classes

```
manager/
├── SpecDataManager.ts           # Data access layer (HashMap for O(1) lookup)
├── PropsManager.ts              # Props extraction/formatting
├── PropsExtractor.ts            # Extract props from componentPropertyDefinitions
├── InstanceOverrideManager.ts   # INSTANCE override merging
├── VariantEnrichManager.ts      # Variant data enrichment
└── DependencyManager.ts         # External component compilation
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

Detailed technical docs in `docs/`:
- `ARCHITECTURE.md` - New pipeline architecture
- `COMPILER_ENGINE.md` - Architecture and algorithms

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

**compiler-debugger**: Use when compilation fails, AST tree analysis is needed, 6-phase pipeline tracing is required, or investigating slot/props/SuperTree issues.

**issue-closer**: Use when a compiler issue is resolved and needs documentation with regression tests.

## Refactoring Status

All 5 phases of the new architecture are complete:
- ✅ Phase 1: Type definitions (`types/architecture.ts`)
- ✅ Phase 2: DependencyAnalyzer
- ✅ Phase 3: DataPreparer
- ✅ Phase 4: TreeBuilder
- ✅ Phase 5: CodeEmitter

**Completed Milestones**:
- ✅ Engine.ts → NewEngine.ts 마이그레이션 완료
- ✅ FigmaCodeGenerator 새 파이프라인 사용
- ✅ 레거시 폴더 제거 (react-generator/, super-tree/, ast-tree/)
- ✅ 휴리스틱 중심 아키텍처 구현 (점수 기반 매칭)
