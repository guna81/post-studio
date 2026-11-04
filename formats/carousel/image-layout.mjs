export const IMAGE_LAYOUTS = ['auto', 'background', 'split-left', 'split-right', 'image-top', 'image-bottom'];

// Automatic layouts are stable across re-renders and adapt to the amount of copy.
export function imageLayout(slide, index = 0) {
  if (IMAGE_LAYOUTS.includes(slide.image?.layout) && slide.image.layout !== 'auto') return slide.image.layout;
  const length = String(slide.title || '').length + String(slide.text || slide.subtitle || '').length;
  if (slide.type === 'cover' && length < 125) return 'background';
  if (length > 230) return index % 2 ? 'image-top' : 'image-bottom';
  return ['split-left', 'split-right', 'image-top'][index % 3];
}
