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
