---
name: tracked-pdf
description: 2piece-paper.pdf is intentionally tracked and manually refreshed — never gitignore or rm it
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 95a346a1-a6c8-468c-bb21-50b6da0e265b
---

`2piece-paper.pdf` at the **repo root** of `~/2piece` is committed on
purpose. Source of truth is `paper/2piece-paper.tex`; `paper.yml` builds the
authoritative PDF as the `2piece-paper` CI artifact. The user **manually**
downloads that artifact and overwrites the tracked copy after paper changes.

**Why:** the user wants a convenient checked-in PDF and accepts that it can
lag the source between manual refreshes. They pushed back twice on automated
PDF handling.

**How to apply:** do NOT add `*.pdf`/`paper/*.pdf` to `.gitignore`, do NOT
`git rm --cached` it, do NOT try to auto-generate/commit it from CI. If the
`.tex` changes, just note the tracked PDF is now stale until the user
refreshes it; don't "fix" it. See [[stack-decisions]].
