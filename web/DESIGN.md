# Hostile web: design direction

**Idea:** a sports-page scoreboard printed on newsprint. Leagues, matchups and standings read like the back page of a paper; money moves are the headlines.

## Tokens

| Token | Value | Use |
|---|---|---|
| paper | `#F5F3EC` | page background |
| card | `#FFFFFF` | cards, tables, forms |
| ink | `#14130F` | text, 2px rules, the prize box |
| muted | `#6B675C` | secondary text |
| line | `#E2DED2` / `#CFCABB` | hairlines, input borders |
| accent | `#FF4D1A` | primary action, "you're on the clock" |
| win / loss | `#0B8F5A` / `#D7263D` | score moves, the leading side of a matchup |
| gold | `#E0A100` | captain mark, champion |

Type: **Big Shoulders Display** (condensed, uppercase) for the wordmark, headlines and scores; **Geist** for body; **Geist Mono** for prices, shares and clocks. Pill buttons, 10/16px radii, 1.5–2px borders, no shadows, no gradients.

## References

- Framer Marketplace, Sports category, "Kings" template (https://chesterkings.framer.website/): condensed uppercase display type over a light page, heavy rules between sections. We took the type scale and the hard section rules, not the layout or palette.
- Newspaper sports tables: standings as plain ruled tables with mono numbers.

## Rules we hold to

- The first line on each screen says what happens there ("Waiting for players", "Paper Route is picking", "Week 2 of 3").
- Every number on screen comes from Base: pool prices, TWAP scores, shares. Live scores are labelled as estimates until the week is settled.
- One button = one real transaction, with a BaseScan link once sent.
