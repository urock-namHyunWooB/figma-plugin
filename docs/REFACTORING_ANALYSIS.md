# 프로젝트 리팩토링 분석 보고서

> 인터페이스/구조체/구현체 분리 관점에서의 코드베이스 분석

## 목차

1. [개요](#1-개요)
2. [현재 아키텍처 분석](#2-현재-아키텍처-분석)
3. [핵심 문제점](#3-핵심-문제점)
4. [확장성 문제](#4-확장성-문제)
5. [Props 시스템 분석](#5-props-시스템-분석)
6. [Manager 클래스 결합도](#6-manager-클래스-결합도)
7. [현재 잘 된 부분](#7-현재-잘-된-부분)
8. [리팩토링 계획](#8-리팩토링-계획)

---

## 1. 개요

### 1.1 프로젝트 구조

```
src/
├── backend/                    # Figma 플러그인 백엔드
│   ├── extractors/
│   ├── managers/
│   └── types/
│
└── frontend/ui/domain/compiler/  # 컴파일러 엔진 (핵심)
    ├── core/
    │   ├── Engine.ts
    │   ├── NodeMatcher.ts
    │   ├── ArraySlotDetector.ts
    │   ├── ast-tree/
    │   │   ├── CreateAstTree.ts
    │   │   ├── _TempAstTree.ts
    │   │   └── _FinalAstTree.ts
    │   ├── super-tree/
    │   └── react-generator/
    │       ├── ReactGenerator.ts
    │       ├── generate-imports/
    │       ├── generate-interface/
    │       ├── generate-styles/
    │       ├── generate-component/
    │       └── style-strategy/
    │
    ├── manager/
    │   ├── SpecDataManager.ts
    │   ├── PropsManager.ts
    │   ├── PropsExtractor.ts
    │   ├── InstanceOverrideManager.ts
    │   ├── VariantEnrichManager.ts
    │   ├── DependencyManager.ts
    │   ├── HelperManager.ts
    │   └── TypescriptNodeKitManager.ts
    │
    ├── types/
    │   ├── baseType.ts
    │   └── customType.ts
    │
    └── utils/
```

### 1.2 컴파일 파이프라인

```
FigmaNodeData (입력)
    ↓
[1] SpecDataManager - HashMap 생성, O(1) 조회
    ↓
[2] CreateSuperTree - Variant 병합 (IoU 기반)
    ↓
[3] _TempAstTree - Props 바인딩, 스타일 주입
    ↓
[4] _FinalAstTree - 정규화, 외부 컴포넌트 처리
    ↓
[5] ReactGenerator - TypeScript AST 생성
    ↓
[6] DependencyManager - 의존성 번들링
    ↓
React Component Code (출력)
```

---

## 2. 현재 아키텍처 분석

### 2.1 클래스별 규모

| 클래스 | 라인 수 | 책임 수 | 평가 |
|--------|---------|---------|------|
| `DependencyManager.ts` | 841줄 | 6개 | ⚠️ 분해 필요 |
| `_TempAstTree.ts` | 1,647줄 | 11개 변환 | ⚠️ 분해 필요 |
| `_FinalAstTree.ts` | 38,488+ 토큰 | 9개 변환 | ⚠️ 분해 필요 |
| `SpecDataManager.ts` | 347줄 | 26개 메서드 | ⚠️ 책임 과다 |
| `CreateJsxTree.ts` | 1,000줄+ | 다수 | ⚠️ 분기문 다수 |
| `HelperManager.ts` | 300줄+ | 유틸리티 | ✅ 적절 |
| `PropsExtractor.ts` | 197줄 | Props 추출 | ✅ 적절 |
| `PropsManager.ts` | 183줄 | Props 포맷팅 | ✅ 적절 |

### 2.2 의존성 그래프

```
FigmaCompiler (진입점)
├── SpecDataManager ─────────────────────┐
│   └── (모든 Manager가 의존)            │
├── PropsManager                         │
│   └── PropsExtractor                   │
├── InstanceOverrideManager ←────────────┤
├── VariantEnrichManager ←───────────────┤
├── DependencyManager                    │
│   ├── SpecDataManager ←────────────────┤
│   ├── InstanceOverrideManager          │
│   └── VariantEnrichManager             │
└── Engine                               │
    ├── SpecDataManager ←────────────────┘
    ├── NodeMatcher
    ├── ArraySlotDetector
    ├── CreateSuperTree
    ├── CreateAstTree
    │   ├── _TempAstTree
    │   └── _FinalAstTree
    └── ReactGenerator
        ├── GenerateImports
        ├── GenerateInterface
        ├── GenerateStyles
        └── GenerateComponent
            └── CreateJsxTree
```

---

## 3. 핵심 문제점

### 3.1 Engine의 파이프라인 하드코딩

**위치:** `src/frontend/ui/domain/compiler/core/Engine.ts:28-67`

```typescript
class Engine {
  constructor(root: FigmaCompiler, renderTree: RenderTree, options?: EngineOptions) {
    const specManager = root.SpecDataManager;
    const matcher = new NodeMatcher(specManager);

    // ⚠️ 각 단계를 직접 생성 - 파이프라인 순서 변경 불가
    this.arraySlots = new ArraySlotDetector(root.SpecDataManager.getSpec()).detect();
    this.CreateSuperTree = new CreateSuperTree(renderTree, specManager, matcher);
    this.CreateFinalAstTree = new CreateAstTree(specManager, superNodeTree, refinedProps);
    this.reactGenerator = new ReactGenerator(createFinalAstTree.finalAstTree, ...);
  }
}
```

**문제:**
- 6단계 파이프라인이 생성자에 하드코딩됨
- 단계 추가/제거/교체 시 Engine 클래스 수정 필수
- 테스트 시 개별 단계 mock 불가능
- 파이프라인 순서가 코드에 암시적으로 존재

**개선 방향:**
```typescript
// Pipeline 인터페이스 도입
interface PipelineStage<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput): TOutput;
}

class Pipeline<TIn, TOut> {
  private stages: PipelineStage<any, any>[] = [];

  addStage<TStageIn, TStageOut>(stage: PipelineStage<TStageIn, TStageOut>): this {
    this.stages.push(stage);
    return this;
  }

  execute(input: TIn): TOut {
    return this.stages.reduce((acc, stage) => stage.execute(acc), input as any);
  }
}

// 사용 예시
const pipeline = new Pipeline<FigmaNodeData, string>()
  .addStage(new SuperTreeStage())
  .addStage(new TempAstTreeStage())
  .addStage(new FinalAstTreeStage())
  .addStage(new ReactGeneratorStage());
```

---

### 3.2 _TempAstTree의 과도한 책임

**위치:** `src/frontend/ui/domain/compiler/core/ast-tree/_TempAstTree.ts`

```typescript
// 1,647줄, 11개의 변환 단계가 하나의 클래스에
constructor(specDataManager, superTree, refinedProps) {
  let tempAstTree = this.createTempAstTree(superTree, refinedProps);

  // ⚠️ 11개의 변환 단계가 순차적으로 실행
  tempAstTree = this.updateMergedNode(tempAstTree);
  tempAstTree = new UpdateStyle(specDataManager).updateStyle(tempAstTree);
  tempAstTree = this.updateNormalizeStyle(tempAstTree);
  tempAstTree = this.updateRotatedElements(tempAstTree);
  tempAstTree = this.updateVectorStyles(tempAstTree);
  tempAstTree = this.updateFlexWithPadding(tempAstTree);
  tempAstTree = this.updatePositionStyles(tempAstTree);
  tempAstTree = this.updateVisible(tempAstTree);
  tempAstTree = this.updateConditionalWrapper(tempAstTree);
  tempAstTree = this.updateProps(tempAstTree);
}
```

**문제:**
- 단일 책임 원칙(SRP) 위반 - 11개 변환이 하나의 클래스
- 각 단계 간 의존성 파악 어려움
- 단일 단계 테스트/재사용 불가
- 변환 순서 변경 시 사이드 이펙트 예측 어려움

**개선 방향:**
```typescript
// 각 변환을 독립적인 Transformer로 분리
interface AstTransformer<T = TempAstTree> {
  readonly name: string;
  transform(tree: T, context: TransformContext): T;
}

// 개별 Transformer 구현
class MergedNodeTransformer implements AstTransformer {
  readonly name = "MergedNode";
  transform(tree: TempAstTree, context: TransformContext): TempAstTree {
    // updateMergedNode 로직
  }
}

class RotatedElementTransformer implements AstTransformer {
  readonly name = "RotatedElement";
  transform(tree: TempAstTree, context: TransformContext): TempAstTree {
    // updateRotatedElements 로직
  }
}

class VectorStyleTransformer implements AstTransformer {
  readonly name = "VectorStyle";
  transform(tree: TempAstTree, context: TransformContext): TempAstTree {
    // updateVectorStyles 로직
  }
}

// Transformer 체인
class TempAstTreeBuilder {
  private transformers: AstTransformer[] = [
    new MergedNodeTransformer(),
    new StyleTransformer(),
    new NormalizeStyleTransformer(),
    new RotatedElementTransformer(),
    new VectorStyleTransformer(),
    new FlexPaddingTransformer(),
    new PositionStyleTransformer(),
    new VisibilityTransformer(),
    new ConditionalWrapperTransformer(),
    new PropsTransformer(),
  ];

  build(superTree: SuperTreeNode, context: TransformContext): TempAstTree {
    let tree = this.createInitialTree(superTree);
    for (const transformer of this.transformers) {
      tree = transformer.transform(tree, context);
    }
    return tree;
  }
}
```

---

### 3.3 _FinalAstTree의 과도한 책임

**위치:** `src/frontend/ui/domain/compiler/core/ast-tree/_FinalAstTree.ts`

```typescript
// 38,488+ 토큰, 9개의 후처리 단계
constructor(specDataManager, tempAstTree) {
  let finalAstTree = this.createFinalAstTree(tempAstTree);

  // ⚠️ 9개의 후처리 단계
  finalAstTree = this.updateCleanupNodes(finalAstTree);
  finalAstTree = this._processHiddenNodes(finalAstTree);
  finalAstTree = this.updateMetaData(finalAstTree);
  finalAstTree = this.updateProps(finalAstTree);
  finalAstTree = this.updateExternalComponents(finalAstTree);
  finalAstTree = this.updateSvgFillToColor(finalAstTree, tempAstTree);
  finalAstTree = this.updateOverrideableProps(finalAstTree);
  finalAstTree = this.removeRedundantVisibleConditions(finalAstTree);
}
```

**문제:**
- `_TempAstTree`와 동일한 패턴으로 9개 단계 하드코딩
- 두 클래스 합쳐 20개 변환 단계가 분산
- 단계 순서 의존성이 암시적

---

## 4. 확장성 문제

### 4.1 노드 타입별 처리 하드코딩

**위치:** `_TempAstTree.ts:634-635`

```typescript
private updateVectorStyles(tempAstTree: TempAstTree): TempAstTree {
  // ⚠️ 타입이 하드코딩됨
  const vectorTypes = ["VECTOR", "LINE", "STAR", "ELLIPSE", "POLYGON", "BOOLEAN_OPERATION"];
  const svgOnlyProps = [
    "stroke-width", "stroke", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset"
  ];

  traverseBFS(tempAstTree, (node) => {
    const nodeType = node.type || nodeSpec?.type;
    if (!vectorTypes.includes(nodeType)) return;
    // ...
  });
}
```

**문제:**
- Figma 새 노드 타입 추가 시 하드코딩된 배열 수정 필요
- 타입별 처리 로직이 메서드 내부에 숨겨짐
- 다른 곳에서 동일한 타입 목록 중복 가능

**개선 방향:**
```typescript
// 타입별 핸들러 Registry
interface NodeTypeHandler {
  readonly nodeTypes: string[];
  handle(node: TempAstTree, context: TransformContext): void;
}

class VectorNodeHandler implements NodeTypeHandler {
  readonly nodeTypes = ["VECTOR", "LINE", "STAR", "ELLIPSE", "POLYGON", "BOOLEAN_OPERATION"];

  handle(node: TempAstTree, context: TransformContext): void {
    // Vector 노드 처리 로직
  }
}

class NodeTypeRegistry {
  private handlers: NodeTypeHandler[] = [];

  register(handler: NodeTypeHandler): void {
    this.handlers.push(handler);
  }

  getHandler(nodeType: string): NodeTypeHandler | undefined {
    return this.handlers.find(h => h.nodeTypes.includes(nodeType));
  }
}
```

---

### 4.2 SemanticRole과 태그 매핑

**위치:** `customType.ts:143-150`

```typescript
// 현재 SemanticRole 정의
export type SemanticRole =
  | "root"       // 루트 컴포넌트
  | "container"  // 레이아웃 컨테이너 (FRAME, GROUP)
  | "text"       // 텍스트 (TEXT)
  | "button"     // 버튼
  | "icon"       // 아이콘 (INSTANCE)
  | "vector"     // 벡터 그래픽 (VECTOR)
  | "image";     // 이미지
```

**CreateJsxTree에서 태그 결정 (추정 로직):**
```typescript
private _getTagName(node: FinalAstTree): string {
  const semanticRole = node.semanticRole;

  if (node.type === "INSTANCE") {
    return isRootNode ? "div" : this._normalizeName(node.name);
  }

  // ⚠️ switch문으로 하드코딩
  switch (semanticRole) {
    case "button": return "button";
    case "text": return "span";
    case "image": return "img";
    case "vector": return node.metaData?.vectorSvg ? "svg" : "div";
    case "icon": return "span";
    case "container":
    case "root":
    default: return "div";
  }
}
```

**문제:**
- 새로운 `SemanticRole` 추가 시 여러 파일 수정 필요
- 플랫폼별 (React/Vue/Flutter) 확장 어려움
- 태그 결정 로직이 분산됨

**개선 방향:**
```typescript
// Strategy 패턴으로 태그 결정 분리
interface TagResolver {
  canResolve(role: SemanticRole, node: FinalAstTree): boolean;
  resolveTag(node: FinalAstTree): string;
}

class ButtonTagResolver implements TagResolver {
  canResolve(role: SemanticRole): boolean {
    return role === "button";
  }
  resolveTag(node: FinalAstTree): string {
    return "button";
  }
}

class VectorTagResolver implements TagResolver {
  canResolve(role: SemanticRole): boolean {
    return role === "vector";
  }
  resolveTag(node: FinalAstTree): string {
    return node.metaData?.vectorSvg ? "svg" : "div";
  }
}

// Registry 패턴
class TagResolverRegistry {
  private resolvers: TagResolver[] = [];

  register(resolver: TagResolver): void {
    this.resolvers.push(resolver);
  }

  resolve(node: FinalAstTree): string {
    const resolver = this.resolvers.find(r => r.canResolve(node.semanticRole, node));
    return resolver?.resolveTag(node) ?? "div";
  }
}
```

---

## 5. Props 시스템 분석

### 5.1 Props 타입 정의

**위치:** `PropsManager.ts:25-33`

```typescript
export interface PropDefinition {
  name: string;
  type: "VARIANT" | "TEXT" | "BOOLEAN" | "SLOT";
  defaultValue: any;
  variantOptions?: string[];
  originalType?: string;
  slotInfo?: SlotInfo;
}
```

### 5.2 Props 처리 파이프라인

```
[추출] PropsExtractor
  ↓ componentPropertyDefinitions 파싱
  ↓ componentProperties 변환 (INSTANCE)
  ↓ componentPropertyReferences 자동 추출

[바인딩] _TempAstTree
  ↓ updateVisible - visible 조건 바인딩
  ↓ updateProps - componentPropertyReferences 병합

[정규화] _FinalAstTree
  ↓ updateProps - Props 정규화
  ↓ updateExternalComponents - 외부 컴포넌트 props 생성

[인터페이스] GenerateInterface
  ↓ createPropTypeAliases - 타입 별칭 생성
  ↓ createPropsInterface - Props 인터페이스 생성

[JSX] CreateJsxTree
  ↓ _createAttributes - JSX 속성 생성
  ↓ _createSlotJsxExpression - 슬롯 표현식 생성
```

### 5.3 새로운 Props 타입 추가 시 영향받는 파일

| 파일 | 변경 내용 |
|------|----------|
| `PropsManager.ts` | `PropDefinition.type` 유니온 타입 추가 |
| `PropsExtractor.ts` | 추출 로직 추가 |
| `_TempAstTree.ts` | Props 바인딩 로직 추가 |
| `_FinalAstTree.ts` | Props 정규화 로직 추가 |
| `GenerateInterface.ts` | Props 인터페이스 생성 로직 추가 |
| `CreateJsxTree.ts` | JSX 생성 로직 추가 |
| 테스트 파일들 | 테스트 케이스 추가 |

**문제:**
- 변경점이 7개 이상의 파일에 분산
- 모든 변경점을 놓칠 가능성 높음
- Props 타입 정의와 처리 로직이 분리됨

**개선 방향:**
```typescript
// Props 타입별 Handler 패턴
interface PropTypeHandler {
  readonly type: PropType;

  // 추출
  extract(spec: any): PropDefinition;

  // 바인딩
  bind(node: TempAstTree, prop: PropDefinition): void;

  // 인터페이스 생성
  generateTypeNode(prop: PropDefinition): ts.TypeNode;

  // JSX 속성 생성
  generateJsxAttribute(prop: PropDefinition, value: any): ts.JsxAttribute;
}

class VariantPropHandler implements PropTypeHandler {
  readonly type = "VARIANT";

  extract(spec: any): PropDefinition {
    return {
      name: spec.name,
      type: "VARIANT",
      defaultValue: spec.defaultValue,
      variantOptions: spec.variantOptions,
    };
  }

  bind(node: TempAstTree, prop: PropDefinition): void {
    // VARIANT prop 바인딩 로직
  }

  generateTypeNode(prop: PropDefinition): ts.TypeNode {
    // "Large" | "Small" 같은 union type 생성
    return ts.factory.createUnionTypeNode(
      prop.variantOptions!.map(opt =>
        ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(opt))
      )
    );
  }

  generateJsxAttribute(prop: PropDefinition, value: any): ts.JsxAttribute {
    // JSX 속성 생성 로직
  }
}

// Handler Registry
class PropTypeHandlerRegistry {
  private handlers = new Map<PropType, PropTypeHandler>();

  register(handler: PropTypeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: PropType): PropTypeHandler | undefined {
    return this.handlers.get(type);
  }
}
```

---

## 6. Manager 클래스 결합도

### 6.1 SpecDataManager 메서드 분류

**위치:** `src/frontend/ui/domain/compiler/manager/SpecDataManager.ts`

| 카테고리 | 메서드 | 분리 대상 |
|----------|--------|-----------|
| **기본 데이터** | `getDocument()`, `getSpec()`, `getSpecById()` | 유지 |
| **렌더 트리** | `getRenderTree()`, `getRenderTreeById()` | 유지 |
| **Props** | `getComponentPropertyDefinitions()`, `getComponentProperties()`, `getRootNodeType()` | 유지 |
| **이미지** | `getImageUrls()`, `getImageUrlByRef()`, `getImageRefByNodeId()`, `getImageUrlByNodeId()` | → `ImageRegistry` |
| **SVG** | `getVectorSvgs()`, `getVectorSvgByNodeId()`, `getVectorSvgsByInstanceId()`, `mergeInstanceVectorSvgs()`, `getFirstVectorSvgByInstanceId()` | → `VectorRegistry` |
| **의존성** | `getDependencies()`, `getDependencyById()`, `getDependenciesGroupedByComponentSet()` | → `DependencyRegistry` |

**개선 방향:**
```typescript
// 책임별 분리
class SpecDataManager {
  // 핵심 기능만 유지
  readonly images: ImageRegistry;
  readonly vectors: VectorRegistry;
  readonly dependencies: DependencyRegistry;

  constructor(spec: FigmaNodeData) {
    // ...
    this.images = new ImageRegistry(spec);
    this.vectors = new VectorRegistry(spec);
    this.dependencies = new DependencyRegistry(spec);
  }

  // 기본 메서드만 유지
  getDocument(): SceneNode { ... }
  getSpec(): FigmaNodeData { ... }
  getSpecById(id: string): any { ... }
  getRenderTree(): RenderTree { ... }
  getRenderTreeById(id: string): RenderTree { ... }
}

// 분리된 Registry 클래스들
class ImageRegistry {
  getUrls(): Record<string, string> { ... }
  getUrlByRef(imageRef: string): string | undefined { ... }
  getRefByNodeId(nodeId: string): string | undefined { ... }
  getUrlByNodeId(nodeId: string): string | undefined { ... }
}

class VectorRegistry {
  getSvgs(): Record<string, string> { ... }
  getSvgByNodeId(nodeId: string): string | undefined { ... }
  getSvgsByInstanceId(instanceId: string): VectorInfo[] { ... }
  mergeSvgs(instanceId: string): string | undefined { ... }
}

class DependencyRegistry {
  getAll(): Record<string, FigmaNodeData> | undefined { ... }
  getById(componentId: string): FigmaNodeData | undefined { ... }
  getGroupedByComponentSet(): GroupedDependencies { ... }
}
```

---

### 6.2 DependencyManager 책임 분해

**위치:** `src/frontend/ui/domain/compiler/manager/DependencyManager.ts`

**현재 책임 (841줄):**
1. 의존성 컴파일 오케스트레이션 (`compileWithDependencies`)
2. 코드 번들링 (`bundleWithDependencies`)
3. Import 정리 (import 문 추출/제거)
4. Export 제거 (`export default function` → `function`)
5. 변수명 충돌 해결 (`_resolveVariableConflicts`)
6. 타입 중복 해결 (`_resolveTypeConflicts`)
7. Props 추론 (`_inferComponentPropertyDefinitions`)
8. 오버라이드 Props 수집 (`_collectAllOverrideableProps`)

**개선 방향:**
```typescript
// 책임별 분리
class DependencyCompiler {
  // 의존성 컴파일 오케스트레이션만 담당
  async compile(
    mainCode: string,
    componentName: string,
    compilerFactory: CompilerFactory
  ): Promise<MultiComponentResult> { ... }
}

class CodeBundler {
  // 코드 합치기, import 정리
  bundle(result: MultiComponentResult): string { ... }

  private extractImports(code: string): string[] { ... }
  private removeImports(code: string): string { ... }
  private removeExports(code: string): string { ... }
}

class ConflictResolver {
  // 변수명/타입 충돌 해결
  resolveVariables(code: string, usedNames: Set<string>): string { ... }
  resolveTypes(code: string, usedTypes: Set<string>): string { ... }
}

class PropsInferrer {
  // Props 추론
  inferFromVariants(variants: FigmaNodeData[]): Record<string, any> { ... }
  collectOverrideableProps(variants: FigmaNodeData[]): OverrideableProps { ... }
}

// 새로운 DependencyManager는 조합만 담당
class DependencyManager {
  constructor(
    private compiler: DependencyCompiler,
    private bundler: CodeBundler,
    private conflictResolver: ConflictResolver,
    private propsInferrer: PropsInferrer
  ) {}

  async compileWithDependencies(...): Promise<MultiComponentResult> {
    const result = await this.compiler.compile(...);
    // ...
    return result;
  }

  bundleWithDependencies(result: MultiComponentResult): string {
    return this.bundler.bundle(result);
  }
}
```

---

## 7. 현재 잘 된 부분

### 7.1 StyleStrategy 패턴

**위치:** `src/frontend/ui/domain/compiler/core/react-generator/style-strategy/StyleStrategy.ts`

```typescript
// ✅ 좋은 추상화 예시
export interface StyleStrategy {
  readonly name: "emotion" | "tailwind";

  generateImports(): ts.ImportDeclaration[];
  generateDeclarations(astTree: FinalAstTree, componentName: string): ts.Statement[];
  createStyleAttribute(node: FinalAstTree): ts.JsxAttribute | null;
  getDynamicStyleInfo(node: FinalAstTree): DynamicStyleInfo | null;
}
```

**장점:**
- 명확한 인터페이스 정의
- 구현체(EmotionStrategy, TailwindStrategy) 분리
- 팩토리 함수 제공
- 새로운 스타일 전략 추가 용이

**개선 필요:**
```typescript
// style-strategy/index.ts - switch문 제거 필요
export function createStyleStrategy(...): StyleStrategy {
  switch (strategyType) {
    case "tailwind":
      return new TailwindStrategy(...);
    case "emotion":
    default:
      return new EmotionStrategy(...);
  }
}

// 개선: Registry 패턴
class StyleStrategyRegistry {
  private strategies = new Map<StyleStrategyType, StrategyFactory>();

  register(type: StyleStrategyType, factory: StrategyFactory): void {
    this.strategies.set(type, factory);
  }

  create(type: StyleStrategyType, ...args: any[]): StyleStrategy {
    const factory = this.strategies.get(type);
    if (!factory) throw new Error(`Unknown strategy: ${type}`);
    return factory(...args);
  }
}
```

---

### 7.2 타입 정의 분리

**위치:** `src/frontend/ui/domain/compiler/types/`

```typescript
// baseType.ts - Figma API 타입
// customType.ts - 컴파일러 내부 타입

// ✅ 좋은 타입 정의 예시
export type SemanticRole =
  | "root"
  | "container"
  | "text"
  | "button"
  | "icon"
  | "vector"
  | "image";

export interface FinalAstTree {
  id: string;
  name: string;
  type: string;
  props: Record<string, Record<string, any>>;
  parent: FinalAstTree | null;
  visible: VisibleValue;
  style: StyleObject;
  children: FinalAstTree[];
  semanticRole: SemanticRole;
  // ...
}
```

---

### 7.3 HelperManager의 유틸리티 함수들

**위치:** `src/frontend/ui/domain/compiler/manager/HelperManager.ts`

```typescript
// ✅ 순수 함수들로 구성
class HelperManager {
  findBooleanVariantProps(definitions: Record<string, any>): string[] { ... }
  parseVariantName(variantName: string): Record<string, string> { ... }
  combineWithAnd(conditions: ConditionNode[]): ConditionNode { ... }
  combineWithOr(conditions: ConditionNode[]): ConditionNode { ... }
  createBinaryCondition(propName: string, value: string): ConditionNode { ... }
  createIncludesCondition(propName: string, values: string[]): ConditionNode { ... }
  deepCloneTree(tree: any): any { ... }
  parseConditionToRecord(condition: ConditionNode): Record<string, string> { ... }
}
```

---

## 8. 리팩토링 계획

### Phase 1: 파이프라인 추상화 (우선순위: 높음)

**목표:** 컴파일 파이프라인을 유연하게 구성 가능하도록 변경

#### 1.1 Pipeline 인터페이스 도입

```typescript
// src/frontend/ui/domain/compiler/core/pipeline/PipelineStage.ts
export interface PipelineStage<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput, context: PipelineContext): TOutput;
}

export interface PipelineContext {
  specDataManager: SpecDataManager;
  propsManager: PropsManager;
  options: CompilerOptions;
}

// src/frontend/ui/domain/compiler/core/pipeline/Pipeline.ts
export class Pipeline<TIn, TOut> {
  private stages: PipelineStage<any, any>[] = [];

  addStage<TStageIn, TStageOut>(stage: PipelineStage<TStageIn, TStageOut>): this {
    this.stages.push(stage);
    return this;
  }

  execute(input: TIn, context: PipelineContext): TOut {
    return this.stages.reduce(
      (acc, stage) => stage.execute(acc, context),
      input as any
    );
  }
}
```

#### 1.2 AST 변환 Transformer 분리

```
src/frontend/ui/domain/compiler/core/ast-tree/transformers/
├── index.ts
├── MergedNodeTransformer.ts
├── StyleTransformer.ts
├── NormalizeStyleTransformer.ts
├── RotatedElementTransformer.ts
├── VectorStyleTransformer.ts
├── FlexPaddingTransformer.ts
├── PositionStyleTransformer.ts
├── VisibilityTransformer.ts
├── ConditionalWrapperTransformer.ts
├── PropsTransformer.ts
├── CleanupNodesTransformer.ts
├── HiddenNodesTransformer.ts
├── MetaDataTransformer.ts
├── ExternalComponentTransformer.ts
├── SvgFillTransformer.ts
└── OverrideablePropsTransformer.ts
```

---

### Phase 2: Manager 책임 분리 (우선순위: 높음)

**목표:** 단일 책임 원칙에 따라 Manager 클래스 분해

#### 2.1 SpecDataManager 분해

```
src/frontend/ui/domain/compiler/manager/
├── SpecDataManager.ts (핵심 기능만)
├── registries/
│   ├── ImageRegistry.ts
│   ├── VectorRegistry.ts
│   └── DependencyRegistry.ts
```

#### 2.2 DependencyManager 분해

```
src/frontend/ui/domain/compiler/manager/dependency/
├── DependencyManager.ts (파사드)
├── DependencyCompiler.ts
├── CodeBundler.ts
├── ConflictResolver.ts
└── PropsInferrer.ts
```

---

### Phase 3: 확장성 개선 (우선순위: 중간)

**목표:** 새로운 기능 추가 시 기존 코드 수정 최소화

#### 3.1 타입별 처리 Registry 도입

```typescript
// src/frontend/ui/domain/compiler/core/registries/
├── NodeTypeHandlerRegistry.ts
├── TagResolverRegistry.ts
├── PropTypeHandlerRegistry.ts
└── StyleStrategyRegistry.ts
```

#### 3.2 SemanticRole 확장 지원

```typescript
// 새로운 SemanticRole 추가 시
// 1. 타입에 추가
// 2. 해당 TagResolver 등록
// 3. 끝! (기존 코드 수정 없음)

roleRegistry.register(new InputTagResolver());
roleRegistry.register(new LinkTagResolver());
roleRegistry.register(new ListTagResolver());
```

---

### Phase 4: 타입 안전성 강화 (우선순위: 낮음)

**목표:** `any` 타입 제거, 타입 추론 강화

#### 4.1 metaData 타입 정의

```typescript
interface FinalAstTreeMetaData {
  document?: SceneNode;
  spec?: FigmaSpec;
  vectorSvg?: string;
  textSegments?: TextSegment[];
  mergedNode?: MergedNode[];
  characters?: string;
}

export interface FinalAstTree {
  // ...
  metaData: FinalAstTreeMetaData; // any → 구체적 타입
}
```

#### 4.2 파이프라인 입출력 타입 명시화

```typescript
// 각 Stage의 입출력 타입 명확화
class SuperTreeStage implements PipelineStage<RenderTree, SuperTreeNode> { ... }
class TempAstTreeStage implements PipelineStage<SuperTreeNode, TempAstTree> { ... }
class FinalAstTreeStage implements PipelineStage<TempAstTree, FinalAstTree> { ... }
class ReactGeneratorStage implements PipelineStage<FinalAstTree, string> { ... }
```

---

## 부록: 파일별 변경 영향도

### 높은 영향도 (신중히 변경)

| 파일 | 이유 |
|------|------|
| `Engine.ts` | 모든 파이프라인 단계 의존 |
| `SpecDataManager.ts` | 거의 모든 클래스가 의존 |
| `FinalAstTree (타입)` | 코드 생성기 전체가 의존 |

### 중간 영향도

| 파일 | 이유 |
|------|------|
| `_TempAstTree.ts` | `_FinalAstTree`가 의존 |
| `DependencyManager.ts` | `FigmaCompiler`가 의존 |
| `CreateJsxTree.ts` | `GenerateComponent`가 의존 |

### 낮은 영향도 (비교적 안전)

| 파일 | 이유 |
|------|------|
| `PropsExtractor.ts` | `PropsManager`만 사용 |
| 개별 Transformer들 | 독립적으로 테스트 가능 |
| Registry 클래스들 | 새로 추가되는 파일 |

---

## 결론

현재 프로젝트는 **기초 아키텍처가 탄탄**하지만, 급속한 기능 추가로 인해 일부 클래스가 과도하게 커졌습니다.

**핵심 개선 방향:**
1. **파이프라인 추상화** - 단계별 독립적 테스트/교체 가능
2. **책임 분리** - 각 클래스가 하나의 역할만 담당
3. **Registry 패턴** - 새 기능 추가 시 기존 코드 수정 최소화
4. **타입 강화** - `any` 제거, 컴파일 타임 오류 검출

이러한 리팩토링을 통해 **다양한 UI 대응**과 **플랫폼 확장**(Vue, Flutter 등)이 용이한 구조로 발전할 수 있습니다.
