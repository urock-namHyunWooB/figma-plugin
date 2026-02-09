# Phase 1: 구조 생성

> 이 문서는 TreeBuilder 파이프라인의 Phase 1을 상세히 설명합니다.

## 개요

Phase 1의 목표는 **Figma의 여러 variant들을 하나의 통합 트리로 병합**하는 것입니다.

```typescript
// TreeBuilder.ts
ctx = VariantProcessor.merge(ctx);                       // → internalTree
ctx = CleanupProcessor.removeInstanceInternalNodes(ctx); // INSTANCE 내부 노드 제거
ctx = PropsProcessor.extract(ctx);                       // → propsMap
```

---

## 1. VariantProcessor.merge()

### 입력 데이터 구조

Figma에서 COMPONENT_SET은 여러 variant를 children으로 가집니다:

```
COMPONENT_SET "Button"
│
├── COMPONENT "Size=Large, State=Default"
│   └── FRAME "container"
│       ├── VECTOR "leftIcon"
│       ├── TEXT "label" (characters: "Click me")
│       └── VECTOR "rightIcon"
│
├── COMPONENT "Size=Large, State=Hover"
│   └── FRAME "container"
│       ├── VECTOR "leftIcon"
│       ├── TEXT "label"
│       └── VECTOR "rightIcon"
│
├── COMPONENT "Size=Small, State=Default"
│   └── FRAME "container"
│       ├── TEXT "label"
│       └── VECTOR "rightIcon"    ← leftIcon 없음
│
└── COMPONENT "Size=Small, State=Hover"
    └── FRAME "container"
        ├── TEXT "label"
        └── VECTOR "rightIcon"
```

### 목표

4개의 variant를 **하나의 트리**로 병합하되, 각 노드가 **어떤 variant에 존재하는지** 추적해야 합니다.

---

### Step 1: SceneNode → InternalNode 변환

각 variant를 `InternalNode`로 변환합니다.

```typescript
// VariantProcessor.ts
public convertToInternalNode(
  node: SceneNode,
  parent: InternalNode | null,
  variantName: string,
  _data: PreparedDesignData
): InternalNode {
  const internalNode: InternalNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    parent,
    children: [],
    mergedNode: [
      {
        id: node.id,
        name: node.name,
        variantName,   // ← 이 노드가 속한 variant 이름
      },
    ],
    bounds: node.absoluteBoundingBox,
  };

  // 자식 노드 재귀 변환
  if ("children" in node && node.children) {
    internalNode.children = node.children.map((child) =>
      this.convertToInternalNode(child, internalNode, variantName, _data)
    );
  }

  return internalNode;
}
```

#### InternalNode 구조

```typescript
interface InternalNode {
  id: string;
  type: string;           // "FRAME", "TEXT", "VECTOR" 등
  name: string;
  parent: InternalNode | null;
  children: InternalNode[];
  mergedNode: MergedNodeWithVariant[];  // ← 핵심! 병합된 모든 variant 정보
  bounds?: { x, y, width, height };
}

interface MergedNodeWithVariant {
  id: string;
  name: string;
  variantName?: string;  // "Size=Large, State=Default"
}
```

---

### Step 2: 트리 병합 (mergeTree)

첫 번째 variant를 기준으로, 나머지 variant들을 순차적으로 병합합니다.

```typescript
// VariantProcessor.ts
public mergeVariants(variants: SceneNode[], data: PreparedDesignData): InternalNode {
  // 각 variant를 InternalNode로 변환
  const internalTrees = variants.map((variant) =>
    this.convertToInternalNode(variant, null, variant.name, data)
  );

  // 순차적으로 병합
  let mergedTree = internalTrees[0];
  for (let i = 1; i < internalTrees.length; i++) {
    mergedTree = this.mergeTree(mergedTree, internalTrees[i], data);
  }

  // IoU 기반 스쿼시 (중복 노드 정리)
  mergedTree = this.squashWithFunction(mergedTree, ...);

  return mergedTree;
}
```

#### 병합 로직

