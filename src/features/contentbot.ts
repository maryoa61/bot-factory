/** Feature: content collector — free AI news (RSS) + free API list (publicapis.org + GitHub).
 *  No API keys needed, everything is free.
 *  /postnews & /postapis publish polished content directly to the owner's channel.
 *  collectApis/collectNews are shared with the worker's scheduled (cron) handler. */

import type { Bot } from "grammy";

const NEWS_FEEDS = [
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", name: "TechCrunch" },
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", name: "The Verge" },
  { url: "https://hnrss.org/newest?q=AI", name: "Hacker News" },
];

const FREE_API_CATEGORIES = [
  "artificial-intelligence",
  "machine-learning",
  "data-science",
  "developer",
  "open-data",
];

/** The channel this bot publishes to. Owner must add this bot as admin of the channel. */
export const CHANNEL = "@freeapiai";

const FA = "۰۱۲۳۴۵۶۷۸۹";
function faNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => FA[+d]);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function relTime(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const t = Date.parse(pubDate);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${faNum(mins)} دقیقه پیش`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${faNum(hrs)} ساعت پیش`;
  const days = Math.round(hrs / 24);
  return `${faNum(days)} روز پیش`;
}

export interface NewsItem {
  title: string;
  link: string;
  excerpt: string;
  time: string | null;
  source: string;
}

export interface ApiItem {
  name: string;
  desc: string;
  link: string;
  auth: string;
  https: boolean;
}

/** Fetch one RSS feed, return up to `max` news items (each with a short excerpt). */
async function parseFeed(feed: { url: string; name: string }, max: number): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": "bot-factory-worker" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && out.length < max) {
      const block = m[1];
      const titleM = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkM = block.match(/<link>([\s\S]*?)<\/link>/i);
      if (!titleM || !linkM) continue;
      const title = stripTags(titleM[1]);
      const link = stripTags(linkM[1]);
      if (!title || !link.startsWith("http")) continue;
      const descM = block.match(/<description>([\s\S]*?)<\/description>/i);
      const excerpt = descM ? truncate(stripTags(descM[1]), 100) : "";
      const dateM = block.match(/<pubDate>([^<]*)<\/pubDate>/i);
      out.push({ title, link, excerpt, time: relTime(dateM?.[1] ?? null), source: feed.name });
    }
    return out;
  } catch {
    return [];
  }
}

