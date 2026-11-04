# Format: Reel production plan

A 15–45 second Instagram Reel plan. Output is a script and storyboard for manual filming and editing.

Each draft contains:

- `reel.json`: title, duration, selected hook, three hook options, script, four to eight timed beats, shot list, and checklist.
- `caption.txt`: caption for manual publishing.
- `reel-plan.md`: readable production brief.
- `preview.svg`: 1080×1920 summary preview.

Each beat contains `seconds`, `visual`, `voiceover`, and `onScreenText`. Edit the plan through the JSON editor and save to regenerate the Markdown and SVG.

Render an existing plan with:

```bash
node formats/reel/render.mjs <workspace> drafts/<dir>
```

The renderer reads `brand.json` and `reel.json`. It writes the preview and production brief; filming and video editing happen outside the app.
