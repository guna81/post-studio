import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || '');
const dir = process.argv[3];
if (!root || !dir) { console.error('Usage: node formats/reel/render.mjs <workspace-dir> <draft-dir>'); process.exit(1); }
const reel = JSON.parse(readFileSync(join(root, dir, 'reel.json'), 'utf8'));
const esc = (value) => String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const brand = JSON.parse(readFileSync(join(root, 'brand.json'), 'utf8'));
const accent = brand.colors?.accent || '#FACC15';
const lines = [reel.selectedHook, `${reel.duration}s Reel`, ...reel.beats.slice(0, 3).map((beat) => `${beat.seconds}  ${beat.onScreenText || beat.visual}`)];
const body = lines.map((line, i) => `<text x="84" y="${250 + i * 170}" font-size="${i === 0 ? 72 : 42}" font-family="Arial, sans-serif" fill="${i === 0 ? accent : '#FFFFFF'}">${esc(line).slice(0, 72)}</text>`).join('');
writeFileSync(join(root, dir, 'preview.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#101827"/><rect x="84" y="106" width="128" height="12" fill="${accent}"/><text x="84" y="190" font-size="38" font-family="Arial, sans-serif" fill="#AAB4C8">${esc(brand.name || 'Post Studio')}</text>${body}</svg>`);
const markdown = `# ${reel.title}\n\n## Selected hook\n${reel.selectedHook}\n\n## Other hooks\n${reel.hooks.map((hook) => `- ${hook}`).join('\n')}\n\n## Script (${reel.duration}s)\n${reel.script}\n\n## Storyboard\n${reel.beats.map((beat) => `### ${beat.seconds}\n- Visual: ${beat.visual}\n- Voiceover: ${beat.voiceover}\n- On-screen text: ${beat.onScreenText || '—'}`).join('\n\n')}\n\n## Shot list\n${reel.shotList.map((item) => `- ${item}`).join('\n')}\n\n## Filming checklist\n${reel.checklist.map((item) => `- ${item}`).join('\n')}\n`;
writeFileSync(join(root, dir, 'reel-plan.md'), markdown);