```typescript
private mergeTree(pivot: InternalNode, target: InternalNode, data: PreparedDesignData): InternalNode {
  // BFS로 target 트리 순회
  const queue = [{ node: target }];

  while (queue.length > 0) {
    const { node: targetNode } = queue.shift()!;

    // pivot에서 같은 노드 찾기
    const matchedNode = this.findMatchingNode(pivot, targetNode, data);

    if (matchedNode) {
      // 같은 노드 발견 → mergedNode에 추가
      matchedNode.mergedNode.push(...targetNode.mergedNode);
    } else {
      // 새로운 노드 → 부모에 추가
      const matchedParent = this.findMatchingParent(pivot, targetNode.parent, data);
      if (matchedParent) {
        targetNode.parent = matchedParent;
        matchedParent.children.push(targetNode);
      }
    }

    // 자식 노드들 큐에 추가
    for (const child of targetNode.children) {
      queue.push({ node: child });
    }
  }

  return pivot;
}
```

---

### Step 3: 노드 매칭 (isSameInternalNode)

**"같은 노드"** 판별 기준:

```typescript
private isSameInternalNode(
  node1: InternalNode,
  node2: InternalNode,
  data: PreparedDesignData
): boolean {
  // 1. 타입이 다르면 다른 노드
  if (node1.type !== node2.type) return false;

  // 2. 같은 ID면 같은 노드
  if (node1.id === node2.id) return true;

  // 3. 루트끼리는 같음
  if (!node1.parent && !node2.parent) return true;

  // 4. 정규화된 좌표 비교 (핵심!)
  const pos1 = this.getNormalizedPosition(node1, data);
  const pos2 = this.getNormalizedPosition(node2, data);
  if (pos1 && pos2) {
    const posMatch = Math.abs(pos1.x - pos2.x) <= 0.1 &&
                     Math.abs(pos1.y - pos2.y) <= 0.1;
    if (posMatch) return true;
  }

  // 5. TEXT 노드는 이름 기반 매칭 (size variant에서 위치가 달라도 병합)
  if (node1.type === "TEXT" && node1.name === node2.name) {
    if (node1.parent?.type === node2.parent?.type) {
      return true;
    }
  }

  return false;
}
```

#### 정규화된 좌표 계산

```typescript
private getNormalizedPosition(
  node: InternalNode,
  data: PreparedDesignData
): { x: number; y: number } | null {
  const nodeSpec = data.getNodeById(node.id);
  const rootSpec = this.findOriginalRoot(node.id, data);  // variant 루트

  // variant 루트 기준으로 0~1 범위로 정규화
  return {
    x: (nodeSpec.x - rootSpec.x) / rootSpec.width,   // 0 = 왼쪽, 1 = 오른쪽
    y: (nodeSpec.y - rootSpec.y) / rootSpec.height,  // 0 = 위, 1 = 아래
  };
}
```

#### 왜 정규화가 필요한가?

Size variant에서 Large와 Small의 크기가 다르면 절대 좌표도 다릅니다:

```
Large variant:  label 위치 = (100, 50)  → 정규화: (0.5, 0.5)
Small variant:  label 위치 = (50, 25)   → 정규화: (0.5, 0.5)
```

정규화하면 같은 상대 위치임을 알 수 있습니다.

---

### Step 4: IoU 기반 스쿼시

병합 후 중복 노드를 IoU(Intersection over Union)로 정리합니다.

```typescript
// IoU = 교집합 면적 / 합집합 면적
function calculateIoU(box1, box2): number {
  const intersection = getIntersection(box1, box2);
  const union = box1.area + box2.area - intersection;
  return intersection / union;  // 0 ~ 1
}

// IoU >= 0.5면 같은 노드로 판단하고 병합
```

#### 스쿼시 과정

1. 타입별로 노드 그룹핑
2. 같은 타입 내에서 IoU >= threshold 인 노드 쌍 찾기
3. 유효한 그룹만 필터링 (조상-자손 관계 제외)
4. 병합 수행: nodeB의 mergedNode를 nodeA로 이동, nodeB 제거

---

### 병합 결과

```
InternalNode "Button" (root)
├── FRAME "container"
│   mergedNode: [
│     { id: "1:1", variantName: "Size=Large, State=Default" },
│     { id: "1:2", variantName: "Size=Large, State=Hover" },
│     { id: "1:3", variantName: "Size=Small, State=Default" },
│     { id: "1:4", variantName: "Size=Small, State=Hover" }
│   ]
│   │
│   ├── VECTOR "leftIcon"
│   │   mergedNode: [
│   │     { variantName: "Size=Large, State=Default" },
│   │     { variantName: "Size=Large, State=Hover" }
│   │   ]  ← Small에는 없음!
│   │
│   ├── TEXT "label"
│   │   mergedNode: [4개 variant 모두]
│   │
│   └── VECTOR "rightIcon"
│       mergedNode: [4개 variant 모두]
```

