# Stock mascots: how they were made and what they cost

Every stock you can draft is a player with its own 3D mascot, inspired by what the company makes (a graphics card, an apple, a delivery box). No real logos or wordmarks.

Generated with Higgsfield on Nov 18 2026 (`nano_banana_pro`, 2 credits per image). The style follows the author's own mascots from an earlier project: one of those sheets was the style reference for sheets 1–3. Every figure here is a new render made for Hostile; no earlier image is in this repo.

| Step | Images | Credits |
|---|---|---|
| Sheet 1: NVDA AAPL MSFT GOOGL AMZN META TSLA AMD AVGO | 1 | 2 |
| Sheet 2: NFLX PLTR ORCL MSTR MU SNDK INTC MRVL CRCL | 1 | 2 |
| Sheet 3: SPCX HOOD HIMS LLY MRNA TTWO BE LITE AAOI | 1 | 2 |
| BRK.B piggy bank (two tries copied the reference sheet and were thrown away) | 3 | 6 |
| **Total** | | **12** |

Balance went from 1,374.8 to 1,362.8 credits. No background-removal spend: `web/tools/cut-mascots.py` keys each cell against its own flat backdrop, removes the colour fringe and saves a 360px WebP with the feet on the bottom edge.

These replace the four "rival manager" characters from earlier the same day (22 credits), which were dropped.

The full-size sheets are kept locally in `web/art/mascots/` (not committed, they are large).
