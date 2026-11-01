# Format: carousel

Up to 10 image slides, size from the workspace `theme.json` (1080×1350 by default).

**Files in a draft folder:** `slides.json` = `{ "title", "slides": [...] }`, `caption.txt`, `slide-N.png`, `review.html`.

**Render:** `node <post-studio>/formats/carousel/render.mjs <workspace> drafts/<dir>`

**Slide types** (limits keep text on the slide; every slide may add `footer` ≤55 and `theme`):

| type | fields |
|---|---|
| `cover` | `title` ≤35, `subtitle` ≤70 |
| `text` | `title` ≤40, `text` ≤220 |
| `list` | `title` ≤35, `items` 2–4 strings ≤60 each |
| `stat` | `label` ≤40, `big` ≤9 chars, `unit` ≤25, `text` ≤120 |
| `table` | `title` ≤40, `rows` 2–4 × `[name, col1, col2]` ≤14 chars each, `text` |

**Structure:** 8 slides by default, max 10. First is a `cover`; last is a `list` takeaway or call to action using `brand.cta` as its footer. Alternate themes (`blue|light|dark|pop` from `theme.json`), the first is `blue`.

**Check before showing the user:** view every PNG; fix overflow, clipping, low contrast.
