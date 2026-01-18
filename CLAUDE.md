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
