/** Template registry: the 10 supported bot types + Persian/English request matching.
 *  Ported from the Python prototype (legacy/python/src/templates.py). */

export type FeatureId =
  | "autoreply"
  | "shop"
  | "joiner"
  | "groupadmin"
  | "broadcast"
  | "welcome"
  | "poll"
  | "antispam"
  | "card"
  | "forward"
  | "content";

export const FEATURE_IDS: FeatureId[] = [
  "autoreply",
  "shop",
  "joiner",
  "groupadmin",
  "broadcast",
  "welcome",
  "poll",
  "antispam",
  "card",
  "forward",
  "content",
];

export interface Template {
  id: string;
  name: string;
  desc: string;
  keywords: string[]; // fa-normalized
  features: Record<FeatureId, boolean>;
  baseConfig: Record<string, unknown>;
  needsOwnerId: boolean;
  setupHint: string;
}

/** fa-normalization: lowercase, ي->ی, ك->ک, آ->ا, strip zero-width chars + Arabic diacritics. */
export function norm(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "ه").replace(/ة/g, "ه").replace(/آ/g, "ا");
  t = t.replace(/[\u200c\u200b\u200d\u200e\u200f\u064b-\u0652]/g, "");
  return t;
}

export const TEMPLATES: Template[] = [
  {
    id: "autoreply",
    name: "ربات پاسخگوی خودکار",
    desc: "به پیام‌های کاربران با کلمات کلیدی و متن‌های از پیش تعیین‌شده جواب می‌دهد.",
    keywords: ["پاسخ", "جواب", "اتورپلی", "اتو ریپلای", "اتو", "چت", "گفتگو", "مشاوره", "reply", "answer", "auto"],
    features: { autoreply: true, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: false, card: false, forward: false, content: false },
    baseConfig: { defaultReply: "سلام! چطور می‌تونم کمکت کنم؟" },
    needsOwnerId: false,
    setupHint: "بعد از ساخت، /panel را بزن و از «پاسخ خودکار» کلمات کلیدی را اضافه کن.",
  },
  {
    id: "shop",
    name: "ربات فروشگاه / درگاه",
    desc: "فروشگاه با محصولات، دکمه خرید و پرداخت با ستاره‌های تلگرام (Stars).",
    keywords: ["فروشگاه", "فروش", "خرید", "درگاه", "محصول", "پرداخت", "شارژ", "shop", "store", "buy", "payment", "price"],
    features: { autoreply: false, shop: true, joiner: false, groupadmin: false, broadcast: true, welcome: false, poll: false, antispam: false, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت، /panel → فروشگاه: محصولات را اضافه کن. قیمت‌ها با ستاره‌ی تلگرام پرداخت می‌شوند.",
  },
  {
    id: "joiner",
    name: "ربات جوینر / ممبرگیر",
    desc: "کاربران را مجبور می‌کند اول عضو کانال/گروه تو شوند تا از ربات استفاده کنند.",
    keywords: ["جوین", "ممبر", "عضو", "عضویت", "کانال", "join", "member", "subscribe"],
    features: { autoreply: false, shop: false, joiner: true, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: false, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت، /panel → گیت عضویت: آیدی کانال را بده و ربات را ادمین آن کانال کن.",
  },
  {
    id: "groupadmin",
    name: "ربات مدیریت گروه",
    desc: "کیک، بن، میوت، آنتی‌لینک و ضداسپم برای گروه خودت.",
    keywords: ["ادمین", "گروه", "کیک", "میت", "مدیریت", "mod", "admin", "kick", "ban"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: true, broadcast: false, welcome: true, poll: false, antispam: true, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "ربات را ادمین گروهت کن؛ دستورات /kick /ban /mute /antilink را در گروه اجرا کن.",
  },
  {
    id: "broadcast",
    name: "ربات اطلاع‌رسانی / برادکست",
    desc: "ارسال پیام همگانی به همه‌ی کسانی که ربات را استارت کرده‌اند.",
    keywords: ["اطلاع", "خبر", "برادکست", "همگانی", "اعلام", "کانال", "broadcast", "announce", "news"],
    features: { autoreply: true, shop: false, joiner: false, groupadmin: false, broadcast: true, welcome: false, poll: false, antispam: false, card: false, forward: false, content: false },
    baseConfig: { defaultReply: "برای اطلاع‌رسانی با ادمین در ارتباط باشید." },
    needsOwnerId: true,
    setupHint: "بعد از ساخت، /broadcast <متن> را بفرست تا به همه‌ی کاربران برسد.",
  },
  {
    id: "welcome",
    name: "ربات خوش‌آمدگویی",
    desc: "به اعضای جدید گروه پیام خوش‌آمد بده و گروه را حرفه‌ای نشان بده.",
    keywords: ["خوش امد", "خوشامد", "ویلکام", "welcome", "ورود"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: true, poll: false, antispam: false, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت، /setwelcome <متن> را بزن و ربات را ادمین گروهت کن.",
  },
  {
    id: "poll",
    name: "ربات نظرسنجی",
    desc: "ساخت نظرسنجی با دستور ساده و مشاهده نتایج.",
    keywords: ["نظرسنجی", "رای", "نظر", "poll", "vote", "survey"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: true, antispam: false, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت: /poll سوال|گزینه۱|گزینه۲|...",
  },
  {
    id: "antispam",
    name: "ربات ضداسپم",
    desc: "حذف خودکار پیام‌های حاوی لینک و کلمات اسپم در گروه.",
    keywords: ["اسپم", "ضد اسپم", "لینک", "هرز", "spam", "antispam"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: true, card: false, forward: false, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت ربات را ادمین گروه کن؛ /antilink on را بزن.",
  },
  {
    id: "card",
    name: "ربات کارت ویزیت / معرفی",
    desc: "به هر کسی که استارت کند، معرفی‌نامه‌ی تو را نشان می‌دهد.",
    keywords: ["کارت", "ویزیت", "معرفی", "رزومه", "بیو", "card", "bio", "introduce"],
    features: { autoreply: true, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: false, card: true, forward: false, content: false },
    baseConfig: { defaultReply: "سلام! 👋\nمن ربات معرفی هستم.\nبرای مشاهده‌ی اطلاعات، /info را بزن." },
    needsOwnerId: false,
    setupHint: "بعد از ساخت /setinfo <متن معرفی> را بزن.",
  },
  {
    id: "forward",
    name: "ربات فوروارد خودکار",
    desc: "پیام‌های کانال/گروه مبدأ را خودکار به مقصد فوروارد می‌کند.",
    keywords: ["فوروارد", "انتقال", "کپی", "forward", "copy", "relay"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: false, card: false, forward: true, content: false },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "بعد از ساخت /setforward @مبدا|@مقصد را بزن (ربات در هر دو ادمین باشد).",
  },
  {
    id: "content",
    name: "ربات جمع‌آوری محتوا",
    desc: "اخبار AI و لیست APIهای رایگان رو جمع می‌کند (RSS + publicapis.org — کاملاً رایگان).",
    keywords: ["جمع", "محتوا", "خبر", "اخبار", "rss", "feed", "content", "collector", "news"],
    features: { autoreply: false, shop: false, joiner: false, groupadmin: false, broadcast: false, welcome: false, poll: false, antispam: false, card: false, forward: false, content: true },
    baseConfig: {},
    needsOwnerId: true,
    setupHint: "دستورات /news (اخبار AI) و /apis (APIهای رایگان) را بزن.",
  },
];

export function defaultFeatures(): Record<FeatureId, boolean> {
  const f = {} as Record<FeatureId, boolean>;
  for (const id of FEATURE_IDS) f[id] = false;
  return f;
}

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function baseConfigFor(t: Template): Record<string, unknown> {
  return { features: { ...defaultFeatures(), ...t.features }, ...t.baseConfig };
}

export interface MatchResult {
  template: Template | null;
  score: number;
}

/** Longer keyword = stronger signal. First match wins per template, then max total score. */
export function matchRequest(text: string): MatchResult {
  const n = norm(text);
  let best: Template | null = null;
  let bestScore = 0;
  for (const t of TEMPLATES) {
    let score = 0;
    for (const kw of t.keywords) {
      const nk = norm(kw);
      if (n.includes(nk)) score += nk.length;
    }
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return { template: best, score: bestScore };
}

/** Simple heuristic: does this text look like a URL (for antilink)? */
export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)[^\s]+/i.test(text);
}
