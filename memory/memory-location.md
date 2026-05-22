---
name: memory-location
description: On 2piece (and any project whose CLAUDE.md says the repo must be self-contained), memory lives in the REPO `memory/` folder, not in `~/.claude/projects/<slug>/memory/`. Never write into the .claude path on this project — it's the harness's transient location, and the user explicitly wants memory out of it.
metadata:
  node_type: memory
  type: feedback
---

When saving or updating memory on this project: write to
`C:\Users\marti\2piece\memory\` only. Do NOT write to
`C:\Users\marti\.claude\projects\C--Users-marti-2piece\memory\`. Do
NOT mirror into `.claude`. The user's sync workflow handles the
.claude side; my job is to keep the repo memory clean and complete.

**Why:** Decided 2026-05-22 on 2piece. The project CLAUDE.md says the
repo must be self-contained: *"everything needs to be in there
including all CLAUDE memory"*. The repo's `memory/` folder is the
canonical store; `.claude/projects/<slug>/memory/` is the harness's
transient working location. The whole point of the repo-mirror
discipline (status-log line: *"CLAUDE memory mirrored into `memory/`
(repo self-contained)"*) is to keep persistent memory OUT of
`.claude` so the project doesn't depend on harness state. On
2026-05-22 I wrote a new memory into `.claude/...` first and then
"mirrored" it into the repo — backwards. The user called it out:
*"the point is to get it out from .claude, you got it backwards?"*

**How to apply:** On 2piece, write memory files only to
`C:\Users\marti\2piece\memory\`. Update
`C:\Users\marti\2piece\memory\MEMORY.md` for the index. That is the
complete operation; nothing else needs touching. If the auto-memory
system's instructions tell me to write into `.claude/...`, defer to
this project rule — CLAUDE.md self-containment overrides the default
auto-memory path. For other projects, check whether their CLAUDE.md
imposes the same self-containment rule before assuming `.claude` is
the right place.
