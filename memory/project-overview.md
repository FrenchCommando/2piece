---
name: project-overview
description: What the 2piece repo is and its core deliverables
metadata: 
  node_type: memory
  type: project
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

`~/2piece` is a focused note + interactive tool: accuracy of
local→implied vol maps (BBF0, PHL1, GHLOW2) and a closed-form Φ_BB correction
that repairs PHL1 at a cubic-vol knot placed exactly at-the-money (k=0). It is
the simple, observable subset of the broad unfinished paper in the user's
**private research repo** `~/theta-options` (see [[theta-options-private]];
general knot at w=k_knot/σ_total; restricting to the ATM knot w=0 collapses
the diverging-polynomial hack — that is the point).

Deliverables: self-contained GitHub repo; in-browser interactive GitHub Pages
(Vite); README with formulas; GitHub Action building the LaTeX paper PDF as an
artifact. See [[stack-decisions]] and [[example-params]].
