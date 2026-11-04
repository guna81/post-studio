import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const str = (value, max, label) => {
  const out = String(value || '').trim().slice(0, max);
  if (!out) throw new Error(`Reel ${label} is required`);
  return out;
};

export default {
  id: 'reel',
  label: 'Reel (script and storyboard)',
  contentFile: 'reel.json',
  renderScript: join(dirname(fileURLToPath(import.meta.url)), 'render.mjs'),

  outputSpec({ brand }) {
    return `Reply with ONLY a JSON object (no prose): {"title": string, "slug": "kebab-case", "content": {"duration": number, "selectedHook": string, "hooks": [three short hook options], "script": string, "beats": [{"seconds": "0-3", "visual": string, "voiceover": string, "onScreenText": string}], "shotList": [string], "checklist": [string]}, "caption": string, "sources": [urls]}.
Create a 15-45 second Instagram Reel. Include exactly 3 hooks, select the strongest one, write a natural teleprompter-ready script, then create 4-8 chronological timed beats. Respect any requested constraints such as phone-only, no-face, or location. Do not invent facts or claims.`;
  },

  clean(content) {
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Reel content must be a plan');
    const hooks = Array.isArray(content.hooks) ? content.hooks.map((hook) => String(hook).trim()).filter(Boolean).slice(0, 3) : [];
    if (hooks.length !== 3) throw new Error('A Reel needs exactly 3 hook options');
    const beats = Array.isArray(content.beats) ? content.beats.slice(0, 8).map((beat, i) => ({
      seconds: str(beat?.seconds, 20, `beat ${i + 1} timing`),
      visual: str(beat?.visual, 300, `beat ${i + 1} visual`),
      voiceover: str(beat?.voiceover, 400, `beat ${i + 1} voiceover`),
      onScreenText: String(beat?.onScreenText || '').trim().slice(0, 120),
    })) : [];
    if (beats.length < 4) throw new Error('A Reel needs 4 to 8 storyboard beats');
    const duration = Number(content.duration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 45) throw new Error('Reel duration must be 15 to 45 seconds');
    return {
      duration,
      selectedHook: str(content.selectedHook, 160, 'selected hook'),
      hooks,
      script: str(content.script, 4000, 'script'),
      beats,
      shotList: Array.isArray(content.shotList) ? content.shotList.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [],
      checklist: Array.isArray(content.checklist) ? content.checklist.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [],
    };
  },
  wrap: (title, content) => ({ title, ...content }),
  unwrap: (file) => {
    const { title, font, ...content } = file;
    return content;
  },
  count: (content) => content.beats.length,
  previews(draftPath) {
    return readdirSync(draftPath).filter((file) => file === 'preview.svg');
  },
};
