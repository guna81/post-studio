---
name: post-studio-setup
description: Create or check a Post Studio workspace (brand.json, theme.json, logo, post log) for social posts. Use when starting Post Studio for a new brand or when a workspace is missing files.
---

# Post Studio workspace setup

A workspace is a folder holding one brand's files. The Post Studio code (this plugin, `${CLAUDE_PLUGIN_ROOT}`) never contains brand data.

0. Prefer the studio UI: `node ${CLAUDE_PLUGIN_ROOT}/bin/post-studio.mjs start`, then sign up and create a project (it derives themes with a contrast check). Projects are stored as workspace folders under the data folder (`node ${CLAUDE_PLUGIN_ROOT}/bin/post-studio.mjs where`), and every skill can use one of those folders as `<workspace>`. To bring a folder you built by hand into the studio: `post-studio import <dir> <account-email>`. Otherwise follow the steps below.
1. Ask where the workspace should be (default `./<brand-slug>` next to the current project). If it already has `brand.json` and `theme.json`, just verify them and stop.
2. Ask, in one message: brand name; one-line description; audience; tone; closing call to action (e.g. "Save this · Follow X"); hashtags; logo file or URL (optional, SVG/PNG); 4 hex colors per theme or one primary and one accent (you derive `blue|light|dark|pop` and check text/background contrast is readable).
3. Copy `${CLAUDE_PLUGIN_ROOT}/examples/demo/` as the starting point, then write `brand.json` and `theme.json` from the answers. Put the logo in `assets/` and set `brand.logo` to its relative path. Fonts need not match the brand's.
4. Check dependencies: `node --version` (20+), and Playwright in `${CLAUDE_PLUGIN_ROOT}`. If missing, tell the user to run `cd ${CLAUDE_PLUGIN_ROOT} && npm install && npx playwright install chromium` (do not run installs without their OK).
5. Report the workspace path. Remind them that the workspace may contain channel details and should be kept out of the open-source repo; never write tokens or passwords into it.
