// test/audits/hungarianObserver/formatText.ts

import type { ObserverResult, MergeRecord, Pass2Data } from "./types";

export function formatText(result: ObserverResult): string {
  const lines: string[] = [];

  lines.push(`=== Hungarian Observer: ${result.fixture} ===`);
  lines.push(`Variant count: ${result.variantCount}`);
  lines.push(`Merge order:`);
  result.mergeOrder.forEach((name, i) => {
    lines.push(`  [${i + 1}] ${name}`);
  });
  lines.push("");

  for (const merge of result.merges) {
    formatMerge(merge, lines);
  }

  // Summary
  lines.push("=== Summary ===");
  const stats = collectStats(result);
  lines.push(`Total merges: ${stats.totalMerges}`);
  lines.push(`  Pass 1 definite matches: ${stats.pass1Count}`);
  lines.push(`  Pass 2 Hungarian accepted: ${stats.pass2Accepted}`);
  lines.push(`  Pass 2 Hungarian rejected (threshold): ${stats.pass2Rejected}`);
  lines.push(`  Veto cells: ${stats.vetoCells}`);
  lines.push(`Signal activity:`);
  for (const [name, count] of Object.entries(stats.signalActivity).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${name}: ${count} non-neutral`);
  }

  return lines.join("\n");
}

function formatMerge(merge: MergeRecord, lines: string[]) {
  const sep = merge.depth === 0
    ? "═".repeat(60)
    : "─".repeat(60);

  lines.push(sep);
  lines.push(`Merge [${merge.index}]: ${merge.path}`);
  if (merge.variantA) {
    lines.push(`  ${merge.variantA} ↔ ${merge.variantB}`);
  }
  lines.push(`  A children: ${merge.childrenACount}  |  B children: ${merge.childrenBCount}`);
  lines.push(sep);
  lines.push("");

  // Pass 1
  if (merge.pass1.length > 0) {
    lines.push("Pass 1 (definite match):");
    for (const m of merge.pass1) {
      lines.push(`  ✓ ${m.aNode.name} (${m.aNode.type}, ${m.aNode.id}) ↔ ${m.bNode.name} (${m.bNode.type}, ${m.bNode.id})  [${m.reason}]`);
    }
    lines.push("");
  } else {
    lines.push("Pass 1: (none)");
    lines.push("");
  }

  // Pass 2
  if (merge.pass2) {
    formatPass2(merge.pass2, lines);
  } else {
    lines.push("Pass 2: (skipped — no free nodes on one or both sides)");
  }
  lines.push("");

  // Sub-merges
  for (const sub of merge.subMerges) {
    formatMerge(sub, lines);
  }
}

function formatPass2(pass2: Pass2Data, lines: string[]) {
  lines.push("Pass 2 (Hungarian cost matrix):");
  lines.push("");

  // Header: columns are A nodes
  const colHeaders = pass2.freeA.map(n => `${n.name}(${n.type.substring(0, 5)})`);
  const colWidth = Math.max(20, ...colHeaders.map(h => h.length + 2));

  // Matrix
  lines.push(`${"".padEnd(25)}${colHeaders.map(h => h.padEnd(colWidth)).join("")}`);
  lines.push(`${"".padEnd(25)}${colHeaders.map(() => "─".repeat(colWidth - 1) + " ").join("")}`);

  for (let ri = 0; ri < pass2.freeB.length; ri++) {
    const bNode = pass2.freeB[ri];
    const rowLabel = `${bNode.name}(${bNode.type.substring(0, 5)})`.padEnd(25);
    const cells = pass2.matrix[ri];

    // Cost row
    const costLine = cells.map(cell => {
      const costStr = cell.cost === Infinity
        ? "Inf ✗"
        : `${cell.cost.toFixed(3)} ${cell.decision === "match" ? "✓" : "✗"}`;
      return costStr.padEnd(colWidth);
    }).join("");
    lines.push(`${rowLabel}${costLine}`);

    // Signal breakdown per cell (indented)
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      for (const sig of cell.signals) {
        if (sig.kind === "neutral") continue; // 침묵 신호 생략
        const costField = sig.cost !== undefined
          ? sig.cost.toFixed(3)
          : sig.score !== undefined
            ? `s=${sig.score.toFixed(2)}`
            : "-";
        lines.push(`${"".padEnd(27)}└─ ${sig.signalName}: ${sig.kind} ${costField} — ${sig.reason}`);
      }
    }
    lines.push("");
  }

  // Assignment summary
  lines.push("Assignment:");
  for (const entry of pass2.assignment) {
    const status = entry.accepted ? "✓ ACCEPTED" : "✗ REJECTED (> threshold)";
    lines.push(`  ${entry.aNode.name} ↔ ${entry.bNode.name}  cost=${entry.cost.toFixed(3)}  ${status}`);
  }

  if (pass2.unmatched.length > 0) {
    lines.push(`Unmatched B: ${pass2.unmatched.map(n => n.name).join(", ")}`);
  }
}

interface Stats {
  totalMerges: number;
  pass1Count: number;
  pass2Accepted: number;
  pass2Rejected: number;
  vetoCells: number;
  signalActivity: Record<string, number>;
}

function collectStats(result: ObserverResult): Stats {
  const stats: Stats = {
    totalMerges: 0,
    pass1Count: 0,
    pass2Accepted: 0,
    pass2Rejected: 0,
    vetoCells: 0,
    signalActivity: {},
  };

  function walk(merge: MergeRecord) {
    stats.totalMerges++;
    stats.pass1Count += merge.pass1.length;
    if (merge.pass2) {
      for (const entry of merge.pass2.assignment) {
        if (entry.accepted) stats.pass2Accepted++;
        else stats.pass2Rejected++;
      }
      for (const row of merge.pass2.matrix) {
        for (const cell of row) {
          if (cell.decision === "veto") stats.vetoCells++;
          for (const sig of cell.signals) {
            if (sig.kind !== "neutral") {
              stats.signalActivity[sig.signalName] =
                (stats.signalActivity[sig.signalName] ?? 0) + 1;
            }
          }
        }
      }
    }
    for (const sub of merge.subMerges) {
      walk(sub);
    }
  }

  for (const merge of result.merges) {
    walk(merge);
  }

  return stats;
}
