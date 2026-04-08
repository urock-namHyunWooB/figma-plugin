# 백엔드 노드 데이터 추출 성능 최적화 디자인

**작성일**: 2026-04-08
**대상**: `src/backend/FigmaPlugin.ts` 의 `getNodeData()` 및 보조 트리 순회 메서드
**상태**: Draft (사용자 검토 대기)

---

## 1. 문제 정의

`selectionchange` 이벤트마다 `getNodeData()`가 실행되며, variant가 많은 `COMPONENT_SET`을 선택할 때 약 **10초**의 체감 지연이 발생한다. 사용자 워크플로우가 "선택 → 즉시 코드 확인"인 만큼, 이 지연이 도구의 상시 사용성을 가장 크게 떨어뜨린다.

### 1.1 구조적 원인

`FigmaPlugin.ts`의 코드를 정적으로 분석한 결과, 두 차원의 직렬화와 트리 중복 순회가 곱해져 지연을 만든다. (정확한 차수별 분포는 측정하지 않았으며, 본 디자인은 측정 없이 구조적 원인 제거만으로 충분히 효과를 본다는 가설로 진행한다.)

**차원 1 — 상위 5개 작업이 직렬 (`FigmaPlugin.ts:400~413`)**

```ts
const figmaNodeInfo = await selectedNode.exportAsync({ format: "JSON_REST_V1" });
const styleTree    = await this._makeStyleTree(selectedNode);
const dependencies = await this._collectDependencies(selectedNode);
const imageUrls    = await this._collectImageUrls(selectedNode);
const vectorSvgs   = await this._collectVectorSvgs(selectedNode);
```

5개 작업은 서로 의존성이 없는데도 한 줄씩 await 된다. 합 시간 = `a + b + c + d + e`.

**차원 2 — 모든 walk가 자식을 직렬로 await**

`_makeStyleTree` (`FigmaPlugin.ts:636~641`), `_traverseAndCollect` (`FigmaPlugin.ts:591~595`), `_traverseAndCollectImages` (`FigmaPlugin.ts:532~536`), `_traverseAndCollectVectors` (`FigmaPlugin.ts:476~480`)이 모두 다음 패턴이다:

```ts
for (const child of node.children) {
  await this._walk(child);  // 직전 자식 끝날 때까지 대기
}
```

variant 30개 × 자식 5개 ≈ 150 노드라면, 150개의 `getCSSAsync()` 라운드트립이 직렬로 줄 선다. Figma 플러그인 런타임은 `Promise.all` 병렬 호출을 허용하지만 활용되지 않고 있다.

**차원 3 — 같은 트리를 4번 중복 순회**

`_makeStyleTree`, `_collectDependencies`, `_collectImageUrls`, `_collectVectorSvgs`가 각각 독립적으로 selectedNode의 전체 subtree를 walk한다. 노드당 4번 방문 + 4개의 children 직렬 체인이 누적된다. (5번째로 `exportAsync(JSON_REST_V1)`도 Figma 내부에서 자체 walk를 돈다.)

**차원 4 — 의존성 수집의 추가 폭발 (`FigmaPlugin.ts:556~596`)**

INSTANCE를 만나면 `getMainComponentAsync` → `mainComponent.exportAsync(JSON_REST_V1)` → `_makeStyleTree(mainComponent)` → `_traverseAndCollect(mainComponent, ...)` 4단계를 직렬로 수행. INSTANCE가 또 INSTANCE를 품으면 체인이 늘어남. visited set으로 중복 방지는 되지만 직렬성은 그대로.

### 1.2 부가 원인

- **캐시 부재**: 같은 노드를 다시 클릭해도 처음부터 재추출
- **디바운스 부재**: 빠른 선택 변경 시 무거운 작업이 큐에 쌓임
- **취소 부재**: 새 선택이 도착해도 이전 walk가 끝까지 돌고, stale 결과가 뒤늦게 UI에 도착할 수 있음

