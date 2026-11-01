# Post Studio

A local, multi-project studio that turns a topic into a ready-to-post social media asset using your **Claude Code** login. No API key.

Like Label Studio: sign up, create **projects** (platform, theme, goal, audience, tone, logo), and each project keeps its own history, previews and export.

Today: **carousels** for **Instagram**. *Formats* (what a post is) are separate from *channels* (where it goes), so video, LinkedIn and others can be added later.

- **Suggest topics**: searches recent news for your audience and skips anything already in the project history.
- **Generate**: Claude writes the slides and caption (guided by the project's goal, audience and tone); Post Studio renders PNGs with Playwright.
- **Review**: edit, re-render, approve, then post manually.
- **Edit with a prompt**: on a post, describe a change ("shorten slide 2, add a CTA") and Claude revises the slides and caption. One level of undo.
- **Account**: change your name, email or password from the link in the top bar.
- **Theme from your brand**: in a project's settings, pull colours and a logo from your website (it reads the page's CSS) or pick colours from an image (processed in your browser). Platform and format also live in settings.
- **Export**: one post or a whole project as a ZIP (images, captions, settings) or JSON.

## Quick start

```bash
git clone <this repo> post-studio && cd post-studio
npm install && npx playwright install chromium
node bin/post-studio.mjs doctor     # checks Node 20+, Claude Code, Playwright, Chromium
node bin/post-studio.mjs start      # open http://localhost:4173, sign up, create a project
```

## Requirements

- **[Claude Code](https://claude.com/claude-code) is required.** Post Studio has no AI of its own and needs no API key. Topic suggestions and slide/caption generation run by calling the `claude` CLI (`claude -p`) on your machine, using your own Claude Code login and plan usage. Install it and run `claude` once to log in. Without it you can still create projects, edit settings, and view or export existing posts, but Suggest topics and Generate will fail.
- Node 20+, plus Playwright with Chromium (installed by the commands above) for rendering PNGs.

## Where data lives

Accounts and projects are stored in `~/.post-studio` (override with `POST_STUDIO_HOME`; `post-studio where` prints it). Passwords are scrypt-hashed. Each project is a plain folder:

```
~/.post-studio/projects/<id>/
  project.json    id, owner
  brand.json      name, about, goal, audience, tone, cta, hashtags, logo, colours, defaults
  theme.json      slide size, 4 colour themes (derived from your two colours), fonts
  posts-log.json  date, title, status per post
  drafts/         one folder per post: slides.json, caption.txt, slide-N.png
  assets/         logo
```

Existing workspace folder? `post-studio import <dir> <your-email>` copies it in as a project.
Env: `PORT`, `POST_STUDIO_HOME`, `POST_STUDIO_SIGNUP=off` (close signup once the first account exists).

## Formats and channels

```
formats/carousel/   index.mjs (prompt, validation, previews), render.mjs, FORMAT.md
channels/instagram/ index.mjs (caption rules, URL check, hints), CHANNEL.md
```

To add one, copy a folder, register it in `formats/registry.mjs` or `channels/registry.mjs`, and describe it in its `.md` file (the skills read those). Each log entry records its `format` and `channel`.

## Carousel slide types
`cover`, `text`, `list`, `stat`, `table`; see `formats/carousel/FORMAT.md`.

## Claude Code plugin (skills)

Point Claude Code at this folder as a plugin (`claude --plugin-dir post-studio`) to get `/post-studio-setup`, `/post-studio-topics`, `/post-studio-draft` and `/post-studio-post`. They use `cli.mjs` for the log and each format's renderer for output.

## Safety
Binds to 127.0.0.1 only, checks the Host header, accepts JSON only, uses HttpOnly SameSite=Strict session cookies, rate-limits login, isolates each user's projects, and gives Claude web search as its only tool; the server writes all files.

## License
MIT
