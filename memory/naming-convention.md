---
name: naming-convention
description: 2piece project naming rule — lowercase 'c' suffix for closed-form knot correction; the abbreviation 'corr' is forbidden because in finance it means 'correlation'
metadata:
  node_type: memory
  type: feedback
---

In this project (and in any quant/finance context generally), the
abbreviation `corr` is **forbidden as shorthand for "correction"** because
it conflicts with the standard meaning **correlation**. Use the lowercase
suffix `c` instead, or the full word `correction` when prose readability
wins:

| concept | name |
|---|---|
| PHL1 + universal Φ_BB^dir kernel | **PHL1c** |
| GHLOW2 + extended directed kernel (eq:ghlow2-dir) | **GHLOW2c** |

Lowercase matters — `PHL1c` not `PHL1C`. Applies to: TS field names
(`phl1c`, `ghlow2c`), local vars (`phl1cCurve`), UI toggle labels,
figure legends, paper symbols (`\siv^{\mathrm{PHL1c}}`,
`\siv^{\mathrm{GHLOW2c}}`). The kernel-spike functions in `phibb.ts`
are explicit about which baseline they target: `knotSpikePhl1`,
`knotSpikeGhlow2`.

**Why:** decided 2026-05-21 mid-session. The user pushed back on
`PHL1+corr` / `GHLOW2+corr` labels twice — `corr` reads as the
correlation operator in any quant codebase, and ambiguous abbreviations
make a finance-domain paper or code harder to scan. The lowercase
`c` is unambiguous and stays short.

**How to apply:** any new "X + closed-form correction" method on this
project gets the `Xc` name (lowercase c) by default. Never abbreviate
correction to `corr` anywhere — not in code identifiers, not in UI
labels, not in paper symbols, not in commit messages. Comments
explaining the rule may reference the forbidden term once for
context; everywhere else use `c` or spell "correction".
