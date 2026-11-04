// Code-native artwork: no remote assets or image generation required.
export const ILLUSTRATIONS = ['ai-chip', 'growth', 'target', 'idea', 'workflow', 'conversation'];
const drawings = {
  'ai-chip': '<rect x="100" y="60" width="160" height="160" rx="28"/><rect x="137" y="97" width="86" height="86" rx="16"/><path d="M130 35v25m50-25v25m50-25v25M130 220v25m50-25v25m50-25v25M75 90h25m-25 50h25m-25 50h25m160-100h25m-25 50h25m-25 50h25"/>',
  growth: '<path d="M65 225h240M90 225v-55h45v55m30 0V125h45v100m30 0V75h45v150M75 125l80-65 55 25 75-55m-45 0h45v45"/>',
  target: '<circle cx="180" cy="145" r="100"/><circle cx="180" cy="145" r="65"/><circle cx="180" cy="145" r="28"/><path d="M180 145L290 35m-45 0h45v45"/>',
  idea: '<path d="M145 205v-20c-65-35-62-135 35-135s100 100 35 135v20zm0 23h70m-57 22h44M180 15V0M80 45L60 25m220 20 20-20M65 135H35m260 0h30M160 110l20 30 20-30m-20 30v65"/>',
  workflow: '<rect x="125" y="20" width="110" height="65" rx="18"/><rect x="30" y="185" width="110" height="65" rx="18"/><rect x="220" y="185" width="110" height="65" rx="18"/><path d="M180 85v50H85v50m95-50h95v50M65 215h40m150 0h40M160 52h40"/>',
  conversation: '<path d="M45 40h200a20 20 0 0 1 20 20v90a20 20 0 0 1-20 20H115l-50 40v-40H45a20 20 0 0 1-20-20V60a20 20 0 0 1 20-20zM285 100h30a20 20 0 0 1 20 20v100a20 20 0 0 1-20 20h-15v30l-45-30H155a20 20 0 0 1-20-20v-25M75 85h140M75 125h95"/>',
};
export function illustrationSvg(id, colors) {
  if (!ILLUSTRATIONS.includes(id)) return '';
  const safe = (v, fallback) => /^#[\da-f]{3,8}$/i.test(v) ? v : fallback;
  const ink = safe(colors.text, '#172554'), accent = safe(colors.accent, '#60a5fa');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 290" role="img" aria-label="${id.replaceAll('-', ' ')}"><circle cx="180" cy="145" r="125" fill="${accent}" opacity=".18"/><g fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${drawings[id]}</g></svg>`;
}
