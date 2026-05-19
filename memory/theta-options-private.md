---
name: theta-options-private
description: "theta-options is the user's PRIVATE research repo — never leak it into the public 2piece repo"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

`~/theta-options` is the user's **private research repository** where they do
their quantitative research (the broad unfinished local-vol/implied-vol
study, the SPXW calibrator + cached market data, the reference Python
implementations of BBF0/PHL1/GHLOW2/Dupire-PDE/Φ_BB). The public `~/2piece`
repo is a self-contained carve-out of one ATM-knot subset.

**Why:** the user explicitly said theta-options is private; `2piece` is
intended for public GitHub. Naming it, its paths, or its module names in any
public-facing file leaks the private codebase's structure.

**How to apply:** never reference `theta-options` (name, paths, file/module
names) in any committed `2piece` file *except* `CLAUDE.md` (the user's own
spec) and `memory/`. Public files use generic wording: "an
independently-developed Python reference", "the upstream calibration
pipeline". This was scrubbed once (2026-05-19) — keep it scrubbed. See
[[project-overview]] and [[stack-decisions]].