---

## 2. 디자인 목표

1. **첫 추출 단축** — variant-heavy COMPONENT_SET 기준 10초 → **2~3초** 목표 (구조적 원인 제거 효과)
2. **재선택 즉시화** — 같은 노드 재선택 시 사실상 0ms (캐시 히트)
3. **stale 데이터 방지** — 빠른 선택 전환 시 잘못된 데이터가 UI에 도착하지 않음
4. **frontend 비변경** — `FigmaNodeData` 타입과 메시지 모양 유지

---

## 3. 새 아키텍처

```
selectionchange
   ↓
DebouncedDispatcher (~150ms 디바운스, generation counter)
   ↓
ExtractionCache (Map<nodeId, FigmaNodeData> + LRU)
   ↓ (miss)
SingleWalkExtractor (단일 walk + Promise.all 병렬)
   ↓
postMessage(ON_SELECTION_CHANGE)
```

### 3.1 SingleWalkExtractor

기존 5개 트리 순회를 **단일 재귀 walk**로 통합. 노드 1개 방문 시 그 노드에 필요한 모든 비동기 작업을 `Promise.all`로 동시 발사한다:

- **항상**: `node.getCSSAsync()` → cssStyle
- **VECTOR/LINE/STAR/ELLIPSE/POLYGON/BOOLEAN_OPERATION**: `node.exportAsync({ format: "SVG" })`
- **INSTANCE**: `node.getMainComponentAsync()` → 결과로 받은 mainComponent에 대해 같은 walker를 재귀 호출 (visited set 공유)
- **fills에 IMAGE**: `figma.getImageByHash(hash).getBytesAsync()`

자식 walk도 `Promise.all(children.map(walk))`로 병렬화. 결과는 styleTree(노드별 cssStyle 트리), dependencies(`Record<componentId, FigmaNodeData>`), imageUrls(`Record<imageHash, dataUrl>`), vectorSvgs(`Record<nodeId, svgString>`) 4개 누적자에 동시에 적재된다.

`exportAsync({ format: "JSON_REST_V1" })`는 Figma 내부에서 자체 walk를 돌리므로 walker 안에 끼울 수 없다. selectedNode 1회만 호출하되, 위 walk와 **병렬로** 발사한다 (`Promise.all([walk(selectedNode), exportAsync(JSON_REST_V1)])`).

### 3.2 ExtractionCache

```ts
class ExtractionCache {
  get(nodeId: string): FigmaNodeData | undefined
  set(nodeId: string, data: FigmaNodeData): void
  invalidate(nodeIds: Iterable<string>): void
  clear(): void
}
```

- 자료구조: `Map<string, FigmaNodeData>` + LRU 추적 (간단한 access-order Map)
- 상한: **20 엔트리** (대형 결과의 메모리 누적 방지)
- 무효화: `figma.on("documentchange", evt => cache.invalidate(affectedNodeIds(evt)))`
- 영속성: 없음 (플러그인 재실행 시 사라짐)

### 3.3 DebouncedDispatcher

```ts
class DebouncedDispatcher {
  constructor(private delayMs: number, private handler: (sel: SceneNode[]) => Promise<void>)
  schedule(selection: SceneNode[]): void
}
```

- `selectionchange` 마다 `schedule()` 호출. 직전 schedule이 아직 발화 전이면 timer 리셋
- 발화 시 generation counter 증가, 핸들러를 그 generation과 함께 호출
- 핸들러는 walk 끝났을 때 자기 generation이 최신 generation과 같은지 확인 → 다르면 결과 폐기 (postMessage 안 함)
- 디바운스 지연: **150ms**

### 3.4 무엇을 폐기하는가