**핵심 포인트**:

- `mergedNode.length < totalVariantCount`이면 해당 노드는 **일부 variant에서만 존재**
- 이 정보는 Phase 2에서 조건부 렌더링 로직을 생성할 때 사용됨

---

## 2. CleanupProcessor.removeInstanceInternalNodes()

INSTANCE 노드의 내부 children을 제거합니다.

### 왜 필요한가?

INSTANCE는 외부 컴포넌트를 참조합니다. 그 내부 구조는 **별도로 컴파일**되므로, 현재 트리에서는 제거해야 합니다.

```
Button (COMPONENT_SET)
├── container (FRAME)
│   └── CloseIcon (INSTANCE) ← 외부 컴포넌트 참조
│       ├── I123:456;789:012 (VECTOR) ← 제거 대상!
│       └── I123:456;789:013 (FRAME)  ← 제거 대상!
```

### INSTANCE 자식 ID 패턴

```typescript
// instanceUtils.ts
export function isInstanceChildId(id: string): boolean {
  // INSTANCE 자식 ID는 "I"로 시작하고 ";"로 구분됨
  // 예: "I704:56;704:29;692:1613"
  return id.startsWith("I") && id.includes(";");
}
```

ID 구조 설명:
- `I704:56` - INSTANCE 노드 ID
- `704:29` - 중간 경로 (중첩된 INSTANCE가 있는 경우)
- `692:1613` - 원본 컴포넌트 내부 노드 ID

### 예외 처리

```typescript
static removeInstanceInternalNodes(ctx: BuildContext): BuildContext {
  // 1. enrichedFromEmptyChildren인 경우 유지
  // (원래 children이 비어있고 INSTANCE children으로 채워진 경우)
  if (spec?._enrichedFromEmptyChildren) return ctx;

  // 2. 루트가 INSTANCE인 경우 유지
  if (rootType === "INSTANCE") return ctx;

  // 3. SVG 렌더링 노드는 vectorSvgs 데이터가 있으면 유지
  if (SVG_RENDERABLE_TYPES.has(child.type)) {
    const hasVectorSvg = ctx.data.vectorSvgs?.get(child.id);
    if (hasVectorSvg) continue;  // 제거하지 않음
  }
}
```

#### SVG 렌더링 노드 타입

```typescript
private static readonly SVG_RENDERABLE_TYPES = new Set([
  "VECTOR",
  "LINE",
  "ELLIPSE",
  "STAR",
  "POLYGON",
  "BOOLEAN_OPERATION",
]);
```

---

## 3. PropsProcessor.extract()

Figma의 `componentPropertyDefinitions`에서 Props를 추출합니다.

### 입력 (Figma 원본)

```typescript
// DataPreparer가 준비한 props (PreparedDesignData.props)
{
  "Size#123:456": {
    type: "VARIANT",
    defaultValue: "Large",
    variantOptions: ["Large", "Small"]
  },
  "State#123:457": {
    type: "VARIANT",
    defaultValue: "Default",
    variantOptions: ["Default", "Hover", "Disabled"]
  },
  "Show Left Icon#123:458": {
    type: "VARIANT",
    defaultValue: "True",
    variantOptions: ["True", "False"]  // ← boolean-like VARIANT
  },
  "Label#123:459": {
    type: "TEXT",
    defaultValue: "Click me"
  }
}
```

### 변환 과정

```typescript
public extractProps(props: unknown): Map<string, PropDefinition> {
  const map = new Map<string, PropDefinition>();

  for (const [originalName, def] of Object.entries(props)) {
    // 1. 이름 정규화 (camelCase)
    let name = toCamelCase(originalName);
    // "Size#123:456" → "size"
    // "Show Left Icon#123:458" → "showLeftIcon"

    // 2. HTML 속성 충돌 방지
    name = this.renameConflictingPropName(name);
    // "type" → "customType"
    // "disabled" → "customDisabled"

    // 3. 타입 매핑
    const propType = this.mapPropType(def.type);
    // "VARIANT" → "variant"
    // "BOOLEAN" → "boolean"
    // "TEXT" → "string"
    // "INSTANCE_SWAP" → "slot"

    // 4. Boolean-like VARIANT 감지
    const isBooleanLikeVariant = propType === "variant" &&
      options?.length === 2 &&
      options.includes("True") && options.includes("False");

    if (isBooleanLikeVariant) {
      finalType = "boolean";  // VARIANT → boolean으로 변환
      finalDefaultValue = def.defaultValue === "True";  // string → boolean
    }

    map.set(originalName, {
      name,
      type: finalType,
      defaultValue: finalDefaultValue,
      required: false,
      options,
      originalKey: originalName,  // 나중에 바인딩할 때 사용
    });
  }

  return map;
}
```

