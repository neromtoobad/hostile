/** Dev server only: serves /api/og from api/og.ts, so share cards can be checked locally the way
 *  Vercel will serve them. Not part of the production build. */
import type { Plugin } from "vite";

export function ogDev(): Plugin {
  return {
    name: "hostile-og-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/og")) return next();
        try {
          const mod = await server.ssrLoadModule("/api/og.ts");
          const response: Response = await mod.default(new Request(`http://${req.headers.host}${req.url}`));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          res.statusCode = 500;
          res.end(String((e as Error).stack ?? e));
        }
      });
    },
  };
}
