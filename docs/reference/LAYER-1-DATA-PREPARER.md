# Layer 1: DataPreparer

> **핵심**: Figma 원본 데이터를 조회하기 편한 형태로 준비합니다.

## 요약

| 입력 | 출력 | 역할 |
|-----|------|------|
| FigmaNodeData | PreparedDesignData | HashMap 구축, Props 정규화 |

---

## 왜 필요한가?

Figma API 응답은 **트리 구조**입니다. 특정 노드를 찾으려면 매번 트리 순회가 필요합니다.

```
Before: getNodeById("123:456") → O(n) 트리 순회
After:  nodeMap.get("123:456") → O(1) 조회
```

---

## 하는 일

### 1. 깊은 복사

원본 데이터를 변경하지 않도록 복사본을 만듭니다.

```typescript
const spec = JSON.parse(JSON.stringify(data));
```

### 2. HashMap 구축

트리를 순회하며 Map을 생성합니다.

| Map | 용도 |
|-----|------|
| `nodeMap` | 노드 ID → SceneNode |
| `styleMap` | 노드 ID → StyleTree |
| `imageUrls` | imageRef → URL |
| `vectorSvgs` | 노드 ID → SVG 문자열 |
| `dependencies` | componentId → FigmaNodeData |

### 3. Props 추출 및 정규화

Figma의 `componentPropertyDefinitions`를 정리합니다.

**Before (Figma 원본)**:
```
"Show Icon#123:456": {
  type: "VARIANT",
  defaultValue: "True",
  variantOptions: ["True", "False"]
}
```

**After (정규화)**:
```typescript
{
  name: "showIcon",        // camelCase
  type: "boolean",         // True/False → boolean
  defaultValue: true,      // "True" → true
  originalKey: "Show Icon#123:456"
}
```

### 4. 타입 변환

| Figma 타입 | 내부 타입 |
|-----------|----------|
| VARIANT | variant |
| VARIANT (True/False) | boolean |
| BOOLEAN | boolean |
| TEXT | string |
| INSTANCE_SWAP | slot |

### 5. HTML 속성 충돌 방지

`disabled`, `type` 등 HTML 속성과 충돌하는 이름에 prefix 추가:

```
"disabled" → "customDisabled"
"type" → "customType"
```

---

## 출력: PreparedDesignData

```typescript
interface PreparedDesignData {
  spec: FigmaNodeData;              // 원본 (깊은 복사본)
  document: SceneNode;              // 루트 노드
  styleTree: StyleTree;             // 스타일 트리

  // O(1) 조회용 Map
  nodeMap: Map<string, SceneNode>;
  styleMap: Map<string, StyleTree>;
  imageUrls: Map<string, string>;
  vectorSvgs: Map<string, string>;
  dependencies: Map<string, FigmaNodeData>;

  // 정규화된 Props
  props: PropsDef;

  // 조회 메서드
  getNodeById(id: string): SceneNode | undefined;
  getStyleById(id: string): StyleTree | undefined;
  getImageUrlByNodeId(nodeId: string): string | undefined;
  getVectorSvgByNodeId(nodeId: string): string | undefined;
}
```

---

## 다음 단계

PreparedDesignData는 **TreeBuilder**로 전달됩니다.

TreeBuilder는 이 데이터를 사용해 플랫폼 독립적 IR(DesignTree)을 생성합니다.

---

## 관련 파일

- `core/data-preparer/DataPreparer.ts`
- `core/data-preparer/PreparedDesignData.ts`
