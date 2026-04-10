# Variant Merger 엔진 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `processors/`에 흩어져 있는 Variant Merger 엔진 파일 6개를 `processors/variant-merger/` 단일 디렉토리로 통합하고, `UpdateSquashByIou`를 `VariantSquasher`로 리네임하고, 공개 API barrel(`variant-merger/index.ts`)을 정의한다.

**Architecture:** 순수 파일 재배치 + 1건 클래스 리네임 + barrel export 추가. Behavior 변화 0. 모든 기존 테스트(단위 + 브라우저 + audit) 통과가 유일한 검증 기준.

**Tech Stack:** TypeScript, Vite, Vitest, git

**선행 문서:**
- `docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md` (Spec A)

**중요 특성:**
- 이 작업은 **단일 commit**으로 완료한다. 중간 상태에서 컴파일이 깨지는 것은 정상이며, 부분 commit 금지.
- 모든 작업은 메인 리포에서 직접 수행 (worktree 사용 안 함 — 순수 재배치는 리스크 0).

---

## Task 1: Baseline 캡처

**Files:** (읽기 전용)

- [ ] **Step 1: Git 상태 확인**

Run: `git status`
Expected: `nothing to commit, working tree clean` 또는 untracked spec 파일만 있음

- [ ] **Step 2: 현재 branch 확인**

Run: `git branch --show-current`
Expected: `dev`

- [ ] **Step 3: TypeScript 컴파일 baseline 확인**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: 에러 0건 (출력에 "error" 없음). 에러가 있으면 본 작업 중단 — 작업 시작 전 tsc가 green이어야 함.

- [ ] **Step 4: 단위 테스트 baseline 확인 및 기록**

Run: `npm run test 2>&1 | tail -5`
Expected: 모든 테스트 통과. 마지막 "Test Files X passed, Y total" 숫자를 기록.

- [ ] **Step 5: Audit baseline 확인**

Run: `npm run audit 2>&1 | tail -10`
Expected: PASS, total 1856 (또는 현재 baseline 숫자).

- [ ] **Step 6: Anomaly baseline 확인**

Run: `npm run audit:anomaly 2>&1 | tail -10`
Expected: PASS, total 119.

- [ ] **Step 7: Baseline 숫자를 작업 메모에 기록**

```
Baseline (2026-04-10 작업 시작 전):
- tsc errors: 0
- test files passed: <기록>
- audit total: <기록, 기대 1856>
- anomaly total: <기록, 기대 119>
```

이 숫자들은 Task 10에서 검증 시 비교 대상이 된다.

---

