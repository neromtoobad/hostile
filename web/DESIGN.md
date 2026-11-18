# Hostile web: design direction (v4, blue, stock mascots)

**Idea: matchday.** Every league is a derby. The page reads like a stadium screen in team blue: full-bleed cobalt bands for the moments that matter (who's on the clock, who won the week, who's champion), pale ice pages for everything else. Every stock is a player with its own 3D mascot, like a fantasy football card. A team plays as its captain's mascot, and the mascot's mood follows the real score.

**v3 (Nov 18):** after review we moved closer to the benchmark's feel: softer and rounder, centred hero, sections that alternate white / ice / cobalt, and more "product cards" that show the app's real pieces (a live pick quote, a matchup, stacked league cards). The mascots, copy, palette and section content stay our own.

**v4 (Nov 18):** the four rival managers were dropped. Stocks are now the characters (28 mascots), in the style of the author's own mascots from an earlier project.

## What we took from the benchmark, and what we didn't

Benchmark: [daybreakcircles.lol](https://www.daybreakcircles.lol/), a tokenized-stock product with a strong light-blue system.

| Took (principles) | Did not take (their signature) |
|---|---|
| Light page with one saturated blue used as full-bleed bands | Their blue `#0210EF`, Space Grotesk, their nav and section order |
| 3D characters as the emotional layer of a finance product | Their fuzzy-hat round-head mascots, company logos on characters |
| Product mockup cards that show real numbers next to the copy (ours read live Aerodrome prices) | Their copy, their stat strip wording |
| Centred hero, alternating white / tinted / blue sections, stacked white cards on the blue band | Their exact section order and content |
| Fade-up on scroll | Anything on their page beyond that one effect |
| Small mono labels, generous section spacing | Their circle/thesis features |

Our own pieces: one mascot per stock, moods mapped to live prices, the wide scoreboard type, the "versus" split, the cobalt clock band in the draft room.

## Tokens

| Token | Value | Use |
|---|---|---|
| ice | `#F4F7FF` | page |
| ice-2 | `#EAF0FE` | alternate sections, inputs |
| card | `#FFFFFF` | cards |
| ink | `#121A3D` | text, dark cards |
| slate | `#67729A` | secondary text |
| line | `#E3E9F8` | hairlines |
| cobalt | `#1D3BFF` | brand, bands, primary buttons |
| cobalt-deep | `#1229C9` | hover, band shadows |
| sky | `#8FB0FF` | text on cobalt, chart lines |
| win / loss | `#0E9F6E` / `#E5484D` | score moves only |
| volt | `#D8FF3D` | captain mark, "your turn" highlight (tiny doses) |

Type: **Manrope** (600 for headlines, tight -0.045em tracking; 700–800 for the wordmark and scores); **Geist** for body; **Geist Mono** for prices, shares, clocks and small labels. Radii: 16px base, 26–28px cards, 14px buttons (pill only where a chip makes sense). Soft blue shadows instead of borders on cards.

Home sections, in order: hero → mascot lineup (7 stocks, each moving with its live 30-minute price change) → cobalt stat band → draft (steps + live NVDA pick quote) → three kinds of day (mascot cards) → example matchup (real 30-minute moves, labelled "Example teams") → cobalt leagues band (live league cards from the factory) → closing call to action. Each section fades up once on scroll (`web/src/components/Reveal.tsx`); reduced-motion users and automated browsers get everything shown at once.

## Characters

One mascot per stock, generated with Higgsfield and cut by `web/tools/cut-mascots.py` into `web/public/mascots/<SYMBOL>.webp`. The component is `web/src/components/Mascot.tsx`.

- **Draft board:** every stock card shows its mascot, like a player card.
- **Teams:** a team plays as its captain's mascot. Before the draft, each seat gets a default face (`seatFace`).
- **Moods** (CSS only, no extra art): **ready** (lobby, draft, no score yet) · **up** hops (leading on the live TWAP estimate, or the stock's 30-minute move is up) · **down** sulks and loses some colour (trailing / handing over 10%) · **champ** wears a crown (season winner).
- Reduced-motion users get the still figures.

Credit log is in `web/public/mascots/CREDITS.md`.

## Rules we hold to

- The first line on each screen says what happens there.
- Every number comes from Base. Live scores are labelled as estimates until the week is settled.
- One button = one real transaction, with a BaseScan link once sent.
- Example content is labelled as an example. Numbers inside it are still real (live pool prices).
- Stock icons are served from the app (`web/public/stocks/`), not hotlinked.
