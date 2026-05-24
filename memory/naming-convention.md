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
| PHL1 + universal K_1^dir kernel | **PHL1c** |
| GHLOW2 + the same universal K_1^dir kernel (= PHL1c + σ₂) | **GHLOW2c** |
| GHLOW2 + extended directed kernel (also kills σ₂'s δ-variation) | **GHLOW2cc** |

The number of `c`'s equals the number of independent closed-form
correction layers applied: one `c` per universal-kernel layer, an
extra `c` per parametric (cubic-dependent) layer. Lowercase matters —
`PHL1c` not `PHL1C`. Applies to: TS field names (`phl1c`, `ghlow2c`,
`ghlow2cc`), local vars (`phl1cCurve`), UI toggle labels, figure
legends, paper symbols (`\siv^{\mathrm{PHL1c}}`,
`\siv^{\mathrm{GHLOW2c}}`, `\siv^{\mathrm{GHLOW2cc}}`). The
kernel-spike functions in `kernel.ts` are explicit about which baseline
and which kernel they target: `knotSpikePhl1` (universal), and
`knotSpikeGhlow2cc` (extended; the GHLOW2c spike is just
`knotSpikePhl1` reused).

**Why:** decided 2026-05-21 mid-session. The user pushed back on
`PHL1+corr` / `GHLOW2+corr` labels twice — `corr` reads as the
correlation operator in any quant codebase, and ambiguous abbreviations
make a finance-domain paper or code harder to scan. The lowercase
`c` is unambiguous and stays short.

**How to apply:** any new "X + closed-form correction" method on this
project gets the `Xc` name (lowercase c) by default; a method stacking
two independent correction layers on the same baseline gets `Xcc`. Never
abbreviate correction to `corr` anywhere — not in code identifiers, not
in UI labels, not in paper symbols, not in commit messages. Comments
explaining the rule may reference the forbidden term once for context;
everywhere else use `c` / `cc` or spell "correction".
