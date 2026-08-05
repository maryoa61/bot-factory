/** Per-tenant runtime context: config lives in D1 (single JSON column), the panel
 *  message mirrors it so the user always sees (and can refresh from) the live state. */

import type { Bot } from "grammy";

import type { Env } from "./env";
import { setConfig } from "./registry";
import type { TenantRow } from "./registry";
import type { FeatureId } from "./templates";

export interface Product {
  name: string;
  price: number; // Telegram Stars
}

export interface TenantConfig {
  features: Record<FeatureId, boolean>;
  defaultReply?: string;
  replies?: Record<string, string>;
  products?: Product[];
  channel?: string | number | null; // joiner gate
  welcomeText?: string | null;
  antilink?: boolean;
  badWords?: string[];
  forward?: { src: number; dst: number } | null;
  cardInfo?: string | null;
  panel?: { chat: number; msg: number } | null;
}

export class TenantCtx {
  readonly env: Env;
  readonly tenant: TenantRow;
  config: TenantConfig;

  constructor(env: Env, tenant: TenantRow) {
    this.env = env;
    this.tenant = tenant;
    try {
      this.config = JSON.parse(tenant.config || "{}");
    } catch {
      this.config = { features: {} as Record<FeatureId, boolean> };
    }
    this.config.features = this.config.features ?? ({} as Record<FeatureId, boolean>);
  }

  get ownerId(): number {
    return this.tenant.owner_id;
  }

  feature(f: FeatureId): boolean {
    return !!this.config.features[f];
  }

  /** Persist config to D1, then refresh the panel message if it is open. */
  async save(bot: Bot): Promise<void> {
    await setConfig(this.env.REGISTRY, this.tenant.id, this.config);
    await refreshPanel(bot, this);
  }

  isOwner(userId: number): boolean {
    return userId === this.ownerId;
  }
}

/** Panel: rendered from config, JSON block embedded in the message text. */
export function panelText(t: TenantCtx): string {
  const lines: string[] = [];
  lines.push(`📊 پنل مدیریت — @${t.tenant.username ?? ""}`);
  lines.push(`قالب: ${t.tenant.template}`);
  lines.push("");

  const f = t.config.features;
  const names: Record<FeatureId, string> = {
    autoreply: "پاسخ خودکار",
    shop: "فروشگاه",
    joiner: "گیت عضویت",
    groupadmin: "مدیریت گروه",
    broadcast: "برادکست",
    welcome: "خوش‌آمدگویی",
    poll: "نظرسنجی",
    antispam: "ضداسپم",
    card: "کارت ویزیت",
    forward: "فوروارد",
    content: "جمع‌آوری محتوا",
  };
  const active = FEATURE_IDS_ENABLED(t);
  if (active.length) {
    lines.push(`✨ امکانات فعال: ${active.map((id) => names[id]).join("، ")}`);
  } else {
    lines.push("✨ امکانات فعال: —");
  }

  if (t.config.replies && Object.keys(t.config.replies).length) {
    lines.push(`🗣 پاسخ‌های خودکار: ${Object.keys(t.config.replies).length} کلیدواژه`);
  }
  if (t.config.products && t.config.products.length) {
    lines.push(`🛒 محصولات: ${t.config.products.length}`);
  }
  if (t.config.channel) {
    lines.push(`🔗 گیت عضویت: ${t.config.channel}`);
  }
  if (t.config.welcomeText) {
    lines.push(`👋 متن خوش‌آمد: تنظیم شده`);
  }
  if (t.config.antilink) {
    lines.push(`🚫 آنتی‌لینک: روشن`);
  }
  if (t.config.forward) {
    lines.push(`🔁 فوروارد: مبدأ ${t.config.forward.src} → مقصد ${t.config.forward.dst}`);
  }
  if (t.config.cardInfo) {
    lines.push(`🪪 کارت ویزیت: تنظیم شده`);
  }

  lines.push("");
  lines.push("برای مدیریت هر بخش، دکمه‌ی اون رو بزن.");
  lines.push("");
  lines.push(`<code>${JSON.stringify(t.config)}</code>`);
  return lines.join("\n");
}

function FEATURE_IDS_ENABLED(t: TenantCtx): FeatureId[] {
  return (Object.keys(t.config.features) as FeatureId[]).filter((id) => t.config.features[id]);
}

const FEATURE_HELP: Record<string, string> = {
  autoreply: "/addreply کلید|جواب\n/delreply کلید\n/delreply * (حذف همه)",
  shop: "/addproduct نام|قیمت(ستاره)\n/delproduct شماره\n/shop",
  joiner: "/setchannel @کانال",
  groupadmin: "/kick (ریپلای)  /ban (ریپلای)  /mute (ریپلای)\n/antilink on|off  /setwelcome متن\n/setchannel @کانال  /post متن",
  broadcast: "/broadcast متن",
  welcome: "/setwelcome متن",
  poll: "/poll سوال|گزینه۱|گزینه۲|...",
  antispam: "/antilink on|off  /addword کلمه",
  card: "/setinfo متن معرفی",
  forward: "/setforward @مبدا|@مقصد  /fwd off",
  content: "/news  (اخبار AI)   /apis  (APIهای رایگان)",
};

export function panelKb(t: TenantCtx): { inline_keyboard: { text: string; callback_data: string }[][] } {
  const kb: { text: string; callback_data: string }[][] = [];
  for (const id of FEATURE_IDS_ENABLED(t)) {
    const names: Record<string, string> = {
      autoreply: "🗣 پاسخ خودکار",
      shop: "🛒 فروشگاه",
      joiner: "🔗 گیت عضویت",
      groupadmin: "🛡 مدیریت گروه",
      broadcast: "📢 برادکست",
      welcome: "👋 خوش‌آمد",
      poll: "📊 نظرسنجی",
      antispam: "🚫 ضداسپم",
      card: "🪪 کارت ویزیت",
      forward: "🔁 فوروارد",
      content: "📰 جمع‌آوری محتوا",
    };
    kb.push([{ text: names[id] ?? id, callback_data: `pn:help:${id}` }]);
  }
  kb.push([{ text: "🔄 به‌روزرسانی", callback_data: "pn:refresh" }]);
  return { inline_keyboard: kb };
}

export async function sendPanel(bot: Bot, chatId: number, t: TenantCtx): Promise<void> {
  const msg = await bot.api.sendMessage(chatId, panelText(t), { reply_markup: panelKb(t) });
  t.config.panel = { chat: chatId, msg: msg.message_id };
  await setConfig(t.env.REGISTRY, t.tenant.id, t.config);
}

export async function refreshPanel(bot: Bot, t: TenantCtx): Promise<void> {
  const p = t.config.panel;
  if (!p) return;
  try {
    await bot.api.editMessageText(p.chat, p.msg, panelText(t), { reply_markup: panelKb(t) });
  } catch {
    // panel message too old (48h) or deleted — ignore, next /panel re-opens it
  }
}

export function registerPanelCallbacks(bot: Bot, t: TenantCtx): void {
  bot.callbackQuery(/^pn:refresh$/, async (ctx) => {
    await ctx.answerCallbackQuery("به‌روزرسانی شد");
    await refreshPanel(bot, t);
  });
  bot.callbackQuery(/^pn:help:(\w+)$/, async (ctx) => {
    const id = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.reply(`📌 دستورات ${id}:\n${FEATURE_HELP[id] ?? "—"}\n\nاین دستورات رو همینجا بفرست.`);
  });
}
