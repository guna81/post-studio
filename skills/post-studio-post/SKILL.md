---
name: post-studio-post
description: Publish an approved Post Studio draft to its channel (Instagram today) and mark it posted. Use only when the user asks to post a specific approved draft.
---

# Publish a post

Only for drafts whose log status is `approved`. If it is `drafted`, ask the user to approve first. Never publish without explicit approval of the final content and caption in this conversation.

1. Look up the draft in the log (`node ${CLAUDE_PLUGIN_ROOT}/cli.mjs log <workspace>`) to get its `channel`.
2. Read `${CLAUDE_PLUGIN_ROOT}/channels/<channel>/CHANNEL.md` and follow its steps exactly. Always STOP before the final publish click and ask the user for a last yes.
3. Never enter credentials or store tokens; if the user is logged out, ask them to log in.
4. After publishing: `node ${CLAUDE_PLUGIN_ROOT}/cli.mjs status <workspace> drafts/<dir> posted <post-url>`.
5. If a step fails twice, stop and tell the user; offer the manual fallback in CHANNEL.md.
