// src/core/matcher.ts
import { VirtualNode, SupportedType } from "../../../types/type";
import { getLevenshteinSimilarity } from "../../../utils/util";

// 매칭 후보 객체
interface MatchCandidate {
  base: VirtualNode;
  target: VirtualNode;
  score: number;
}

// 피그마 기본 이름 패턴 (이것들은 이름 점수에서 제외)
const DEFAULT_NAME_REGEX =
  /^(frame|group|rectangle|vector|text|line|star|ellipse|polygon|component|instance|slice)\s*\d*$/i;

function isCustomName(name: string): boolean {
  return !DEFAULT_NAME_REGEX.test(name.trim());
}

/**
 * [Helper] 두 타입이 서로 호환 가능한지 확인 (Soft Filter)
 */
function areTypesCompatible(t1: SupportedType, t2: SupportedType): boolean {
  if (t1 === t2) return true;

  // 컨테이너끼리 호환 (인스턴스 깨짐 대응)
  const containers = ["FRAME", "GROUP", "INSTANCE", "COMPONENT", "SECTION"];
  if (containers.includes(t1) && containers.includes(t2)) return true;

  // 도형끼리 호환 (아이콘 변경 대응)
  const shapes = ["VECTOR", "STAR", "POLYGON", "ELLIPSE", "RECTANGLE"];
  if (shapes.includes(t1) && shapes.includes(t2)) return true;

  return false;
}

/**
 * [Core] 유사도 점수 계산 (0 ~ 1000점)
 */
function calculateScore(base: VirtualNode, target: VirtualNode): number {
  const attrsA = base.attributes;
  const attrsB = target.attributes;

  // --- Tier 0: 절대적 신원 (Identity) [1000점] ---
  // 인스턴스 원본이 같으면 무조건 같은 요소
  if (attrsA.mainComponentId && attrsB.mainComponentId) {
    if (attrsA.mainComponentId === attrsB.mainComponentId) return 1000;
  }
  // 이미지 소스가 같으면 같은 요소
  if (attrsA.imageHash && attrsB.imageHash) {
    if (attrsA.imageHash === attrsB.imageHash) return 800;
  }

  let score = 0;

  // --- Tier 1: 개발자의 의도 (Explicit Intent) [80점] ---
  const nameA = attrsA.name.trim();
  const nameB = attrsB.name.trim();
  const isNameMatch = nameA === nameB;

  if (isNameMatch) {
    if (isCustomName(nameA)) {
      // 사용자가 직접 지은 이름이 같다면, 내용이 달라도(토글 버튼 등) 같은 슬롯으로 인정
      score += 80;
    } else {
      // "Frame 1"끼리 같은 건 우연일 수 있으므로 소폭 가산
      score += 10;
    }
  }

  // --- Tier 2: 콘텐츠 및 형상 (Content & Geometry) [30~50점] ---

  // A. 텍스트 내용 비교 (Fuzzy Matching)
  if (base.type === "TEXT" && target.type === "TEXT") {
    const similarity = getLevenshteinSimilarity(
      attrsA.textContent || "",
      attrsB.textContent || ""
    );
    if (similarity > 0.7) {
      // 70% 이상 유사하면 점수 부여 (오타 수정 등 대응)
      score += 40 * similarity;
    }
  }

  // B. 마스크 속성 일치 (Masking Role)
  if (attrsA.isMask && attrsB.isMask) {
    score += 40; // 모양이 달라도 둘 다 마스크면 매칭
  }

  // C. 벡터 정점 개수 (Broken Vector / Icon)
  // 인스턴스가 아니더라도, 점의 개수가 같으면 같은 아이콘일 확률 높음
  if (
    attrsA.vectorVertexCount !== undefined &&
    attrsB.vectorVertexCount !== undefined
  ) {
    const diff = Math.abs(attrsA.vectorVertexCount - attrsB.vectorVertexCount);
    if (diff === 0)
      score += 30; // 정확히 일치
    else if (diff <= 2) score += 10; // 미세한 차이 허용
  }

  // --- Tier 3: 시각적 문맥 (Visual Context) [15점] ---

  // D. 비율 (Aspect Ratio) & 회전 대응
  // 텍스트는 줄바꿈 시 비율이 깨지므로 검사 제외!
  if (base.type !== "TEXT") {
    const wA = attrsA.width;
    const hA = attrsA.height || 1;
    const wB = attrsB.width;
    const hB = attrsB.height || 1;

    const ratioA = wA / hA;
    const ratioB = wB / hB;
    const invRatioB = hB / wB; // 90도 회전 시 비율

    // 10% 오차 허용
    if (Math.abs(ratioA - ratioB) < 0.1 || Math.abs(ratioA - invRatioB) < 0.1) {
      score += 15;
    }
  }

  return score;
}

/**
 * [Main] 전역 최적화 매칭 엔진 (Global Optimization)
 * Base Variant의 잎새들과 Target Variant의 잎새들을 1:1 매칭합니다.
 */
export function matchNodes(
  baseNodes: VirtualNode[],
  targetNodes: VirtualNode[]
): Map<string, VirtualNode> {
  const matches = new Map<string, VirtualNode>();
  const candidates: MatchCandidate[] = [];

  // 1. Candidate Generation (Matrix Calculation)
  // 모든 가능한 조합의 점수를 계산합니다.
  for (const base of baseNodes) {
    for (const target of targetNodes) {
      // 호환 가능한 타입끼리만 비교 (Soft Filter)
      if (areTypesCompatible(base.type, target.type)) {
        const score = calculateScore(base, target);

        // 최소 매칭 점수 (Threshold): 30점 미만은 남남으로 간주
        if (score >= 30) {
          candidates.push({ base, target, score });
        }
      }
    }
  }

  // 2. Global Optimization Sorting (핵심)
  // 점수가 높은 순서대로 정렬하되, 동점자는 '시각적 순서(Visual Order)'를 따름
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score; // 점수 높은 순 (Desc)
    }

    // [Tie-Breaking] 점수가 같다면? (예: 리스트 아이템 5개)
    // Y좌표 차이(Delta)가 적은 것을 우선시함.
    // 즉, "원래 위치에서 가장 덜 이동한 녀석"을 짝으로 선정
    const distA = Math.abs(a.base.attributes.y - a.target.attributes.y);
    const distB = Math.abs(b.base.attributes.y - b.target.attributes.y);
    return distA - distB; // 거리 짧은 순 (Asc)
  });

  // 3. Stable Marriage Selection (Greedy)
  const usedBaseIds = new Set<string>();
  const usedTargetIds = new Set<string>();

  for (const candidate of candidates) {
    // 이미 짝이 정해진 노드는 패스
    if (usedBaseIds.has(candidate.base.id)) continue;
    if (usedTargetIds.has(candidate.target.id)) continue;

    // 매칭 성사
    matches.set(candidate.base.id, candidate.target);
    usedBaseIds.add(candidate.base.id);
    usedTargetIds.add(candidate.target.id);
  }

  return matches;
}
