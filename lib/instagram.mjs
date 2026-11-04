const HASHTAG_RE = /(^|\s)(#[\p{L}\p{N}_]+)/gu;

export function qualityReport({ content, caption, format }) {
  const issues = [];
  const text = String(caption || '').trim();
  const hashtags = [...text.matchAll(HASHTAG_RE)].map((m) => m[2]);
  const lines = text.split(/\r?\n/).filter(Boolean);

  if (!content || (Array.isArray(content) && !content.length)) issues.push({ level: 'error', rule: 'content', message: 'Add content before requesting approval.' });
  if (!text) issues.push({ level: 'error', rule: 'caption', message: 'Add a caption before requesting approval.' });
  if (text.length > 2200) issues.push({ level: 'error', rule: 'caption-length', message: `Caption is ${text.length} characters; Instagram allows up to 2,200.` });
  if (hashtags.length > 5) issues.push({ level: 'error', rule: 'hashtags', message: `Use at most 5 hashtags; this caption has ${hashtags.length}.` });
  if (hashtags.length === 0) issues.push({ level: 'warning', rule: 'hashtags', message: 'Consider up to 5 relevant hashtags, or leave them out intentionally.' });
  if (lines[0] && lines[0].length > 125) issues.push({ level: 'warning', rule: 'caption-preview', message: 'The opening caption line is long; tighten it for the preview before “more”.' });
  if (!/\b(save|share|send|comment|follow|link in bio|visit)\b/i.test(text)) issues.push({ level: 'warning', rule: 'cta', message: 'Add a clear call to save, share, comment, follow, or visit your link.' });

  if (format === 'carousel' && Array.isArray(content)) {
    content.forEach((slide, i) => {
      if (slide.image && !slide.image.alt) issues.push({ level: 'warning', rule: 'alt-text', message: `Slide ${i + 1} has an image without alt text.` });
    });
  }
  if (format === 'reel' && (!content?.hooks || !content?.beats || !content?.script)) {
    issues.push({ level: 'error', rule: 'reel-plan', message: 'A Reel needs hooks, a script, and timed beats.' });
  }

  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.filter((issue) => issue.level === 'warning').length;
  return { ready: errors === 0, score: Math.max(0, 100 - errors * 30 - warnings * 8), hashtags, issues };
}

export function cleanInsights(input = {}) {
  const metrics = {};
  for (const key of ['reach', 'saves', 'shares', 'follows']) {
    if (input[key] === undefined || input[key] === '') continue;
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) throw new Error(`${key} must be a whole number from 0 to 1,000,000,000`);
    metrics[key] = value;
  }
  if (!Object.keys(metrics).length) throw new Error('Enter at least one insight metric');
  return metrics;
}
