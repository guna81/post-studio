# Postloom

A local studio that turns a topic into a ready-to-post social media asset using your **Claude Code** login. No API key.

Today: **carousels** for **Instagram**. The design separates *formats* (what a post is) from *channels* (where it goes), so video, LinkedIn and others can be added without touching the rest.

- **Suggest topics**: searches recent news and skips anything already in your log.
- **Generate**: Claude writes the slides and caption; Postloom renders PNGs with Playwright.
- **Review**: edit text, re-render, approve, then post manually (Instagram Graph API / browser automation are on the roadmap).
- **Log**: every post is recorded with date, title and status so you never repeat a topic.

## Quick start

```bash
git clone <this repo> postloom && cd postloom
npm install && npx playwright install chromium
node bin/postloom.mjs doctor        # checks Node 20+, Claude Code, Playwright, Chromium
node bin/postloom.mjs init          # asks about your brand, creates a workspace, starts the studio
```

Once published to npm: `npx postloom init`. Try the sample brand first with `npm run demo`.
Requires the [Claude Code](https://claude.com/claude-code) CLI, logged in (run `claude` once).

## Your own workspace

Code lives here; **your brand lives in a separate workspace folder** (keep it in its own repo if you like):

```
my-brand/
  brand.json      name, about, audience, tone, cta, hashtags, logo (optional path)
  theme.json      slide size, 4 color themes (blue|light|dark|pop), fonts
  posts-log.json  created automatically
  drafts/         one folder per post: slides.json, caption.txt, slide-N.png, review.html
  assets/         logo etc.
```

`postloom init` creates this for you (give it two colours and it derives the four themes with readable contrast). Run it later with `postloom start ../my-brand` (or `node server.mjs ../my-brand`; env: `POSTLOOM_WORKSPACE`, `PORT`).

## Formats and channels

```
formats/carousel/   index.mjs (prompt, validation, previews), render.mjs, FORMAT.md
channels/instagram/ index.mjs (caption rules, URL check, hints), CHANNEL.md
```

To add one, copy a folder, register it in `formats/registry.mjs` or `channels/registry.mjs`, and describe it in its `.md` file (the skills read those). Each log entry records its `format` and `channel`.

## Carousel slide types
`cover`, `text`, `list`, `stat`, `table`; see `formats/carousel/FORMAT.md`.

## Claude Code plugin (skills)

Point Claude Code at this folder as a plugin (`claude --plugin-dir postloom`) to get `/postloom-setup`, `/postloom-topics`, `/postloom-draft` and `/postloom-post`. They use `cli.mjs` for the log and each format's renderer for output.

## Safety
Binds to 127.0.0.1 only, checks the Host header, accepts JSON only, and gives Claude web search as its only tool; the server writes all files.

## License
MIT
