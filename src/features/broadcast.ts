/** Feature: broadcast — send a message to everyone who started the bot. */

import type { Bot } from "grammy";

import { listUsers } from "../registry";
import type { TenantCtx } from "../panel";

export function registerBroadcast(bot: Bot, t: TenantCtx): void {
  bot.command("broadcast", async (ctx) => {
    if (!ctx.from || !t.isOwner(ctx.from.id)) return;
    const text = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!text) return ctx.reply("مثال: /broadcast سلام به همه 👋");
    const users = await listUsers(t.env.REGISTRY, t.tenant.id);
    let ok = 0;
    for (const uid of users) {
      try {
        await bot.api.sendMessage(uid, text);
        ok++;
      } catch {
        // user blocked the bot — skip
      }
    }
    await ctx.reply(`📨 ارسال شد به ${ok} از ${users.length} کاربر.`);
  });
}