## Task 2: 디렉토리 생성 및 파일 이동

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/`
- Move: 6 engine files + match-engine/ directory

- [ ] **Step 1: 작업 디렉토리로 이동**

Run: `cd /Users/namhyeon-u/Desktop/figma-plugin`

- [ ] **Step 2: 변수 설정 (타이핑 편의)**

```bash
export PROC_DIR="src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors"
```

- [ ] **Step 3: `variant-merger/` 디렉토리 생성**

Run: `mkdir -p "$PROC_DIR/variant-merger"`
Verify: `ls -la "$PROC_DIR/variant-merger"` (빈 디렉토리 존재)

- [ ] **Step 4: 5개 파일을 `git mv`로 이동 (history 보존)**

```bash
git mv "$PROC_DIR/VariantMerger.ts"         "$PROC_DIR/variant-merger/VariantMerger.ts"
git mv "$PROC_DIR/VariantGraphBuilder.ts"   "$PROC_DIR/variant-merger/VariantGraphBuilder.ts"
git mv "$PROC_DIR/NodeMatcher.ts"           "$PROC_DIR/variant-merger/NodeMatcher.ts"
git mv "$PROC_DIR/LayoutNormalizer.ts"      "$PROC_DIR/variant-merger/LayoutNormalizer.ts"
git mv "$PROC_DIR/UpdateSquashByIou.ts"     "$PROC_DIR/variant-merger/VariantSquasher.ts"
```

마지막 줄은 **이동 + 파일명 변경**. git은 내용이 동일하면 rename으로 추적한다 (클래스명은 다음 Task에서 변경).

- [ ] **Step 5: `match-engine/` 디렉토리 전체 이동**

```bash
git mv "$PROC_DIR/match-engine" "$PROC_DIR/variant-merger/match-engine"
```

- [ ] **Step 6: 이동 결과 확인**

```bash
ls "$PROC_DIR/variant-merger/"
```

Expected:
```
LayoutNormalizer.ts
NodeMatcher.ts
VariantGraphBuilder.ts
VariantMerger.ts
VariantSquasher.ts
match-engine/
```

- [ ] **Step 7: 원래 디렉토리에 엔진 파일이 남아있지 않은지 확인**

```bash
ls "$PROC_DIR/" | grep -E '^(VariantMerger|NodeMatcher|LayoutNormalizer|VariantGraphBuilder|UpdateSquashByIou|match-engine)'
```

Expected: 아무 출력 없음 (전부 이동 완료)

- [ ] **Step 8: 무관한 processor 파일은 제자리에 있는지 확인**

```bash
ls "$PROC_DIR/" | grep -v variant-merger
```

Expected: `ExternalRefsProcessor.ts`, `InstanceSlotProcessor.ts`, `InteractionLayerStripper.ts`, `PropsExtractor.ts`, `SlotProcessor.ts`, `StyleProcessor.ts`, `TextProcessor.ts`, `VisibilityProcessor.ts`, `utils` (9개)

- [ ] **Step 9: tsc 상태 확인 (에러 예상)**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: 여러 import 에러 발생. 이는 정상 — 다음 Task들에서 import 경로를 수정하면 해소된다. 에러 패턴 예: `Cannot find module './NodeMatcher'` in TreeBuilder.ts, test 파일들에서 `processors/VariantMerger` 경로 에러 등.

---

## Task 3: `UpdateSquashByIou` → `VariantSquasher` 클래스 리네임

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantSquasher.ts`

- [ ] **Step 1: 파일을 열어 현재 클래스명 확인**

Read `$PROC_DIR/variant-merger/VariantSquasher.ts` line 21 영역. 확인: `export class UpdateSquashByIou {`

- [ ] **Step 2: 클래스 선언 변경**

파일 내 line 21 주변:
```ts
export class UpdateSquashByIou {
```
→
```ts
export class VariantSquasher {
```

- [ ] **Step 3: Static 멤버 자기 참조 변경 (line 185-186 주변)**

파일 내 검색:
```ts
const isA = nodeA.id.startsWith(UpdateSquashByIou.INSTANCE_ID_PREFIX);
const isB = nodeB.id.startsWith(UpdateSquashByIou.INSTANCE_ID_PREFIX);
```
→
```ts
const isA = nodeA.id.startsWith(VariantSquasher.INSTANCE_ID_PREFIX);
const isB = nodeB.id.startsWith(VariantSquasher.INSTANCE_ID_PREFIX);
```

- [ ] **Step 4: 파일에 `UpdateSquashByIou` 문자열이 남아있지 않은지 확인**

```bash
grep -n "UpdateSquashByIou" "$PROC_DIR/variant-merger/VariantSquasher.ts"
```

Expected: 아무 출력 없음 (완전 치환).

- [ ] **Step 5: 파일 상단에 리네임 메모 주석 추가**

파일 최상단(첫 줄 위)에 추가:
```ts
// Renamed from UpdateSquashByIou, see docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md
```

---

## Task 4: `variant-merger/index.ts` 공개 API barrel 생성

**Files:**
- Create: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/index.ts`

- [ ] **Step 1: `index.ts` 파일 생성**

경로: `$PROC_DIR/variant-merger/index.ts`

내용:
```ts
/**
 * Variant Merger Engine — 공개 API barrel.
 *
 * 이 모듈의 외부 소비자(TreeBuilder 등)는 반드시 이 파일에서 import한다.
 * 내부 파일(NodeMatcher, LayoutNormalizer, VariantSquasher, VariantGraphBuilder,
 * match-engine/* 등)은 모듈 내부 구현으로 간주되며, 외부 production 코드에서
 * deep import하지 않는다.
 *
 * 테스트 파일은 unit test 목적으로 deep import를 허용한다.
 *
 * 선행 문서:
 *   docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md
 */

