/**
 * dsh-web-tools — browser client plugin entry.
 *
 * Registers a card into the `settings.plugin.item` slot (Settings → Plugins →
 * Plugin configuration). The card talks to the Host exclusively through the
 * plugin's fenced `/web-tools/api` HTTP routes (see ../host/routes.ts) —
 * credentials never reach the browser.
 *
 * Registration shape mirrors the official `dsh-client-ui-settings-plugins`
 * cards (BashCard/WebSearchCard) so the slot contract is satisfied exactly.
 * @module
 */
import { WebToolsCard } from "./WebToolsCard.tsx";

/** Locale namespace for this card's copy. */
export const NS = "dsh-web-tools";

/** Services required by this client plugin. */
export const inject = ["slots", "locale"];

/** Plugin config (none needed at the client layer). */
export const Config = {};

/** Register the settings card. */
export function apply(ctx: any) {
  const t = (key: string, fallback: string) => {
    try {
      const bound = ctx.locale.bind(NS);
      const v = bound(key);
      return typeof v === "string" && v.length > 0 ? v : fallback;
    } catch {
      return fallback;
    }
  };

  ctx.effect(() =>
    ctx.locale.register(NS, {
      en: {
        cardTitle: "dsh-web-tools",
        cardDescription: "Multi-provider web search & fetch (Tavily / Exa / Firecrawl / Brave / You.com / Jina / SearXNG) with per-provider account pools, quota, and deterministic fallback.",
      },
      zh: {
        cardTitle: "dsh-web-tools",
        cardDescription: "多搜索引擎 Web 搜索与抓取（Tavily / Exa / Firecrawl / Brave / You.com / Jina / SearXNG），支持每引擎账号池、额度查询与自动回退。",
      },
    }),
  );

  ctx.slots.inject("settings.plugin.item", function* () {
    yield ctx.slots.register(
      {
        name: "settings.plugin.item",
        id: "dsh-web-tools",
        order: 60,
        locale: NS,
        label: () => t("cardTitle", "dsh-web-tools"),
        inject: () => ({}),
      },
      WebToolsCard,
    );
  });
}
