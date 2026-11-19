/** Turns a card (src/share/cards.ts) into a PNG response. The fonts travel inside the function
 *  (src/share/fonts.ts); the mascots are this site's own static files under /og/mascots. */
import { ImageResponse } from "@vercel/og";
import { CARD, type Node } from "./cards";
import { FONT_FILES } from "./fonts";

function bytes(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
let fonts: { name: string; weight: 400 | 500 | 600 | 700; style: "normal"; data: ArrayBuffer }[] | undefined;

/** Draws the card and waits for the whole picture, so a failed drawing is an error here instead
 *  of an empty image later. `maxAge` is how long the CDN may reuse the picture, in seconds. */
export async function renderCard(card: Node, maxAge: number): Promise<Response> {
  fonts ??= FONT_FILES.map((f) => ({ name: f.name, weight: f.weight, style: "normal" as const, data: bytes(f.base64) }));
  const drawn = new ImageResponse(card as unknown as ConstructorParameters<typeof ImageResponse>[0], { ...CARD, fonts });
  const png = await drawn.arrayBuffer();
  if (png.byteLength < 1000) throw new Error("card came out empty");
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}` },
  });
}