export { VariantMerger } from "./VariantMerger";
```

- [ ] **Step 2: 파일 존재 확인**

```bash
cat "$PROC_DIR/variant-merger/index.ts"
```

Expected: 위 내용 출력.

---

## Task 5: `VariantMerger.ts` 내부 import 업데이트

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts`

- [ ] **Step 1: 현재 import 부분 확인**

Read lines 1-20 of `$PROC_DIR/variant-merger/VariantMerger.ts`. 확인: line 11에 `import { UpdateSquashByIou } from "./UpdateSquashByIou";`

- [ ] **Step 2: import 경로 및 심볼 변경**

Line 11:
```ts
import { UpdateSquashByIou } from "./UpdateSquashByIou";
```
→
```ts
import { VariantSquasher } from "./VariantSquasher";
```

- [ ] **Step 3: 클래스 사용처 변경 (line 82 근처)**

파일 내 검색:
```ts
const squasher = new UpdateSquashByIou(
```
→
```ts
const squasher = new VariantSquasher(
```

- [ ] **Step 4: 주석 내 언급 변경 (line 40, 81 근처)**

파일 내 `UpdateSquashByIou`가 주석에 남아있으면 `VariantSquasher`로 치환:
```ts
/** 레이아웃 정규화 (Task 4에서 UpdateSquashByIou에도 전달) */
```
→
```ts
/** 레이아웃 정규화 (Task 4에서 VariantSquasher에도 전달) */
```

```ts
// 3.5. IoU 기반 cross-depth squash (v1 UpdateSquashByIou 포팅)
```
→
```ts
// 3.5. IoU 기반 cross-depth squash (v1 VariantSquasher 포팅)
```

- [ ] **Step 5: `UpdateSquashByIou` 문자열 잔존 확인**

```bash
grep -n "UpdateSquashByIou" "$PROC_DIR/variant-merger/VariantMerger.ts"
```

Expected: 아무 출력 없음.

- [ ] **Step 6: VariantMerger.ts의 다른 상대 import 확인 (변경 없음 예상)**

```bash
grep -n "^import" "$PROC_DIR/variant-merger/VariantMerger.ts" | head -15
```

Expected: `./NodeMatcher`, `./LayoutNormalizer`, `./VariantGraphBuilder`, `./VariantSquasher` 등의 상대 경로가 정상. 이들은 같은 디렉토리(`variant-merger/`)에 있으므로 경로 그대로 유효.

---

## Task 6: `TreeBuilder.ts` 외부 import 업데이트

**Files:**
- Modify: `src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts`

- [ ] **Step 1: 현재 import 확인**

```bash
grep -n "VariantMerger" src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
```

Expected: `import { VariantMerger } from "./processors/VariantMerger";` (line 9 부근)

- [ ] **Step 2: import 경로를 barrel로 변경**

Line 9 주변:
```ts
import { VariantMerger } from "./processors/VariantMerger";
```
→
```ts
import { VariantMerger } from "./processors/variant-merger";
```

- [ ] **Step 3: 변경 확인**

```bash
grep -n "variant-merger" src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
```

Expected: `import { VariantMerger } from "./processors/variant-merger";` 출력.

- [ ] **Step 4: 이 파일에서 다른 엔진 파일 deep import 없음을 확인**

```bash
grep -E "processors/(NodeMatcher|LayoutNormalizer|UpdateSquashByIou|VariantSquasher|VariantGraphBuilder|match-engine)" src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/TreeBuilder.ts
```

Expected: 아무 출력 없음 (TreeBuilder는 VariantMerger 하나만 직접 import).

---

## Task 7: Engine root 테스트 파일 import 업데이트 (3개)

**Files:**
- Modify: `test/tree-builder/nodeMatcher.test.ts`
- Modify: `test/tree-builder/layoutNormalizer.test.ts`
- Modify: `test/audits/matchTrace.test.ts`

- [ ] **Step 1: `nodeMatcher.test.ts` import 업데이트**

```bash
sed -i '' 's|tree-builder/processors/NodeMatcher|tree-builder/processors/variant-merger/NodeMatcher|g' test/tree-builder/nodeMatcher.test.ts
sed -i '' 's|tree-builder/processors/LayoutNormalizer|tree-builder/processors/variant-merger/LayoutNormalizer|g' test/tree-builder/nodeMatcher.test.ts
```

