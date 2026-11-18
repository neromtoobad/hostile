# Cast art: how it was made and what it cost

All figures were generated with Higgsfield on Nov 18 2026. Model: `nano_banana_pro`, 2 credits per image.

| Step | Images | Credits |
|---|---|---|
| Lineup of the 4 managers (style anchor) | 1 | 2 |
| Pose sheets: winning, losing, champion, one per manager (lineup as reference) | 4 | 8 |
| Hero face-off scene | 1 | 2 |
| Edit pass on the lineup and hero: lightning-bolt patch, skin tone | 2 | 4 |
| Background removal (`image_background_remover`) | 6 | 6 |
| **Total** | | **22** |

Balance went from 1,396.8 to 1,374.8 credits.

## Local steps (free)

- Painted out a stray logo on the hero's tablet.
- Shifted the skin hue on manager 4's pose sheet to match the edited lineup.
- Sliced each cutout into one figure per file, trimmed it, and saved it at 560px tall as WebP.

Files are named `<manager>-<pose>.webp`. Manager is 0–3; pose is `ready`, `up`, `down` or `champ`. The full-size sources are kept locally in `art/` (not committed, they are large).
