---
name: post-studio-draft
description: Write and render a post (a carousel today; other formats later) plus caption for a chosen topic and channel, and log it as drafted. Use after a topic is chosen.
---

# Draft a post

Inputs: a topic and a workspace (folder with `brand.json` and `theme.json`).

1. `node ${CLAUDE_PLUGIN_ROOT}/cli.mjs check <workspace> "<title>"`. Stop on DUPLICATE and suggest a new angle.
2. Research and verify every fact, number and price with web search. Never invent statistics. Label estimates in the slide footer.
3. Pick the format (default `brand.json` > `defaults.format`, usually `carousel`) and channel (default `defaults.channel`). Read `${CLAUDE_PLUGIN_ROOT}/formats/<format>/FORMAT.md` for the content shape, limits and render command, and `${CLAUDE_PLUGIN_ROOT}/channels/<channel>/CHANNEL.md` for caption rules. Check the channel accepts the format.
4. Create `<workspace>/drafts/YYYY-MM-DD-<slug>/` with the format's content file and `caption.txt` (match `brand.tone`, include `brand.hashtags`). Render with the command in FORMAT.md, then READ every output file and fix overflow, clipping or low contrast; re-render.
5. Log: `node ${CLAUDE_PLUGIN_ROOT}/cli.mjs add <workspace> drafts/<dir> "<title>" --format <format> --channel <channel> <source urls...>`.
6. Show the user the preview (`review.html` for carousels) path and the caption. Do not mark it approved yourself; wait for explicit approval, then run `cli.mjs status <workspace> drafts/<dir> approved`.
