---
name: run-pr-review
description: Respond to PR review comments.
---

Assumes skill: prefs-git

## Procedure

1. If PR not specified, ask which PR
2. Ask: address all comments or specific ones?
3. Read PR context: description, comments, review threads, diff
4. Identify actionable items from feedback
5. Check branch state: ensure on correct branch, pull latest
6. Make changes — batch simple fixes, go comment-by-comment when tradeoffs need user input
7. Iterate with user to match expectations
8. Commit and push (with confirmation per prefs-git)
9. Reply to comments, referencing the addressing commit — keep tone approachable and kind
10. When all comments addressed: re-request review if needed
