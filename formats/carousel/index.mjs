// Format: carousel. A format knows what a post's content looks like, how to ask Claude for it,
// how to validate it, and how to render it. Add a new format (e.g. video) by copying this shape.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLIDE_TYPES = ['cover', 'stat', 'list', 'table', 'text'];

export default {
  id: 'carousel',
  label: 'Carousel (image slides)',
  contentFile: 'slides.json', // <draft>/slides.json = { title, slides: [...] }
  renderScript: join(dirname(fileURLToPath(import.meta.url)), 'render.mjs'),

  // Asked of Claude after the generic brief. Must make Claude reply with JSON {title, slug, content, caption, sources}.
  outputSpec({ brand, themes }) {
    return `Reply with ONLY a JSON object (no prose): {"title": string, "slug": "kebab-case", "content": [slides...], "caption": string, "sources": [urls]}.
"content" has 8 slides by default (max 10). First is type "cover", last is a "list" takeaway or call to action${brand.cta ? ` (use "${brand.cta}" as its footer)` : ''}.
Slide shapes (all may have "footer", max 55 chars, and "theme" one of ${themes.join('|')}; alternate themes, make the first "${themes[0]}"):
- {"type":"cover","title"(max 35 chars),"subtitle"(max 70 chars)}
- {"type":"text","title"(max 40 chars),"text"(max 220 chars)}
- {"type":"list","title"(max 35 chars),"items":[2-4 strings, max 60 chars each]}
- {"type":"stat","label"(max 40 chars),"big"(max 9 chars, e.g. "1,500" or "$0.10-$50"),"unit"(max 25 chars),"text"(max 120 chars)}
- {"type":"table","title"(max 40 chars),"rows":[[name,col1,col2],... 2-4 rows, each cell max 14 chars],"text":"say what the two columns mean"}`;
  },

  // Validate what Claude (or the UI editor) produced. Returns the cleaned content array.
  clean(slides, { themes }) {
    if (!Array.isArray(slides) || slides.length < 3 || slides.length > 10) throw new Error('Need 3 to 10 slides');
    return slides.map((s, i) => {
      if (!SLIDE_TYPES.includes(s.type)) throw new Error(`Slide ${i + 1}: bad type "${s.type}"`);
      return { ...s, theme: themes.includes(s.theme) ? s.theme : themes[0] };
    });
  },

  wrap: (title, content) => ({ title, slides: content }),
  unwrap: (file) => file.slides,

  // Files the UI should preview, in order.
  previews(draftPath) {
    return readdirSync(draftPath).filter((f) => /^slide-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
  },
};
