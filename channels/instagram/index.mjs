// Channel: where a post is published. Add LinkedIn, YouTube, X by copying this shape.
export default {
  id: 'instagram',
  label: 'Instagram',
  formats: ['carousel'], // formats this channel accepts
  homeUrl: 'https://www.instagram.com/',
  postUrlPattern: /^https:\/\/(www\.)?instagram\.com\//,
  maxSlides: 10,
  // Added to the brief so Claude writes a caption that fits the platform.
  captionRules: (brand) => `Caption (Instagram): 3-5 short lines, a call to save/share, then 5-8 hashtags${(brand.hashtags || []).length ? ' including ' + brand.hashtags.join(' ') : ''}.`,
  // Shown in the UI after approval.
  postingHint: 'Open folder, then on Instagram choose Create > Post and select slide-1 to slide-N in order. Paste the caption, then mark it posted below.',
};