- [ ] **Step 2: 변경 확인**

```bash
grep -n "variant-merger" test/tree-builder/nodeMatcher.test.ts
```

Expected: 2개 import 라인에서 `variant-merger/NodeMatcher`와 `variant-merger/LayoutNormalizer` 출력.

- [ ] **Step 3: `layoutNormalizer.test.ts` import 업데이트**

```bash
sed -i '' 's|tree-builder/processors/LayoutNormalizer|tree-builder/processors/variant-merger/LayoutNormalizer|g' test/tree-builder/layoutNormalizer.test.ts
```

- [ ] **Step 4: 변경 확인**

```bash
grep -n "variant-merger" test/tree-builder/layoutNormalizer.test.ts
```

Expected: `variant-merger/LayoutNormalizer` 포함한 import 라인.

- [ ] **Step 5: `matchTrace.test.ts` import 3건 업데이트**

```bash
sed -i '' \
  -e 's|tree-builder/processors/VariantMerger|tree-builder/processors/variant-merger/VariantMerger|g' \
  -e 's|tree-builder/processors/LayoutNormalizer|tree-builder/processors/variant-merger/LayoutNormalizer|g' \
  -e 's|tree-builder/processors/NodeMatcher|tree-builder/processors/variant-merger/NodeMatcher|g' \
  test/audits/matchTrace.test.ts
```

- [ ] **Step 6: 변경 확인**

```bash
grep -n "variant-merger" test/audits/matchTrace.test.ts
```

Expected: 3개 import 라인 (VariantMerger, LayoutNormalizer, NodeMatcher)에서 `variant-merger/` 포함.

- [ ] **Step 7: 기존 deep path 잔존 없는지 확인**

```bash
grep -E "processors/(VariantMerger|NodeMatcher|LayoutNormalizer)" test/tree-builder/nodeMatcher.test.ts test/tree-builder/layoutNormalizer.test.ts test/audits/matchTrace.test.ts | grep -v "variant-merger"
```

Expected: 아무 출력 없음 (모든 deep path가 variant-merger/ prefix를 가짐).

---

## Task 8: `match-engine/` 테스트 파일 import 업데이트 (13개)

**Files:**
- Modify: `test/tree-builder/match-engine/MatchDecisionEngine.test.ts`
- Modify: `test/tree-builder/match-engine/MatchSignal.test.ts`
- Modify: `test/tree-builder/match-engine/MatchingPolicy.test.ts`
- Modify: `test/tree-builder/match-engine/signals/IdMatch.test.ts`
- Modify: `test/tree-builder/match-engine/signals/InstanceSpecialMatch.test.ts`
- Modify: `test/tree-builder/match-engine/signals/NormalizedPosition.test.ts`
- Modify: `test/tree-builder/match-engine/signals/OverflowPenalty.test.ts`
- Modify: `test/tree-builder/match-engine/signals/ParentShapeIdentity.test.ts`
- Modify: `test/tree-builder/match-engine/signals/RelativeSize.test.ts`
- Modify: `test/tree-builder/match-engine/signals/TextSpecialMatch.test.ts`
- Modify: `test/tree-builder/match-engine/signals/TypeCompatibility.test.ts`
- Modify: `test/tree-builder/match-engine/signals/VariantPropPosition.test.ts`
- Modify: `test/tree-builder/match-engine/signals/WrapperRoleDistinction.test.ts`

- [ ] **Step 1: 일괄 치환 (13개 파일)**

```bash
find test/tree-builder/match-engine -name "*.ts" -type f -exec sed -i '' 's|tree-builder/processors/match-engine|tree-builder/processors/variant-merger/match-engine|g' {} \;
```

- [ ] **Step 2: 변경 결과 확인 — 각 파일에 `variant-merger/match-engine` 출현**

```bash
grep -l "variant-merger/match-engine" test/tree-builder/match-engine/*.ts test/tree-builder/match-engine/signals/*.ts | wc -l
```

Expected: `13` (13개 파일 모두 업데이트)

- [ ] **Step 3: 기존 deep path 잔존 없는지 확인**

```bash
grep -rn "processors/match-engine" test/tree-builder/match-engine/ | grep -v "variant-merger/match-engine"
```

