// Format: carousel. A format knows what a post's content looks like, how to ask Claude for it,
// how to validate it, and how to render it. Add a new format (e.g. video) by copying this shape.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_LAYOUTS } from './image-layout.mjs';
import { IMAGE_FILE_RE, imageName } from '../../lib/images.mjs';

import { ILLUSTRATIONS } from './illustrations.mjs';

const SLIDE_TYPES = ['cover', 'stat', 'list', 'table', 'text'];

const elementRules = (els) => [
  els.includes('Illustrations') && '- Add \"illustration\": one of ai-chip|growth|target|idea|workflow|conversation to cover and text slides where relevant. Use built-in illustrations instead of AI images on those slides.',
  els.includes('Emoji in text') && '- You may use one relevant emoji in titles or text (never in "big" or table cells).',
  els.includes('Emoji sticker on slides') && '- Add "sticker": ONE emoji character that fits the slide and the emotion, on every slide.',
  els.includes('AI images') && '- Add "image": {"prompt": a vivid 15-40 word description of an illustration or photo that fits the slide (subject, style, mood, colours of the brand), "alt": short alt text, "layout": "auto" or "background" or "split-left" or "split-right" or "image-top" or "image-bottom"} to the cover and to 1-2 other "text" slides where a picture helps. Vary image placement across slides: background for a short cover, splits for concise copy, image-top or image-bottom for longer copy. Never on list, stat or table slides. The picture must contain no text, letters, numbers or logos. Leave open space; do not describe a scene with words on signs or screens.',
  els.includes('Arrows & highlights') && '- Add "highlight": one word copied exactly from the slide title, to be shown in the accent color.',
].filter(Boolean).map((l) => '\n' + l).join('');

export default {
  id: 'carousel',
  label: 'Carousel (image slides)',
  contentFile: 'slides.json', // <draft>/slides.json = { title, slides: [...] }
  renderScript: join(dirname(fileURLToPath(import.meta.url)), 'render.mjs'),

  // Asked of Claude after the generic brief. Must make Claude reply with JSON {title, slug, content, caption, sources}.
  outputSpec({ brand, themes, count, ctas = [], elements = [], height = 1350 }) {
    const short = height < 1200; // square canvas: less room, so slightly shorter text
    return `Reply with ONLY a JSON object (no prose): {"title": string, "slug": "kebab-case", "content": [slides...], "caption": string, "sources": [urls]}.
"content" has ${count ? `exactly ${count} slides` : 'between 3 and 10 slides: use the number the user asked for in the topic or notes if they gave one, otherwise choose what best fits the topic'}. First is type "cover", last is a "list" takeaway or call to action${brand.cta ? ` (use "${brand.cta}" as its footer)` : ''}.${ctas.length ? ` The last slide must include these calls to action, worded naturally in the brand's tone: ${ctas.map((c) => `"${c}"`).join(', ')}.` : ''}
Slide shapes (all may have "footer", max 55 chars, and "theme" one of ${themes.join('|')}; alternate themes and use at least 3 different ones when there are enough slides, and do not always begin with the first theme in the list):
- {"type":"cover","title"(max 35 chars),"subtitle"(max 70 chars)}
- {"type":"text","title"(max 40 chars),"text"(max ${short ? 180 : 220} chars)}
- {"type":"list","title"(max 35 chars),"items":[${short ? '2-3' : '2-4'} strings, max ${short ? 55 : 60} chars each]}
- {"type":"stat","label"(max 40 chars),"big"(max 9 chars, e.g. "1,500" or "$0.10-$50"),"unit"(max 25 chars),"text"(max 120 chars)}
- {"type":"table","title"(max 40 chars),"rows":[[name,col1,col2],... 2-4 rows, each cell max 14 chars],"text":"say what the two columns mean"}${elementRules(elements)}`;
  },

  // Enforce the selected option even when the text model omits image metadata.
  withImagePrompts(content, { brand }) {
    let textImages = 0;
    return content.map((s) => {
      if (s.type !== 'cover' && (s.type !== 'text' || textImages >= 2)) return s;
      if (s.type === 'text') textImages++;
      if (s.image?.prompt || s.illustration) return s;
      const subject = [s.title, s.subtitle || s.text].filter(Boolean).join('. ').slice(0, 240);
      return { ...s, image: {
        prompt: `Editorial illustration representing ${subject}. Distinct visual objects illustrating the subject, clean composition, generous open space, ${brand.colors?.primary || 'blue'} accents. No text, letters, numbers, logos or watermarks.`.slice(0, 400),
        alt: String(s.title || 'Illustration for this slide').slice(0, 120),
      } };
    });
  },

  withIllustrations(content) {
    return content.map((s, i) => {
      if (!['cover', 'text'].includes(s.type)) return s;
      const { image, ...rest } = s;
      return { ...rest, illustration: s.illustration || ILLUSTRATIONS[i % ILLUSTRATIONS.length] };
    });
  },

  // Validate what Claude (or the UI editor) produced. Returns the cleaned content array.
  clean(slides, { themes }) {
    if (!Array.isArray(slides) || slides.length < 3 || slides.length > 10) throw new Error('Need 3 to 10 slides');
    return slides.map((s, i) => {
      if (!SLIDE_TYPES.includes(s.type)) throw new Error(`Slide ${i + 1}: bad type "${s.type}"`);
      const out = { ...s, theme: themes.includes(s.theme) ? s.theme : themes[i % themes.length] };
      if (typeof out.sticker !== 'string' || !out.sticker.trim() || [...out.sticker.trim()].length > 4) delete out.sticker; else out.sticker = out.sticker.trim();
      if (!['cover', 'text'].includes(out.type) || !ILLUSTRATIONS.includes(out.illustration)) delete out.illustration;
      if (out.illustration) delete out.image;
      // Images: only on cover and text slides. `file` is set by the server after generation; only our own name pattern is kept.
      const im = out.image;
      if (['cover', 'text'].includes(out.type) && im && typeof im === 'object' && typeof im.prompt === 'string' && im.prompt.trim().length >= 8) {
        out.image = { prompt: im.prompt.trim().slice(0, 400), alt: typeof im.alt === 'string' ? im.alt.trim().slice(0, 120) : '' };
        if (IMAGE_LAYOUTS.includes(im.layout)) out.image.layout = im.layout;
        if (typeof im.file === 'string' && IMAGE_FILE_RE.test(im.file) && im.file === imageName(out.image.prompt)) out.image.file = im.file; // a changed prompt means a new picture
      } else delete out.image;
      if (typeof out.highlight !== 'string' || !out.highlight.trim() || out.highlight.length > 30) delete out.highlight; else out.highlight = out.highlight.trim();
      return out;
    });
  },

  // Force a varied first slide: pick a random theme that is not in `avoid` (the openers of recent posts).
  // Only the opener changes; if slide 2 shares the new theme, swap it so neighbours always differ.
  applyStartTheme(content, themes, avoid = []) {
    const pool = themes.filter((t) => !avoid.includes(t));
    const choices = pool.length ? pool : themes;
    const start = choices[Math.floor(Math.random() * choices.length)];
    const next = content.map((s) => ({ ...s }));
    next[0].theme = start;
    if (next[1] && next[1].theme === start) next[1].theme = themes.find((t) => t !== start) || start;
    return next;
  },

  wrap: (title, content) => ({ title, slides: content }),
  unwrap: (file) => file.slides,

  // Files the UI should preview, in order.
  previews(draftPath) {
    return readdirSync(draftPath).filter((f) => /^slide-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
  },
};
