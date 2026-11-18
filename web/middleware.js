// Vercel Routing Middleware: the event rules make projects that let US users trade ineligible,
// so visitors whose IP Vercel places in the United States get a plain notice instead of the app.
export const config = { matcher: ["/((?!favicon.svg).*)"] };

export default function middleware(request) {
  const country = request.headers.get("x-vercel-ip-country");
  if (country === "US") {
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hostile is not available in the US</title><body style="font-family:system-ui;background:#F5F3EC;color:#14130F;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:24px"><h1 style="font-size:22px">Hostile is not available in the United States</h1><p>Hostile buys tokenized stocks issued by Coinbase, which are not offered to US persons. Your connection looks like it comes from the US, so the app is switched off here.</p></main></body>`,
      { status: 451, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
