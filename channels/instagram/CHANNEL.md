# Channel: Instagram

Accepts: `carousel` and `reel` production plans. Caption: 3–5 short lines, a save/share call, and at most 5 optional hashtags (choose relevant entries from `brand.hashtags`). This is the app’s caption validation rule.

Carousel exports contain ordered slide PNGs and a caption. Reel exports contain a script, storyboard, filming checklist, and SVG preview; film and edit the video before uploading it manually.

The browser-assisted steps below apply to carousel PNGs. The local app itself exports files and opens Instagram for manual publishing.

## Post with Claude in Chrome
Only for drafts whose log status is `approved`, and only after the user explicitly approves the final slides and caption in this conversation.

1. Read `caption.txt`; list `slide-1.png … slide-N.png` in order.
2. Load the Chrome tools (see the claude-in-chrome skill), get tab context, open a NEW tab at https://www.instagram.com/. If logged out, stop and ask the user to log in themselves. Never enter credentials.
3. Create > Post, upload the PNGs in order, advance to the caption step, paste the caption.
4. STOP before Share. Show a screenshot and ask for a final yes. Share only on yes.
5. Get the post URL, then `node <post-studio>/cli.mjs status <workspace> drafts/<dir> posted <url>`.
6. If the UI changes or an upload step fails twice, stop and tell the user. Fallback: they upload manually from the draft folder and give you the URL.

## Later: Instagram Graph API
Business/Creator account linked to a Facebook Page, a Meta app, a long-lived token and publicly hosted images; `POST /{ig-user-id}/media` per slide, then `media_publish`. The token belongs in the workspace `.env`, never in chat or the log.
