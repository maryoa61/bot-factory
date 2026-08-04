/** Feature: AI info — free API list + latest AI news (RSS). */

import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";

const NEWS_FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
  "https://hnrss.org/newest?q=AI",
];

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Fetch one RSS feed, return up to `max` items as {title, link}. */
async function parseFeed(url: string, max: number): Promise<{ title: string; link: string }[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "bot-factory-worker" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: { title: string; link: string }[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && out.length < max) {
      const block = m[1];
      const titleM = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkM = block.match(/<link>([\s\S]*?)<\/link>/i);
      if (!titleM || !linkM) continue;
      const title = stripTags(titleM[1]);
      const link = stripTags(linkM[1]);
      if (title && link.startsWith("http")) out.push({ title, link });
    }
    return out;
  } catch {
    return [];
  }
}

export const CHANNEL_URL = "https://t.me/freeapiai";

export function channelRedirectText(title: string): string {
  return (
    `<b>${title}</b>\n\n` +
    "همه‌ی لینک‌ها و راهنماها رو توی کانال گذاشتم 👇\n\n" +
    "➡️ <a href=\"" + CHANNEL_URL + "\">@freeapiai</a> — عضو شو و لذت ببر! 🚀"
  );
}

/** Inline keyboard with a big join button carrying the channel link. */
export function channelJoinKeyboard() {
  return new InlineKeyboard().url("🚀 عضویت در کانال", CHANNEL_URL);
}

export function registerAIInfo(bot: Bot): void {
  bot.command("api_free", async (ctx) => {
    await ctx.reply(channelRedirectText("🆓 لیست هوش مصنوعی‌های با API رایگان"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: channelJoinKeyboard(),
    });
  });

  bot.command("api_news", async (ctx) => {
    await ctx.reply(channelRedirectText("📰 آخرین اخبار هوش مصنوعی"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: channelJoinKeyboard(),
    });
  });
}