- `_makeStyleTree`, `_collectDependencies`, `_collectImageUrls`, `_collectVectorSvgs`, `_traverseAndCollect`, `_traverseAndCollectImages`, `_traverseAndCollectVectors` 7개 메서드 전부 삭제
- `for (const child of children) { await ... }` 패턴 전부 제거
- `getNodeData()` 본문은 dispatcher → cache → extractor 조립으로 축소

### 3.5 무엇을 폐기하지 않는가

- `FigmaNodeData` 타입과 `ON_SELECTION_CHANGE` 메시지 모양 (frontend 무수정)
- `_makeStyleTree`의 누락 속성 보충 로직 (opacity / overflow / mix-blend-mode / transform — `FigmaPlugin.ts:603~617`)
- `handleExtractDesignTokens`, `handleExportSelectionImage` 등 다른 핸들러 (이번 디자인 범위 밖)
- `REQUEST_REFRESH` 핸들러도 같은 dispatcher/cache를 거치도록 통일 (단, 새로고침은 캐시 우회 옵션)

---

## 4. 컴포넌트 구성

신설 디렉토리 `src/backend/extraction/`:

| 파일 | 책임 |
|---|---|
| `SingleWalkExtractor.ts` | 단일 재귀 walk + Promise.all 병렬 + 5개 누적자 적재 |
| `ExtractionCache.ts` | LRU 캐시 + documentchange 무효화 |
| `DebouncedDispatcher.ts` | 디바운스 + generation counter + 취소 |
| `index.ts` | 셋을 조립하는 factory |

`FigmaPlugin.ts`는 위 모듈들을 import해서 `initialize()`에서 와이어링만 한다. 본문 길이 대폭 축소.

---

## 5. 데이터 흐름

1. 사용자가 노드 클릭 → `figma.on("selectionchange")` 발사
2. `dispatcher.schedule(selection)` 호출 → 150ms 후 발화 (그 사이 추가 클릭 있으면 리셋)
3. 발화 시 `gen = ++currentGeneration`, `cache.get(nodeId)` 조회
4. **캐시 히트**: 즉시 `postMessage(ON_SELECTION_CHANGE, cached)` → 종료
5. **캐시 미스**: `extractor.extract(node)` 실행
   - 내부에서 `Promise.all([walk(node), exportAsync(JSON_REST_V1)])` 동시 발사
   - walk가 styleTree/dependencies/imageUrls/vectorSvgs 4개 누적자에 채움
6. extract 완료 후 `gen === currentGeneration` 확인
   - **같음**: `cache.set(nodeId, result)` + `postMessage`
   - **다름**: 결과 폐기 (이미 새 선택 들어옴)
7. 별도로 `figma.on("documentchange")`가 변경 노드 ID들을 모아 `cache.invalidate()`

---

## 6. 에러 처리

- **노드 단위 실패**: 현행 정책 유지. 개별 `getCSSAsync` / `exportAsync(SVG)` / `getBytesAsync` 실패는 try/catch로 스킵하고 walk 계속. 노드 1개 깨졌다고 전체가 무너지지 않게.
- **walk 전체 실패**: 예외가 누적자 바깥까지 새면 catch해서 `ON_SELECTION_CHANGE` 메시지의 `error` 필드로 UI에 전달 (현행과 동일 패턴).
- **취소된 walk**: 결과 폐기 시 에러 아님. postMessage 자체를 안 함.
- **캐시 무효화 race**: walk 도중 `documentchange`가 들어와 그 노드가 무효화 대상이면, walk 결과를 캐시에 저장하지 않음 (저장 직전 한 번 더 generation 비교). 단순한 epoch 비교로 충분.

---

## 7. 테스트 전략

**자동 테스트 작성하지 않음.** 백엔드 코드가 `figma` 전역에 의존해 단위 테스트 셋업 비용이 가치 대비 크고, 본 변경의 검증은 "실제 Figma 환경에서 체감 속도"가 핵심이라 mock 테스트가 그 답을 주지 않는다.

수동 회귀 절차:

