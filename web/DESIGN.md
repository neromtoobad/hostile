# Hostile web: design direction (v5, clean white, one blue, stock mascots)

**Idea: matchday.** Every league is a derby. Every stock is a player with its own 3D mascot, like a fantasy football card. A team plays as its captain's mascot, and the mascot's mood follows the real score. The pitch (centre circle, halfway line) and the team blue live in the art; the words stay plain.

**v5 (Nov 18):** rebuilt after the review "the font doesn't look good, add more motion, make it clean". White page, neutral ink, one cobalt used as rounded panels instead of full-bleed bands, one type family, and motion on every section. v3 and v4 history: softer centred layout (v3), stocks became the characters (v4).

## References for v5 (Framer Marketplace, live previews)

| Reference | Took (principle) | Did not take |
|---|---|---|
| [Fuse](https://fuse-fintech.framer.website/), fintech | White page, neutral greys, headline at a medium weight instead of bold, a quiet drifting strip under the hero (ours carries live prices, theirs logos) | Google Sans Flex, their dashboard hero, their copy |
| [Coorda](https://coorda.framer.website/), community app | A picture set inside the headline like a word, floating pill nav, big rounded panels, numbered cards | Open Runde, the photo hero, their card contents |
| [Outpace](https://outpace.framer.website/), studio | Very large, tightly tracked grotesk as the main visual, lots of white space | Aspekta, their layout |

Measured from those pages: headlines 60–80px at weight 400–550 with about -0.03em tracking, body 18px in a grey near `#45474D`, buttons 42–44px tall, card radii 16–24px.

## Earlier benchmark (v3), still true

Benchmark: [daybreakcircles.lol](https://www.daybreakcircles.lol/), a tokenized-stock product with a strong light-blue system.

| Took (principles) | Did not take (their signature) |
|---|---|
| Light page with one saturated blue used as full-bleed bands | Their blue `#0210EF`, Space Grotesk, their nav and section order |
| 3D characters as the emotional layer of a finance product | Their fuzzy-hat round-head mascots, company logos on characters |
| Product mockup cards that show real numbers next to the copy (ours read live Aerodrome prices) | Their copy, their stat strip wording |
| Centred hero, alternating white / tinted / blue sections, stacked white cards on the blue band | Their exact section order and content |
| Fade-up on scroll | Anything on their page beyond that one effect |
| Small mono labels, generous section spacing | Their circle/thesis features |

Our own pieces: one mascot per stock, moods mapped to live prices, mascots inside the headline, the pitch stage, the payday animation, the cobalt clock band in the draft room.

## Tokens

| Token | Value | Use |
|---|---|---|
| bg | `#FFFFFF` | page |
| soft | `#F4F5F8` | panels, chips, inputs |
| ink | `#0B0F1A` | text, dark cards |
| slate | `#6B7385` | secondary text |
| line | `#E8EAF0` | hairlines |
| cobalt | `#1D3BFF` | brand, panels, primary buttons |
| cobalt-lit | `#3D59FF` | the one soft light at a panel's top edge |
| sky | `#B9C7FF` | text on cobalt |
| win / loss | `#0A9A66` / `#E5484D` | score moves only |
| volt | `#D8FF3D` | captain mark, "your turn", one headline chip (tiny doses) |

Type: **Funnel Display** 500 for headlines and big numbers (-0.04em), **Funnel Sans** for everything else, with tabular numbers. No monospace. Chosen from a side-by-side test of eight Google fonts on our own headline; Manrope read as squeezed at tight tracking. Radii: 36px panels, 28px cards, pills for buttons and chips. Cards use a hairline plus one soft shadow.

Home sections, in order: hero (headline with two mascots set in it) → blue stage with the seven-mascot lineup, each moving with its live 30-minute price change, and four stats → live price strip → "How a season plays" (four steps that advance on their own, each showing the matching piece of the app) → the players (every draftable stock as a drifting card with its live price) → the rules (five cards) → leagues panel (live league cards from the factory) → closing crowd.

## Motion

Built with [Motion](https://motion.dev) for springs and presence, CSS for the rest. Every effect has a job:

| Where | What moves | Why |
|---|---|---|
| Hero | Words slide up out of a mask, the two headline mascots pop in, the lineup springs up from the centre outward and leans toward the pointer | First impression: the stocks are characters |
| Nav | Narrows into a smaller pill after you scroll; a soft pill follows the link you hover | Stays out of the way |
| Stats, "10%" | Count up once when seen | Draws the eye to real numbers |
| Price strip, player cards | Drift sideways forever, pause on hover; a player hops when you point at it | Shows that all 25 stocks are live |
| How a season plays | A progress line fills on the active step, then the next step opens and its card swaps in | Tells the season in order without scrolling four screens |
| Payday card | The loser's stock icons fly along an arc to the winner | The one mechanic that makes the game: 10% changes hands |
| Rules | The price line draws itself, then the two labels pop | Explains the anti-manipulation rule in two seconds |
| Sections | Children rise in one after another | Reading order |
| Closing crowd | Mascots hop in a wave | A send-off |
| League page | Seats and draft cards rise in; a draft card lifts and its mascot grows on hover | The board feels like picking a player |
| Pitch | Players drop onto the pitch on a spring, one after another; a tapped player lifts and its name plate gets a volt ring | Each pick feels like signing a player |

Reduced-motion users get the finished page with no movement, and the steps only change when clicked. Automated browsers (link previews, screenshot tools) also get the finished page (`STILL` in `web/src/components/Motion.tsx`).

## The pitch (league page)

Fantasy-football style: stocks stand on a pitch as players (`web/src/components/Pitch.tsx`).

- **Matchup:** one pitch per match. Your rival is in the top half and you are in the bottom half, with the team bars at each end showing the live score. Each player's plate shows its move this week; the captain wears a volt **C** armband and its plate reads "×2". A bye week shows a half pitch.
- **Your team:** a half pitch with your squad. Tap a player to see its shares and value and to make it captain (one `setCaptain` transaction). A captain changed mid-season wears an outlined armband until its week starts. The contract keeps that queue private, so the app reads it from the `CaptainSet` events (`withQueuedCaptains` in `lib/league.ts`).
- **Draft:** your pitch sits beside the board (above it on phones). Empty dashed shirts mark picks still to come, each labelled with its pick number.
- **Formation:** at most four players in a row, with fewer in the front row (`formation()` in `web/src/lib/mascots.ts`). Players scale with the pitch width through container units.

## Share cards (what X shows for a link)

A league link posted on X unfurls into a 1200×630 picture in the site's own look: white card, words on the left, the cobalt pitch on the right. `web/api/og.ts` reads the league from Base and `web/src/share/cards.ts` lays it out; the app's **Share on X** buttons (`web/src/components/Share.tsx`) show the same picture before posting.

| Card | When | What it shows |
|---|---|---|
| Site | any non-league link | The headline and five mascots. No numbers |
| League | `/l/<address>` | Follows the stage: open seats in the lobby, picks so far in the draft, the standings in the season, the crowned champion at the end |
| Squad | `?card=team&seat=N` | One manager's stocks in formation, the captain's armband, what the bag is worth now |
| Match | `?card=match&seat=N` (`&week=W` for a settled week) | Two squads either side of the halfway line with their scores. "Live" until the week is settled, then "Final" with who hands 10% to whom |

- Every number on a card is read from the league's contract when the picture is drawn. The link only carries an address, a seat number and a week number.
- Player-typed names (league, team) are cut to fit and never wrap.
- Link-preview bots get a few lines of tags from `web/middleware.js`; they never get the app.
- Fonts: Funnel Display and Funnel Sans (SIL Open Font License), static WOFF files in `web/src/share/fonts/`, packed into the function by `web/scripts/og-fonts.mjs`. Mascots for cards are 240px PNG copies in `web/public/og/mascots/` (the card renderer cannot read WebP).
- Local check: the dev server serves `/api/og` from the same file (`web/scripts/og-dev.ts`).

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
