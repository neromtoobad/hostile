// Vercel Routing Middleware. Two jobs:
//
// 1. Link previews. X, Discord, Telegram and the like fetch a page to build its preview card.
//    They never get the app: they get a few lines of tags that point at the share card for that
//    link (/api/og draws it from the league's contract).
// 2. The event rules make projects that let US users trade ineligible, so visitors whose IP
//    Vercel places in the United States get a plain notice instead of the app.
//
// /api and /og (the card's fonts and mascots) skip this file: the card function fetches them
// from a US data centre, and they hold nothing a US visitor could trade with.
export const config = { matcher: ["/((?!favicon.svg|og.png|og/|api/).*)"] };

const PREVIEW_BOT = /Twitterbot|facebookexternalhit|Facebot|Slackbot|Discordbot|TelegramBot|WhatsApp|LinkedInBot|Pinterestbot|redditbot|Embedly|Iframely|SkypeUriPreview|vkShare|Mastodon|Bluesky/i;
const DESCRIPTION = "Draft real stocks with friends on Base. Each week the loser hands 10% of their shares to the winner.";

/** Tags for one link. Everything put into the page is either fixed text or a checked address / number. */
function previewPage(url) {
  let title = "Hostile — fantasy stock league with real shares";
  let image = `${url.origin}/og.png`;
  let canonical = `${url.origin}${url.pathname === "/" ? "/" : url.pathname}`;
  const league = url.pathname.match(/^\/l\/(0x[0-9a-fA-F]{40})\/?$/);
  if (league) {
    const q = new URLSearchParams({ league: league[1] });
    const card = url.searchParams.get("card");
    if (card === "team" || card === "match") q.set("card", card);
    for (const key of ["seat", "week"]) {
      const v = url.searchParams.get(key);
      if (v !== null && /^\d{1,3}$/.test(v)) q.set(key, v);
    }
    const v = url.searchParams.get("v");
    if (v !== null && /^[0-9.]{1,40}$/.test(v)) q.set("v", v);
    image = `${url.origin}/api/og?${q}`;
    canonical = `${url.origin}/l/${league[1]}`;
    title = card === "team" ? "A squad on Hostile" : card === "match" ? "A match on Hostile" : "A league on Hostile";
  }
  const img = image.replace(/&/g, "&amp;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Hostile">
<meta property="og:title" content="${title}"><meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${DESCRIPTION}"><meta name="twitter:image" content="${img}">
</head><body><p>${DESCRIPTION}</p><p><a href="${canonical}">Open Hostile</a></p></body></html>`;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const isPage = !/\.[a-z0-9]+$/i.test(url.pathname);
  if (isPage && PREVIEW_BOT.test(request.headers.get("user-agent") ?? "")) {
    return new Response(previewPage(url), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=300" } });
  }
  const country = request.headers.get("x-vercel-ip-country");
  if (country === "US") {
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hostile is not available in the US</title><body style="font-family:system-ui;background:#F4F7FF;color:#121A3D;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:24px"><h1 style="font-size:22px">Hostile is not available in the United States</h1><p>Hostile buys tokenized stocks issued by Coinbase, which are not offered to US persons. Your connection looks like it comes from the US, so the app is switched off here.</p></main></body>`,
      { status: 451, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