### 타입 매핑 테이블

| Figma 타입 | 내부 타입 |
|-----------|----------|
| VARIANT | variant |
| BOOLEAN | boolean |
| TEXT | string |
| INSTANCE_SWAP | slot |

### HTML 속성 충돌 방지

다음 이름들은 prefix가 추가됩니다:

```typescript
const CONFLICTING_HTML_ATTRS = new Set([
  "disabled", "type", "value", "name", "id", "hidden",
  "checked", "selected", "required", "readonly",
  "placeholder", "autofocus", "autocomplete",
]);

// 예: "disabled" → "customDisabled"
```

### 출력 (propsMap)

```typescript
Map {
  "Size#123:456" => {
    name: "size",
    type: "variant",
    defaultValue: "Large",
    options: ["Large", "Small"],
    originalKey: "Size#123:456"
  },
  "State#123:457" => {
    name: "state",
    type: "variant",
    defaultValue: "Default",
    options: ["Default", "Hover", "Disabled"],
    originalKey: "State#123:457"
  },
  "Show Left Icon#123:458" => {
    name: "showLeftIcon",
    type: "boolean",           // ← VARIANT에서 boolean으로 변환됨
    defaultValue: true,        // ← "True"에서 true로 변환됨
    options: ["True", "False"],
    originalKey: "Show Left Icon#123:458"
  },
  "Label#123:459" => {
    name: "label",
    type: "string",
    defaultValue: "Click me",
    originalKey: "Label#123:459"
  }
}
```

---

## Phase 1 완료 후 BuildContext 상태

```typescript
{
  // 입력 (불변)
  data: PreparedDesignData,
  policy: undefined,
  totalVariantCount: 4,

  // Phase 1 결과
  internalTree: InternalNode {
    id: "root",
    type: "COMPONENT_SET",
    name: "Button",
    children: [
      {
        type: "FRAME",
        name: "container",
        mergedNode: [4개 variant],
        children: [
          { type: "VECTOR", name: "leftIcon", mergedNode: [2개 variant] },
          { type: "TEXT", name: "label", mergedNode: [4개 variant] },
          { type: "VECTOR", name: "rightIcon", mergedNode: [4개 variant] },
        ]
      }
    ]
  },

  propsMap: Map {
    "Size#123:456" => { name: "size", type: "variant", ... },
    "State#123:457" => { name: "state", type: "variant", ... },
    "Show Left Icon#123:458" => { name: "showLeftIcon", type: "boolean", ... },
    "Label#123:459" => { name: "label", type: "string", ... },
  },

  // 아직 미설정
  semanticRoles: undefined,
  hiddenConditions: undefined,
  nodeTypes: undefined,
  nodeStyles: undefined,
  // ...
}
```

---

## 요약

| 단계 | 입력 | 출력 | 핵심 알고리즘 |
|-----|------|------|-------------|
| VariantProcessor.merge() | SceneNode[] (variants) | InternalNode (통합 트리) | IoU 기반 노드 매칭 |
| CleanupProcessor | InternalNode | InternalNode | I... ID 패턴 매칭 |
| PropsProcessor.extract() | componentPropertyDefinitions | Map<string, PropDefinition> | 타입 매핑, camelCase 변환 |

### 핵심 개념

1. **mergedNode[]**: 각 노드가 어떤 variant에 존재하는지 추적
2. **mergedNode.length < totalVariantCount**: 일부 variant에서만 존재 → 조건부 렌더링 필요
3. **originalKey**: Figma 원본 키 (나중에 componentPropertyReferences와 매칭)
4. **정규화된 좌표**: variant 루트 기준 0~1 범위로 변환하여 크기가 다른 variant 간 노드 매칭

---

## 관련 파일

- `core/tree-builder/workers/VariantProcessor.ts`
- `core/tree-builder/workers/CleanupProcessor.ts`
- `core/tree-builder/workers/PropsProcessor.ts`
- `core/tree-builder/workers/interfaces/core.ts` - InternalNode 타입

## 다음 단계

- [Phase 2: 분석](./PHASE-2-ANALYSIS.md) (작성 예정)
