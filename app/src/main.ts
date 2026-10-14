import { cleanupSessions } from "./session-cleanup.ts";
import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";

import { assembleApplication } from "./assembly.ts";
import { policy } from "./http.ts";
import { db } from "./db.ts";

const application = assembleApplication();
const gateway = createGateway({ application });
const api = createHttpHandler({ application, gateway, policy });

const dist = `${import.meta.dir}/../web/dist`;

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": api,
    "/health": async () => {
      try {
        await db.collection("roomJoining.rooms").findOne(
          {},
          { maxTimeMS: 2000, timeoutMS: 3000 },
        );

        return Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return Response.json(
          { status: "unavailable" },
          {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    },
  },
  async fetch(request) {
    const file = Bun.file(dist + new URL(request.url).pathname);
    return new Response(
      (await file.exists()) ? file : Bun.file(`${dist}/index.html`),
    );
  },
});

console.log(`Backend listening on ${server.url}`);

let cleaning = false;
async function sweepSessions() {
  if (cleaning) return;
  cleaning = true;
  try { await cleanupSessions(application.concepts); }
  catch (error) { console.error("Session cleanup failed; will retry.", error); }
  finally { cleaning = false; }
}
void sweepSessions();
setInterval(sweepSessions, 15_000).unref();
