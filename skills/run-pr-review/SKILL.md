---
name: run-pr-review
description: Respond to PR review comments.
---

Assumes skill: prefs-git

## Kickoff

1. If PR not specified, ask which PR
2. Ask: address all comments or specific ones?
3. Proceed with chosen mode

## Modes

- **Batch**: Address all comments, then reply (default for simple fixes)
- **Interactive**: Go comment-by-comment—discuss, align, change, reply—useful when tradeoffs need user input

## Procedure

1. Read PR context: description, comments, review threads, diff
2. Identify actionable items from feedback
3. Check branch state: ensure on correct branch, pull latest
4. Make changes
5. Iterate with user to match expectations
6. Commit and push (with confirmation per prefs-git)
7. Reply to comments, referencing the addressing commit
8. When all comments addressed: re-request review if needed

## Reply tone

- Professional but approachable
- When reviewer catches something you could have gotten, acknowledge briefly ("Good catch", "Thanks, you're right")
- Link commits when replying with fixes
