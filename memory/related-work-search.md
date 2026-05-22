---
name: related-work-search
description: For related-work / literature passes on any project that has a sibling notes folder (per-paper *.md summaries in an adjacent project), walk that folder before doing web/arXiv search. The user's filing cabinet is higher-signal than topic search.
metadata:
  node_type: memory
  type: feedback
---

Before any related-work pass, citation triage, or "what should we
compare against" task on a project: check whether an adjacent project
directory contains per-paper `*.md` summaries or `*_relevance.md`
files. If yes, read every file there first. Only after walking that
folder should arXiv / web search begin.

**Why:** Decided 2026-05-22 on 2piece. The original 2026-05-21
literature pass was framed strictly as a *preemption check* and never
walked `theta-options\local_vol\*.md`, the sibling project's paper-
summary folder. Result: Guyon–Henry-Labordère 2010 (the HKE
quadrature alternative to PHL/GHLOW) and Medvedev–Scaillet 2007 (the
ODE-in-θ parallel route) were both missed even though the user had
already written relevance memos for them. A re-search on 2026-05-22
found both — entirely by reading those notes, not by web search. The
web-search angles returned zero new candidates. The user called this
out: "so, your research was just reusing a research we already did?"
— and the honest answer was yes. Sibling notes are the high-signal
source; web search is for catching what the user hasn't seen yet.

**How to apply:**
- Step 1 of any related-work pass: read CLAUDE.md to find pointers to
  sibling notes folders, then `ls` and read every `*.md` there.
- Step 2: judge each note's paper against the current task under both
  framings — *preemption* (did they do this first?) AND *alternative
  methodology* (would a reviewer ask why we don't compare?).
- Step 3 (only now): web/arXiv search for things the sibling folder
  doesn't cover.
- Skip-list discipline: never key a skip-list entry by `author` alone
  when the author is prolific. Key by `author + year + topic` so a
  different paper by the same author isn't masked by a casually-
  abbreviated entry. The 2026-05-21 skip list had "Guyon path-
  dependent volatility 2014" which made a separate Guyon–Henry-
  Labordère 2010 paper look already-considered.