Expected: 아무 출력 없음.

---

## Task 9: `CLAUDE.md` 문서 내 클래스명 업데이트

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 현재 언급 확인**

```bash
grep -n "UpdateSquashByIou" CLAUDE.md
```

Expected: 2개 라인 (101, 171 부근) — 둘 다 "Cross-Depth Squash (UpdateSquashByIou)" 형태.

- [ ] **Step 2: 치환**

```bash
sed -i '' 's|UpdateSquashByIou|VariantSquasher|g' CLAUDE.md
```

- [ ] **Step 3: 확인**

```bash
grep -n "VariantSquasher\|UpdateSquashByIou" CLAUDE.md
```

Expected: 2개 라인에 `VariantSquasher` 출력, `UpdateSquashByIou` 0건.

---

## Task 10: 전체 검증

**Files:** (읽기/실행 전용)

- [ ] **Step 1: TypeScript 컴파일 확인**

Run: `npx tsc --noEmit 2>&1 | tail -30`
Expected: 에러 0건. "error TS" 문자열이 출력에 없어야 함.

만약 에러가 남아있으면:
- 에러 메시지에서 누락된 import 경로 확인
- 해당 파일의 import를 수동 수정
- 다시 Step 1 재실행

- [ ] **Step 2: Lint 통과**

Run: `npm run lint 2>&1 | tail -10`
Expected: 에러 없음. 통과.

- [ ] **Step 3: 단위 테스트 실행**

Run: `npm run test 2>&1 | tail -15`
Expected: 모든 테스트 통과. 마지막 숫자가 Task 1의 baseline과 동일.

실패 시:
- 실패한 test 파일 확인 → import 경로 문제일 가능성
- 수동 수정 후 재실행

- [ ] **Step 4: 브라우저 테스트 실행**

Run: `npm run test:browser 2>&1 | tail -15`
Expected: 모든 브라우저 테스트 통과.

- [ ] **Step 5: Audit baseline 검증**

Run: `npm run audit 2>&1 | tail -10`
Expected: PASS, total이 Task 1에서 기록한 baseline 숫자와 **정확히 동일** (1856 예상).

**만약 숫자가 다르면 즉시 rollback**. 이는 behavior가 변화했다는 의미 — 본 spec의 범위를 벗어난 상태.

- [ ] **Step 6: Anomaly baseline 검증**

Run: `npm run audit:anomaly 2>&1 | tail -10`
Expected: PASS, total이 Task 1에서 기록한 baseline(119)과 **정확히 동일**.

- [ ] **Step 7: 이동/리네임/신규 파일 최종 확인**

```bash
ls src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/
```

Expected:
```
LayoutNormalizer.ts
NodeMatcher.ts
VariantGraphBuilder.ts
VariantMerger.ts
VariantSquasher.ts
index.ts
match-engine
```

- [ ] **Step 8: 원래 디렉토리에 엔진 파일 잔존 없음 확인**

```bash
ls src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/ | grep -E '^(VariantMerger\.ts|NodeMatcher\.ts|LayoutNormalizer\.ts|VariantGraphBuilder\.ts|UpdateSquashByIou\.ts|match-engine)$'
```

Expected: 아무 출력 없음.

- [ ] **Step 9: 전체 코드베이스에 `UpdateSquashByIou` 잔존 없음 확인**

```bash
grep -rn "UpdateSquashByIou" src/ test/ CLAUDE.md 2>/dev/null
```

Expected: 아무 출력 없음 (documents in `docs/superpowers/plans/` 역사 문서는 제외, 위 명령에 포함 안 됨).

---

## Task 11: Commit

**Files:** (git 작업)

- [ ] **Step 1: `git status`로 변경 확인**

Run: `git status`
Expected: 이동/수정된 파일 목록 표시. 예상 규모:
- renamed: ~20 (move + rename 포함)
- modified: VariantMerger.ts, TreeBuilder.ts, test 파일들, CLAUDE.md
- new: variant-merger/index.ts

- [ ] **Step 2: `git diff --stat`으로 변화 크기 확인**

Run: `git diff --stat HEAD`
Expected: 한눈에 "대부분 재배치 + 몇 줄 수정" 패턴이 보여야 함. 코드 로직 변경 없음.

