// Channel: where a post is published. Add LinkedIn, YouTube, X by copying this shape.
export default {
  id: 'instagram',
  label: 'Instagram',
  formats: ['carousel', 'reel'], // formats this channel accepts
  homeUrl: 'https://www.instagram.com/',
  postUrlPattern: /^https:\/\/(www\.)?instagram\.com\//,
  maxSlides: 10,
  // Image sizes Instagram accepts for a carousel. All slides in one post share the first slide's ratio.
  sizes: [
    { id: 'portrait-4-5', label: 'Portrait 4:5 (1080×1350), classic feed', width: 1080, height: 1350 },
    { id: 'portrait-3-4', label: 'Portrait 3:4 (1080×1440), fills the new profile grid', width: 1080, height: 1440 },
    { id: 'square', label: 'Square 1:1 (1080×1080)', width: 1080, height: 1080 },
  ],
  defaultSize: 'portrait-4-5',
  // Added to the brief so Claude writes a caption that fits the platform.
  captionRules: (brand) => `Caption (Instagram): 3-5 short lines, a call to save/share, then at most 5 optional hashtags${(brand.hashtags || []).length ? ' including relevant entries from ' + brand.hashtags.slice(0, 5).join(' ') : ''}.`,
  // Shown in the UI after approval.
  postingHint: 'Open folder, then on Instagram choose Create > Post and select slide-1 to slide-N in order. Paste the caption, then mark it posted below.',
};
