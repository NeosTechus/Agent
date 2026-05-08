// Reachability test for the CONSENT_RECORDINGS structural carve-out
// (PRD §5.15 + §6.4 — 7-year retention; §5.22 day-30 cron must not touch).
//
// Statically walks the relative-import graph rooted at services/account/logic.ts
// and asserts the literal substring "CONSENT_RECORDINGS" never appears in any
// reachable .ts file. See /docs/DECISIONS.md 2026-04-30 "Day 2 (Row 10) Tier 3".

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "logic.ts");
const REL_IMPORT = /from\s+["'](\.\.?\/[^"']+)["']/g;

async function resolveTs(spec: string, fromFile: string): Promise<string | null> {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    path.join(base, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isFile() && c.endsWith(".ts")) return c;
    } catch {
      // skip
    }
  }
  return null;
}

async function collectReachable(entry: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>(); // absolute path -> source
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    let src: string;
    try {
      src = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    seen.set(file, src);
    const matches = src.matchAll(REL_IMPORT);
    for (const m of matches) {
      const spec = m[1]!;
      const resolved = await resolveTs(spec, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

describe("runScheduledDeletions cron call graph", () => {
  it("never references CONSENT_RECORDINGS in any reachable module", async () => {
    const graph = await collectReachable(ROOT);
    expect(graph.size).toBeGreaterThan(0);

    // Strip comments before checking — the carve-out is about runtime
    // references, not documentation. env.ts is the binding's declaration
    // site (the rule's source of truth) and is exempt for the same reason
    // ESLint exempts it.
    const ENV_TS = path.resolve(__dirname, "..", "..", "..", "env.ts");
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    const offenders: string[] = [];
    for (const [file, src] of graph) {
      if (path.resolve(file) === ENV_TS) continue;
      if (stripComments(src).includes("CONSENT_RECORDINGS")) offenders.push(file);
    }

    if (offenders.length > 0) {
      const list = offenders.map((f) => ` - ${path.relative(process.cwd(), f)}`).join("\n");
      throw new Error(
        `CONSENT_RECORDINGS carve-out breached. The following files are reachable from runScheduledDeletions and reference the binding:\n${list}\n` +
          `See /docs/DECISIONS.md 2026-04-30 "Day 2 (Row 10) Tier 3" before adding a caller.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
