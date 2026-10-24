---
description: Run build, lint, commit and push; log output
---

Run `npm run build` and `npm run lint`, tee output to ./.agent-logs/ship-<timestamp>.log.
If both pass, git add -A, commit with a concise message, and push. Never commit .env.
