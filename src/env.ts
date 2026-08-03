/** Worker bindings (wrangler.toml + secrets). */
export interface Env {
  /** Token of the main factory bot (from @BotFather) — secret. */
  MAIN_BOT_TOKEN: string;
  /** Secret token used in the main bot's setWebhook call — secret. */
  WEBHOOK_SECRET: string;
  /** Cloudflare D1 binding. */
  DB: D1Database;
  /** Optional: max bots per user (default 5). */
  MAX_BOTS_PER_USER?: number;
}
