# Hostile web: design direction (v2, blue)

**Idea: matchday.** Every league is a derby. The page reads like a stadium screen in team blue: full-bleed cobalt bands for the moments that matter (who's on the clock, who won the week, who's champion), pale ice pages for everything else. A cast of four 3D rival managers stands in for the people in a league, and their pose follows the real score.

## What we took from the benchmark, and what we didn't

Benchmark: [daybreakcircles.lol](https://www.daybreakcircles.lol/), a tokenized-stock product with a strong light-blue system.

| Took (principles) | Did not take (their signature) |
|---|---|
| Light page with one saturated blue used as full-bleed bands | Their blue `#0210EF`, Space Grotesk, their nav and section order |
| 3D characters as the emotional layer of a finance product | Their fuzzy-hat round-head mascots, company logos on characters |
| Product mockup cards that show real numbers next to the copy | Their copy, their stat strip wording |
| Small mono labels, generous section spacing | Their circle/thesis features |

Our own pieces: the rival cast (seat → character), poses mapped to live state, the wide scoreboard type, the "versus" split, the cobalt clock band in the draft room.

## Tokens

| Token | Value | Use |
|---|---|---|
| ice | `#F3F6FF` | page |
| ice-2 | `#E7EDFF` | alternate sections, inputs |
| card | `#FFFFFF` | cards |
| ink | `#0B1240` | text, dark cards |
| slate | `#5B6488` | secondary text |
| line | `#DCE3F7` | hairlines |
| cobalt | `#1D3BFF` | brand, bands, primary buttons |
| cobalt-deep | `#1229C9` | hover, band shadows |
| sky | `#8FB0FF` | text on cobalt, chart lines |
| win / loss | `#0E9F6E` / `#E5484D` | score moves only |
| volt | `#D8FF3D` | captain mark, "your turn" highlight (tiny doses) |

Type: **Archivo** expanded (width 125, weight 800) for the wordmark, headlines and scores; **Geist** for body; **Geist Mono** for prices, shares, clocks and small labels. 20px card radius, pill buttons, soft blue shadows instead of borders on cards.

## Characters

Generated with Higgsfield (`nano_banana_pro`), backgrounds removed, stored in `web/public/cast/`. Seat `n` in a league gets character `n % 4`. Pose rules:

- **ready**: lobby, draft, no score yet
- **up**: leading this week's matchup on the live TWAP estimate, or won the settled week
- **down**: trailing / lost, and so handing over 10%
- **champion**: season winner

Credit log is in `web/public/cast/CREDITS.md`.

## Rules we hold to

- The first line on each screen says what happens there.
- Every number comes from Base. Live scores are labelled as estimates until the week is settled.
- One button = one real transaction, with a BaseScan link once sent.
