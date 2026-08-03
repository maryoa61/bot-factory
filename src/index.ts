/** Cloudflare Worker entrypoint.
 *  Routes:
 *    POST /webhook          → factory (main) bot
 *    POST /wh/<botToken>    → one tenant bot
 *  Every route is verified with the Telegram webhook secret token
 *  (grammY's webhookCallback does the constant-time comparison). */

import { webhookCallback } from "grammy";
import type { Bot } from "grammy";

import type { Env } from "./env";
import { getTenantByToken } from "./registry";
import { makeFactoryBot } from "./factory";
import { buildTenantBot } from "./tenant";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET") {
      return new Response("🤖 bot-factory worker is running", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/webhook") {
      const bot = makeFactoryBot(env, url.origin);
      return handle(bot, env.WEBHOOK_SECRET, request);
    }

    const m = url.pathname.match(/^\/wh\/([^/]+)$/);
    if (m) {
      const token = decodeURIComponent(m[1]);
      const tenant = await getTenantByToken(env.DB, token);
      if (!tenant || !tenant.active) return new Response("not found", { status: 404 });
      const bot = buildTenantBot(env, tenant);
      return handle(bot, tenant.hook_secret, request);
    }

    return new Response("not found", { status: 404 });
  },
} as ExportedHandler<Env>;

function handle(bot: Bot, secretToken: string, request: Request): Promise<Response> {
  return webhookCallback(bot, "cloudflare-mod", {
    secretToken,
    onTimeout: "throw",
  })(request);
}