/** Fetch free APIs from publicapis.org (filtered, rotating from `start`) + GitHub fallback. */
export async function collectApis(max = 5, start = 0): Promise<ApiItem[]> {
  const out: ApiItem[] = [];
  try {
    const res = await fetch("https://api.publicapis.org/entries", {
      headers: { "User-Agent": "bot-factory-worker" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        entries?: { API: string; Description: string; Link: string; Category: string; Auth: string; HTTPS: boolean }[];
      };
      const picked: ApiItem[] = [];
      for (const e of data.entries ?? []) {
        const cat = (e.Category || "").toLowerCase();
        if (FREE_API_CATEGORIES.some((c) => cat.includes(c))) {
          picked.push({
            name: e.API,
            desc: e.Description,
            link: e.Link,
            auth: e.Auth || "",
            https: !!e.HTTPS,
          });
        }
      }
      // rotate from `start` for variety on repeated cron posts
      for (let i = 0; i < max; i++) {
        const idx = (start + i) % picked.length;
        out.push(picked[idx]);
      }
    }
  } catch {
    // ignore
  }
  // Fallback: GitHub public-apis awesome list (raw markdown, no key needed)
  if (!out.length) {
    try {
      const res = await fetch("https://raw.githubusercontent.com/public-apis/public-apis/master/README.md", {
        headers: { "User-Agent": "bot-factory-worker" },
      });
      if (res.ok) {
        const md = await res.text();
        const lineRe = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]+)\|/gm;
        let m: RegExpExecArray | null;
        while ((m = lineRe.exec(md)) && out.length < max) {
          const name = m[1];
          const link = m[2];
          const desc = m[3].trim();
          if (name && link && desc && link.startsWith("http")) {
            out.push({ name, desc: truncate(desc, 100), link, auth: "", https: true });
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return out.slice(0, max);
}

/** Collect latest AI news (dedup, up to `max`, each with a short excerpt). */
export async function collectNews(max = 5): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  for (const feed of NEWS_FEEDS) {
    const items = await parseFeed(feed, 2);
    for (const it of items) if (!all.some((x) => x.link === it.link)) all.push(it);
    if (all.length >= max) break;
  }
  return all.slice(0, max);
}

const DIVIDER = "━━━━━━━━━━━━━━━";
const FOOTER = `\n\n📢 برای APIها و اخبار بیشتر:\n<b>@freeapiai</b>`;

export function renderNews(items: NewsItem[]): string {
  const parts = items.map((it, i) => {
    const meta = [it.source, it.time].filter(Boolean).join(" · ");
    return (
      `🧠 ${faNum(i + 1)}. <b><a href="${escapeHtml(it.link)}">${escapeHtml(it.title)}</a></b>` +
      (it.excerpt ? `\n<i>${escapeHtml(it.excerpt)}</i>` : "") +
      (meta ? `\n📰 ${escapeHtml(meta)}` : "")
    );
  });
  return `📰 <b>آخرین اخبار هوش مصنوعی</b>\n\n${parts.join(`\n\n${DIVIDER}\n\n`)}${FOOTER}`;
}

/** Quick "how to use" hint for an API — known names get a hand-written guide,
 *  the rest get a sensible generic one based on auth/HTTPS metadata. */
function usageHint(a: ApiItem): string {
    const key = a.name.trim().toLowerCase();
    const guide: Record<string, string> = {
      openai: "کلید Bearer → POST api.openai.com/v1/chat/completions با JSON بدنه",
      anthropic: "کلید توی هدر x-api-key → POST api.anthropic.com/v1/messages",
      "google gemini": "کلید → GET generativelanguage.googleapis.com/v1beta/models",
      gemini: "کلید → GET generativelanguage.googleapis.com/v1beta/models",
      cohere: "کلید Bearer → POST api.cohere.com/v1/generate",
      elevenlabs: "کلید → POST api.elevenlabs.io/v1/text-to-speech",
      "hugging face": "کلید Bearer → POST huggingface.co/api/inference/models/…",
      "clipdrop api": "کلید → POST clipdrop.co/api/…",
      "pexels": "کلید → GET api.pexels.com/v1/search?query=…",
      "unsplash": "کلید → GET api.unsplash.com/photos",
      "pixabay": "کلید → GET pixabay.com/api/?key=…&q=…",
      "the cat api": "بدون کلید → GET thecatapi.com/v1/images/search",
      "dog api": "بدون کلید → GET dog.ceo/api/breeds/image/random",
      "numbers api": "بدون کلید → GET numbersapi.com/42",
      "random user": "بدون کلید → GET randomuser.me/api/",
      "spacex": "بدون کلید → GET api.spacexdata.com/v4/launches",
      "joke api": "بدون کلید → GET v2.jokeapi.dev/joke/Any",
      "advice slip": "بدون کلید → GET api.adviceslip.com/advice",
      "rest countries": "بدون کلید → GET restcountries.com/v3.1/all",
      "open weather map": "کلید → GET api.openweathermap.org/data/2.5/weather?q=…&appid=کلید",
      "ipify": "بدون کلید → GET api.ipify.org",
      "ipwhois": "بدون کلید → GET ipwho.is/8.8.8.8",
    };
    const hit = guide[key];
    if (hit) return hit;
    const noKey = a.auth === "" || /^(no|none|false)$/i.test(a.auth);
    return noKey
      ? "بدون کلید — مستقیم GET بزن و JSON بگیر"
      : "کلید لازمه — معمولاً توی هدر Authorization: Bearer <کلید>";
  }

  export function renderApis(apis: ApiItem[]): string {
    const parts = apis.map((a, i) => {
      const auth = a.auth === "" || /^(no|none|false)$/i.test(a.auth) ? "🔓 بدون کلید" : "🔑 با کلید";
      const https = a.https ? "🔒 HTTPS" : "⚠️ HTTP";
      return (
        `🧩 ${faNum(i + 1)}. <b><a href="${escapeHtml(a.link)}">${escapeHtml(a.name)}</a></b>\n` +
        `<i>${escapeHtml(truncate(a.desc, 120))}</i>\n` +
        `📖 ${escapeHtml(usageHint(a))}\n` +
        `${auth} · ${https}`
      );
    });
    return `🆓 <b>APIهای رایگان هوش مصنوعی</b>\n\n${parts.join("\n\n")}${FOOTER}`;
  }

/** Publish news to the channel. */
export async function postNewsToChannel(bot: Bot): Promise<string> {
  const items = await collectNews(5);
  if (!items.length) return "😔 خبری برای پست پیدا نشد.";
  await bot.api.sendMessage(CHANNEL, renderNews(items), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return "✅ اخبار توی کانال پست شد!";
}

/** Publish free APIs to the channel (rotating batch starting at `start`). */
export async function postApisToChannel(bot: Bot, start = 0): Promise<string> {
  const apis = await collectApis(5, start);
  if (!apis.length) return "😔 لیستی برای پست پیدا نشد.";
  await bot.api.sendMessage(CHANNEL, renderApis(apis), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return "✅ لیست APIها توی کانال پست شد!";
}

export function registerContentBot(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🤖 <b>ربات جمع‌آوری محتوای AI</b>\n\n" +
        "اخبار و APIهای رایگان هوش مصنوعی رو از سطح وب جمع می‌کنم — همه‌چی رایگانه، بدون کلید.\n\n" +
        "📰 <code>/news</code> — آخرین اخبار AI\n" +
        "🆓 <code>/apis</code> — لیست APIهای رایگان\n" +
        "📡 <code>/postnews</code> — پست اخبار به کانال\n" +
        "🚀 <code>/postapis</code> — پست لیست APIها به کانال",
      { parse_mode: "HTML" }
    );
  });

  bot.command("news", async (ctx) => {
    const wait = await ctx.reply("📡 در حال جمع‌آوری آخرین اخبار AI…");
    const items = await collectNews(5);
    if (!items.length) {
      await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, "😔 الان خبری در دسترس نیست، بعداً دوباره تلاش کن.");
      return;
    }
    await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, renderNews(items), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("apis", async (ctx) => {
    const wait = await ctx.reply("🆓 در حال جمع‌آوری لیست APIهای رایگان…");
    const apis = await collectApis(5, 0);
    if (!apis.length) {
      await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, "😔 لیست در دسترس نیست، بعداً دوباره تلاش کن.");
      return;
    }
    await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, renderApis(apis), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  // ---- publish directly to the channel (bot must be admin) ----
  bot.command("postnews", async (ctx) => {
    const wait = await ctx.reply("📡 در حال جمع‌آوری و پست به کانال…");
    const msg = await postNewsToChannel(bot);
    await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, msg);
  });

  bot.command("postapis", async (ctx) => {
    const wait = await ctx.reply("🆓 در حال جمع‌آوری و پست به کانال…");
    const msg = await postApisToChannel(bot);
    await ctx.api.editMessageText(ctx.chat!.id, wait.message_id, msg);
  });
}