1. `npm run build:plugin` → Figma에 로드
2. variant-heavy COMPONENT_SET 선택 → **첫 클릭 2~3초 이내** 확인
3. 같은 노드 재선택 → **즉시(<200ms)** 확인
4. 다른 variant 클릭 → 첫 클릭과 동등 속도
5. 빠르게 여러 노드 클릭 → 최종 선택에 해당하는 결과만 UI에 도착하는지 확인 (stale 데이터 없음)
6. 노드 편집 (예: fill 변경) → 다음 선택 시 캐시 우회되어 새 데이터 받는지 확인
7. 기존 코드 생성 결과(Emotion/Tailwind)가 동일한지 spot check (테스트 fixture 1~2개)

---

## 8. 영향 받는 파일

**신규**
- `src/backend/extraction/SingleWalkExtractor.ts`
- `src/backend/extraction/ExtractionCache.ts`
- `src/backend/extraction/DebouncedDispatcher.ts`
- `src/backend/extraction/index.ts`

**변경**
- `src/backend/FigmaPlugin.ts` — `getNodeData()` 단순화, 4개 트리 순회 메서드 삭제, dispatcher/cache 와이어링, `documentchange` 리스너 추가

**무변경**
- frontend 전체 (`FigmaNodeData` 타입 동일)
- `src/frontend/ui/domain/transpiler/types/figma-api.ts`
- `src/backend/types/messages.ts`

---

## 9. 알려진 한계 / 미검증

1. **목표 수치 2~3초의 근거 부재**: 측정 없이 "구조적 원인 제거 효과"의 추정. 실제 효과는 빌드 후 검증. 만약 효과 미달이면 §10의 후속 옵션 검토.
2. **`getCSSAsync`의 실제 병렬성**: Figma 런타임이 `Promise.all`을 받아도 내부에서 직렬화할 가능성 배제 못 함. 그 경우 차원 2 효과가 줄어듦.
3. **LRU 상한 20의 임의성**: 메모리 압박 발생 시 조정 필요.
4. **150ms 디바운스의 임의성**: 너무 길면 응답성 저하, 너무 짧으면 큐 쌓임. 실제 사용 후 튜닝.
5. **`documentchange` 이벤트의 affected nodes 정밀도**: Figma가 알려주는 변경 노드가 실제 영향 범위와 일치하지 않을 수 있음 (자식 변경이 부모에 전파되는 케이스 등). 필요 시 해당 노드의 모든 조상 캐시도 무효화하는 보수적 정책 추가.
6. **JSON_REST_V1 export 자체의 비용**: 이게 지연의 큰 비율을 차지하면 walk 병렬화 효과가 묻힘. 그 경우 §10의 lazy/스트리밍 전송이 다음 단계.

---

## 10. 범위 밖 (후속 작업 후보)

- **Lazy/스트리밍 전송**: `info` + `styleTree`만 먼저 보내고 vectors/images/dependencies는 후속 메시지로. UI가 부분 데이터를 다뤄야 해서 frontend 변경 큼. 이번 디자인의 효과 측정 후 결정.
- **`handleExtractDesignTokens` 최적화**: `figma.currentPage.findAll()` + 전체 COMPONENT_SET 스캔이 별도로 무거움. 별도 디자인 필요.
- **`exportAsync(JSON_REST_V1)` 대체**: Figma API로 필요한 필드만 직접 구성해서 JSON_REST_V1 의존을 없애는 방향. 매우 침습적이라 별도 작업.
- **자동 단위 테스트 인프라**: `figma` 전역 mock 라이브러리 도입. 본 디자인 범위 밖.

---

## 11. 미결 사항

- LRU 상한 20과 디바운스 150ms는 첫 빌드 후 사용 패턴 보면서 조정.
- `documentchange`의 affected nodes 정밀도가 실제로 어떻게 동작하는지는 Figma 환경에서 확인 필요 — 보수적으로 시작해서 좁혀나간다.
