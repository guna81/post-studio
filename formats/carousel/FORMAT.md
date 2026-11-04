# Format: carousel

Up to 10 image slides, size from the workspace `theme.json` (1080×1350 by default).

**Files in a draft folder:** `slides.json` = `{ "title", "slides": [...] }`, `caption.txt`, `slide-N.png`, `review.html`.

**Render:** `node <post-studio>/formats/carousel/render.mjs <workspace> drafts/<dir>`

**Slide types** (limits keep text on the slide; every slide may add `footer` ≤55 and `theme`):

| type | fields |
|---|---|
| `cover` | `title` ≤35, `subtitle` ≤70 |
| `text` | `title` ≤40, `text` ≤220 (≤180 on a square canvas) |
| `list` | `title` ≤35, `items` 2–4 strings ≤60 each (2–3, ≤55 on a square canvas) |
| `stat` | `label` ≤40, `big` ≤9 chars, `unit` ≤25, `text` ≤120 |
| `table` | `title` ≤40, `rows` 2–4 × `[name, col1, col2]` ≤14 chars each, `text` |

**Structure:** 8 slides by default, max 10. First is a `cover`; last is a `list` takeaway or call to action using `brand.cta` as its footer. Alternate themes (the keys of `theme.json` `colors`, e.g. `blue|light|dark|pop|grad|duo|glow`). Vary the first slide's theme from post to post; do not default to `blue`.

**Check before showing the user:** view every PNG; fix overflow, clipping, low contrast.

### Image placement

Images support `layout`: `auto` (default), `background`, `split-left`, `split-right`, `image-top`, or `image-bottom`. Automatic placement uses the slide type, copy length, and slide index. Covers use an image background with a solid text panel for readability; text slides vary placement. Existing images can be rearranged without generating them again. Use the Image layout selector below the slide preview and save to apply.
