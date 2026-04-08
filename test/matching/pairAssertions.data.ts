import type { PairAssertion } from "./pairAssertions";

/**
 * Auto-generated from test/audits/audit-baseline.json
 * by scripts/generate-pair-assertions.ts
 *
 * Contents: all `size-variant-reject` pairs identified by Phase 0 audit.
 * These assertions should FAIL in Phase 1a (engine behavior-preserving, still 1.3 ratio)
 * and PASS in Phase 1b (relaxed to 2.0 ratio).
 *
 * Do NOT hand-edit. Re-run `npx tsx scripts/generate-pair-assertions.ts` to regenerate.
 */
export const pairAssertions: PairAssertion[] = [
  {
    "fixture": "any/error-02",
    "description": "size-variant-reject: I258:34208;250:78017;255:17769;89:2941 ↔ I258:35995;250:78017;255:21926;89:2941 under I258:34208;250:78017;255:17769;89:2940",
    "nodeIdA": "I258:34208;250:78017;255:17769;89:2941",
    "nodeIdB": "I258:35995;250:78017;255:21926;89:2941",
    "kind": "must-match"
  },
  {
    "fixture": "any/error-02",
    "description": "size-variant-reject: I258:34208;250:78017;255:17770 ↔ I258:35995;250:78017;255:21927 under I258:34208;250:78017",
    "nodeIdA": "I258:34208;250:78017;255:17770",
    "nodeIdB": "I258:35995;250:78017;255:21927",
    "kind": "must-match"
  },
  {
    "fixture": "any/error-02",
    "description": "size-variant-reject: I258:34623;250:78017;255:17769;89:2941 ↔ I258:35996;250:78017;255:21926;89:2941 under I258:34623;250:78017;255:17769;89:2940",
    "nodeIdA": "I258:34623;250:78017;255:17769;89:2941",
    "nodeIdB": "I258:35996;250:78017;255:21926;89:2941",
    "kind": "must-match"
  },
  {
    "fixture": "any/error-02",
    "description": "size-variant-reject: I258:34623;250:78017;255:17770 ↔ I258:35996;250:78017;255:21927 under I258:34623;250:78017",
    "nodeIdA": "I258:34623;250:78017;255:17770",
    "nodeIdB": "I258:35996;250:78017;255:21927",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9583 ↔ I16215:35009;1579:9583 under 16215:34985",
    "nodeIdA": "I16215:34993;1579:9583",
    "nodeIdB": "I16215:35009;1579:9583",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9583 ↔ I16215:35009;1580:9594 under 16215:34985",
    "nodeIdA": "I16215:34993;1579:9583",
    "nodeIdB": "I16215:35009;1580:9594",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9584;1579:9590 ↔ I16215:35009;1579:9584;1642:9608 under I16215:34993;1579:9584",
    "nodeIdA": "I16215:34993;1579:9584;1579:9590",
    "nodeIdB": "I16215:35009;1579:9584;1642:9608",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9584;1579:9590 ↔ I16215:35009;1579:9584;1579:9590 under I16215:34993;1579:9584",
    "nodeIdA": "I16215:34993;1579:9584;1579:9590",
    "nodeIdB": "I16215:35009;1579:9584;1579:9590",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9584;1642:9608 ↔ I16215:35009;1579:9584;1642:9608 under I16215:34993;1579:9584",
    "nodeIdA": "I16215:34993;1579:9584;1642:9608",
    "nodeIdB": "I16215:35009;1579:9584;1642:9608",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1579:9584;1642:9608 ↔ I16215:35009;1579:9584;1579:9590 under I16215:34993;1579:9584",
    "nodeIdA": "I16215:34993;1579:9584;1642:9608",
    "nodeIdB": "I16215:35009;1579:9584;1579:9590",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1580:9594 ↔ I16215:35009;1579:9583 under 16215:34985",
    "nodeIdA": "I16215:34993;1580:9594",
    "nodeIdB": "I16215:35009;1579:9583",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34993;1580:9594 ↔ I16215:35009;1580:9594 under 16215:34985",
    "nodeIdA": "I16215:34993;1580:9594",
    "nodeIdB": "I16215:35009;1580:9594",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34995;1579:9588;1579:9590 ↔ I16215:35011;1579:9588;1642:9608 under I16215:34995;1579:9588",
    "nodeIdA": "I16215:34995;1579:9588;1579:9590",
    "nodeIdB": "I16215:35011;1579:9588;1642:9608",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34995;1579:9588;1579:9590 ↔ I16215:35011;1579:9588;1579:9590 under I16215:34995;1579:9588",
    "nodeIdA": "I16215:34995;1579:9588;1579:9590",
    "nodeIdB": "I16215:35011;1579:9588;1579:9590",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34995;1579:9588;1642:9608 ↔ I16215:35011;1579:9588;1642:9608 under I16215:34995;1579:9588",
    "nodeIdA": "I16215:34995;1579:9588;1642:9608",
    "nodeIdB": "I16215:35011;1579:9588;1642:9608",
    "kind": "must-match"
  },
  {
    "fixture": "any/Switchswitch",
    "description": "size-variant-reject: I16215:34995;1579:9588;1642:9608 ↔ I16215:35011;1579:9588;1579:9590 under I16215:34995;1579:9588",
    "nodeIdA": "I16215:34995;1579:9588;1642:9608",
    "nodeIdB": "I16215:35011;1579:9588;1579:9590",
    "kind": "must-match"
  },
  {
    "fixture": "button/Btnsbtn",
    "description": "size-variant-reject: I4214:395;3:315 ↔ I4214:585;3:315 under 4214:395",
    "nodeIdA": "I4214:395;3:315",
    "nodeIdB": "I4214:585;3:315",
    "kind": "must-match"
  },
  {
    "fixture": "button/Btnsbtn",
    "description": "size-variant-reject: I4214:453;3:481 ↔ I4214:643;3:352 under 4214:393",
    "nodeIdA": "I4214:453;3:481",
    "nodeIdB": "I4214:643;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "button/Btnsbtn",
    "description": "size-variant-reject: I4214:453;3:482 ↔ I4214:643;3:352 under 4214:393",
    "nodeIdA": "I4214:453;3:482",
    "nodeIdB": "I4214:643;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "button/tadaButton",
    "description": "size-variant-reject: I258:34208;250:78017;255:17769;89:2941 ↔ I258:35995;250:78017;255:21926;89:2941 under I258:34208;250:78017;255:17769;89:2940",
    "nodeIdA": "I258:34208;250:78017;255:17769;89:2941",
    "nodeIdB": "I258:35995;250:78017;255:21926;89:2941",
    "kind": "must-match"
  },
  {
    "fixture": "button/tadaButton",
    "description": "size-variant-reject: I258:34208;250:78017;255:17770 ↔ I258:35995;250:78017;255:21927 under I258:34208;250:78017",
    "nodeIdA": "I258:34208;250:78017;255:17770",
    "nodeIdB": "I258:35995;250:78017;255:21927",
    "kind": "must-match"
  },
  {
    "fixture": "button/tadaButton",
    "description": "size-variant-reject: I258:34623;250:78017;255:17769;89:2941 ↔ I258:35996;250:78017;255:21926;89:2941 under I258:34623;250:78017;255:17769;89:2940",
    "nodeIdA": "I258:34623;250:78017;255:17769;89:2941",
    "nodeIdB": "I258:35996;250:78017;255:21926;89:2941",
    "kind": "must-match"
  },
  {
    "fixture": "button/tadaButton",
    "description": "size-variant-reject: I258:34623;250:78017;255:17770 ↔ I258:35996;250:78017;255:21927 under I258:34623;250:78017",
    "nodeIdA": "I258:34623;250:78017;255:17770",
    "nodeIdB": "I258:35996;250:78017;255:21927",
    "kind": "must-match"
  },
  {
    "fixture": "button/urockButton",
    "description": "size-variant-reject: I4139:622;3:481 ↔ I4139:784;3:352 under 4139:412",
    "nodeIdA": "I4139:622;3:481",
    "nodeIdB": "I4139:784;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "button/urockButton",
    "description": "size-variant-reject: I4139:622;3:482 ↔ I4139:784;3:352 under 4139:412",
    "nodeIdA": "I4139:622;3:482",
    "nodeIdB": "I4139:784;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "button/urockButton",
    "description": "size-variant-reject: I4139:736;3:315 ↔ I4139:784;3:353 under 4139:412",
    "nodeIdA": "I4139:736;3:315",
    "nodeIdB": "I4139:784;3:353",
    "kind": "must-match"
  },
  {
    "fixture": "chip/Chips",
    "description": "size-variant-reject: I480:5722;6273:28798 ↔ I480:5769;6273:28798 under 480:5769",
    "nodeIdA": "I480:5722;6273:28798",
    "nodeIdB": "I480:5769;6273:28798",
    "kind": "must-match"
  },
  {
    "fixture": "chip/Chips",
    "description": "size-variant-reject: I480:5733;158:10596 ↔ I480:5772;158:10596 under 480:5772",
    "nodeIdA": "I480:5733;158:10596",
    "nodeIdB": "I480:5772;158:10596",
    "kind": "must-match"
  },
  {
    "fixture": "chip/urock-chips",
    "description": "size-variant-reject: I480:5722;6273:28798 ↔ I480:5769;6273:28798 under 480:5769",
    "nodeIdA": "I480:5722;6273:28798",
    "nodeIdB": "I480:5769;6273:28798",
    "kind": "must-match"
  },
  {
    "fixture": "chip/urock-chips",
    "description": "size-variant-reject: I480:5733;158:10596 ↔ I480:5772;158:10596 under 480:5772",
    "nodeIdA": "I480:5733;158:10596",
    "nodeIdB": "I480:5772;158:10596",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btn",
    "description": "size-variant-reject: I4139:622;3:481 ↔ I4139:784;3:352 under 4139:412",
    "nodeIdA": "I4139:622;3:481",
    "nodeIdB": "I4139:784;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btn",
    "description": "size-variant-reject: I4139:622;3:482 ↔ I4139:784;3:352 under 4139:412",
    "nodeIdA": "I4139:622;3:482",
    "nodeIdB": "I4139:784;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btn",
    "description": "size-variant-reject: I4139:736;3:315 ↔ I4139:784;3:353 under 4139:412",
    "nodeIdA": "I4139:736;3:315",
    "nodeIdB": "I4139:784;3:353",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btnsbtn",
    "description": "size-variant-reject: I4214:395;3:315 ↔ I4214:585;3:315 under 4214:395",
    "nodeIdA": "I4214:395;3:315",
    "nodeIdB": "I4214:585;3:315",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btnsbtn",
    "description": "size-variant-reject: I4214:453;3:481 ↔ I4214:643;3:352 under 4214:393",
    "nodeIdA": "I4214:453;3:481",
    "nodeIdB": "I4214:643;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Btnsbtn",
    "description": "size-variant-reject: I4214:453;3:482 ↔ I4214:643;3:352 under 4214:393",
    "nodeIdA": "I4214:453;3:482",
    "nodeIdB": "I4214:643;3:352",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Chips",
    "description": "size-variant-reject: I480:5722;6273:28798 ↔ I480:5769;6273:28798 under 480:5769",
    "nodeIdA": "I480:5722;6273:28798",
    "nodeIdB": "I480:5769;6273:28798",
    "kind": "must-match"
  },
  {
    "fixture": "failing/Chips",
    "description": "size-variant-reject: I480:5733;158:10596 ↔ I480:5772;158:10596 under 480:5772",
    "nodeIdA": "I480:5733;158:10596",
    "nodeIdB": "I480:5772;158:10596",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: 16215:35141 ↔ 16215:35159 under 16215:35116",
    "nodeIdA": "16215:35141",
    "nodeIdB": "16215:35159",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35118;16215:35225 ↔ I16215:35134;16215:35225 under I16215:35118;16215:35224",
    "nodeIdA": "I16215:35118;16215:35225",
    "nodeIdB": "I16215:35134;16215:35225",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35118;16215:35225 ↔ I16215:35134;16215:35226 under I16215:35118;16215:35224",
    "nodeIdA": "I16215:35118;16215:35225",
    "nodeIdB": "I16215:35134;16215:35226",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35118;16215:35226 ↔ I16215:35134;16215:35225 under I16215:35118;16215:35224",
    "nodeIdA": "I16215:35118;16215:35226",
    "nodeIdB": "I16215:35134;16215:35225",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35118;16215:35226 ↔ I16215:35134;16215:35226 under I16215:35118;16215:35224",
    "nodeIdA": "I16215:35118;16215:35226",
    "nodeIdB": "I16215:35134;16215:35226",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35135;16215:35249 ↔ I16215:35153;16215:35249 under I16215:35135;16215:35248",
    "nodeIdA": "I16215:35135;16215:35249",
    "nodeIdB": "I16215:35153;16215:35249",
    "kind": "must-match"
  },
  {
    "fixture": "wanted/SegmentedControlsegmentedControl",
    "description": "size-variant-reject: I16215:35139;16215:35249 ↔ I16215:35157;16215:35249 under I16215:35139;16215:35248",
    "nodeIdA": "I16215:35139;16215:35249",
    "nodeIdB": "I16215:35157;16215:35249",
    "kind": "must-match"
  }
];
