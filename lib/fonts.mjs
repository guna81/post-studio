// Curated font IDs keep saved settings and renderer CSS safe.
export const FONTS = [
  { id: 'space-grotesk', label: 'Space Grotesk', family: 'Space Grotesk' },
  { id: 'inter', label: 'Inter', family: 'Inter' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat' },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans' },
  { id: 'lora', label: 'Lora', family: 'Lora' },
];
export function cleanFont(id, fallback = '') {
  if (id === undefined) return fallback;
  if (id === '') return '';
  if (!FONTS.some((f) => f.id === id)) throw new Error('Choose a font from the list');
  return id;
}
export function resolveFonts(id, existing) {
  const font = FONTS.find((f) => f.id === cleanFont(id));
  if (!font) return existing;
  return { ...existing, display: font.family, googleFontsUrl: `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(' ', '+')}:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap` };
}
