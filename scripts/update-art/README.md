# Update images

Makes the picture for a Home Updates card: 1600x900 WebP with no words in it. The
card's tag, title and button are live text under the picture, so they translate
and stay sharp. Keep anything that matters between x 150 and 1450; the home strip
crops the sides on tablet and desktop.

## Layouts

| layout   | needs            | use it for                                        |
|----------|------------------|---------------------------------------------------|
| `logo`   | `logo`           | a partner's news (Arc, Circle) with their logo    |
| `pair`   | `logo`           | Karwan working with a partner: our mark and theirs |
| `screen` | `screen`         | our own product news, from a real screen render    |
| `figure` | `figure`, `unit` | one number (1 to 7 characters, unit up to 8)       |

Every card also takes `ground` (`mist`, `sage`, `blush`, `lilac`, `paper`; the
same grounds as the cards), `theme` (`light` or `dark`), `tile` (`light` or
`dark`, behind a logo) and `mirror` (`true` puts the weight on the other side, so
neighbouring cards differ).

## Sources

- Logos: SVG from the partner's official brand or press page, used as their
  guidelines allow. A bitmap logo needs at least 480px on its long side.
- Screens: render the real screen at 3x (1170x2532 phone, 2880x1800 desktop).
  Under 900px on the long side looks soft; the renderer warns.
- Never a screenshot of someone else's post.

## Run

Copy `cards.example.json`, edit it, then on the test VPS (it needs Playwright
from `frontend`):

```
node scripts/update-art/render.mjs my-cards.json
```

Images land in `frontend/public/media/updates/<name>.webp`. Either commit them
and put `/media/updates/<name>.webp` in the image field on /admin/updates, or
skip the commit and use Upload on that page, the same way a designer's file goes
live. A crop preview
for each card lands in `scripts/update-art/previews/` (not published). `--guides`
draws the safe area; `--out <dir>` writes somewhere else.
