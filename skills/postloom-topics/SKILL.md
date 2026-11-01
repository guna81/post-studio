---
name: postloom-topics
description: Suggest fresh AI/tech topics for a social post, skipping anything already in the post log. Use when the user asks what to post today or wants topic ideas.
---

# Suggest topics

1. Find the workspace (folder with `brand.json`; ask if unclear). Read `brand.json` for audience and tone.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/cli.mjs log <workspace>` and note every title already used.
3. Web-search the last 48 hours of news relevant to the audience. Prefer primary sources.
4. Propose 3-5 topics. For each: title, one-sentence angle, why it's hot now, source URL. Drop any that overlap the log; verify each with `node ${CLAUDE_PLUGIN_ROOT}/cli.mjs check <workspace> "<title>"`.
5. Mark unverified or "reportedly" claims as such. Let the user pick; then offer `/postloom-draft`.