- [ ] **Step 3: `git diff` 상세 리뷰 (주요 behavior 변화가 없는지 최종 확인)**

Run: `git diff HEAD src/frontend/ui/domain/code-generator2/layers/tree-manager/tree-builder/processors/variant-merger/VariantMerger.ts | head -60`
Expected: import 변경 1건(UpdateSquashByIou→VariantSquasher) + 클래스 사용 1건 + 주석 2건. 나머지 로직 변경 없음.

- [ ] **Step 4: Staging**

Run: `git add -A`

(`git mv`로 이동한 파일, 신규 `index.ts`, 수정된 VariantMerger/TreeBuilder/tests/CLAUDE.md 모두 staging)

- [ ] **Step 5: Single commit 생성**

```bash
git commit -m "$(cat <<'EOF'
refactor(variant-merger): 엔진 파일을 variant-merger/ 디렉토리로 통합

processors/에 흩어져 있던 엔진 파일 6개를 variant-merger/ 단일
디렉토리로 이동하고, UpdateSquashByIou를 VariantSquasher로 리네임.
variant-merger/index.ts 공개 API barrel 추가.

파일 이동:
  - VariantMerger.ts, VariantGraphBuilder.ts, NodeMatcher.ts,
    LayoutNormalizer.ts → variant-merger/
  - UpdateSquashByIou.ts → variant-merger/VariantSquasher.ts (리네임)
  - match-engine/ → variant-merger/match-engine/

Import 업데이트:
  - TreeBuilder.ts: barrel import로 변경
  - VariantMerger.ts: VariantSquasher 리네임 반영
  - 16개 test 파일: 경로 prefix 업데이트
  - CLAUDE.md: 클래스명 언급 업데이트

Behavior 변화 없음. audit baseline/anomaly baseline 불변, 모든 기존
테스트 통과.

Spec: docs/superpowers/specs/2026-04-10-variant-merger-engine-consolidation-design.md
Plan: docs/superpowers/plans/2026-04-10-variant-merger-engine-consolidation.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Commit 결과 확인**

Run: `git status && git log --oneline -3`
Expected:
- `nothing to commit, working tree clean`
- 최신 commit이 `refactor(variant-merger): 엔진 파일을 variant-merger/ 디렉토리로 통합`

- [ ] **Step 7: 마지막으로 테스트 한 번 더 실행 (commit 상태에서 확인)**

Run: `npm run test 2>&1 | tail -5 && npm run audit 2>&1 | tail -5`
Expected: 모든 테스트 통과, audit baseline 동일.

---

## 완료 체크리스트

- [ ] Task 1: Baseline 캡처
- [ ] Task 2: 디렉토리 생성 및 파일 이동
- [ ] Task 3: 클래스 리네임 (UpdateSquashByIou → VariantSquasher)
- [ ] Task 4: index.ts barrel 생성
- [ ] Task 5: VariantMerger.ts 내부 import 업데이트
- [ ] Task 6: TreeBuilder.ts 외부 import 업데이트
- [ ] Task 7: Engine root 테스트 3개 import 업데이트
- [ ] Task 8: match-engine 테스트 13개 import 업데이트
- [ ] Task 9: CLAUDE.md 클래스명 업데이트
- [ ] Task 10: 전체 검증 (tsc, lint, test, test:browser, audit, audit:anomaly)
- [ ] Task 11: Single commit

---

## Rollback 절차

Task 10의 검증 중 어느 하나라도 실패하면:

1. 실패 원인 파악 (대부분 import 경로 누락)
2. 수동으로 해당 파일 수정
3. 검증 Step 재실행
4. 그래도 안 되면: `git reset --hard HEAD` (작업 중인 변경 전량 폐기) — 단 이 명령은 **사용자에게 확인받은 후에만** 실행

---

## 후속 작업

본 plan 완료 후 즉시 시작 가능한 spec:

- **Spec B 구현**: `docs/superpowers/specs/2026-04-10-hungarian-observation-tool-design.md` (Hungarian observer)
- **Spec C 작성**: 신호 독립성 복원 (아직 spec 없음 — 본 작업 완료 후 brainstorming으로 작성)
