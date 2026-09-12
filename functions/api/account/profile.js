import { json, requireAccount } from "../../_lib/session.js";
import { checkRateLimit } from "../../_lib/rate_limit.js";

const ICON_BG = ["red", "blue", "green", "purple", "orange", "yellow", "black", "white"];
const ICON_BORDER = ["solid", "double", "dashed", "thick"];
const ICON_CREST = ["🐎", "🏆", "⭐", "👑", "⚡", "🛡️", "🦅", "🔥"];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const discordId = url.searchParams.get("id");
  if (!discordId) {
    return json({ error: "missing_id" }, 400);
  }

  const account = await env.DB.prepare(
    `SELECT discord_id, display_tag, x_link, icon_bg, icon_border, icon_crest, rating
       FROM accounts WHERE discord_id = ?1`
  )
    .bind(discordId)
    .first();

  if (!account) {
    return json({ error: "not_found" }, 404);
  }

  const winsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM matches
      WHERE status = 'completed' AND (
        (player1_id = ?1 AND player1_result = 'win') OR
        (player2_id = ?1 AND player2_result = 'win')
      )`
  )
    .bind(discordId)
    .first();

  const lossesRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM matches
      WHERE status = 'completed' AND (
        (player1_id = ?1 AND player1_result = 'loss') OR
        (player2_id = ?1 AND player2_result = 'loss')
      )`
  )
    .bind(discordId)
    .first();

  return json({
    display_tag: account.display_tag ? account.display_tag : "名無しの騎手",
    x_link: account.x_link,
    icon_bg: account.icon_bg,
    icon_border: account.icon_border,
    icon_crest: account.icon_crest,
    rating: account.rating,
    wins: winsRow ? winsRow.n : 0,
    losses: lossesRow ? lossesRow.n : 0,
  });
}

export async function onRequestPost({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  const allowed = await checkRateLimit(env, "profile:" + account.discord_id, 10, 60);
  if (!allowed) {
    return json({ error: "rate_limited" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid_json" }, 400);
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, "display_tag")) {
    const trimmed = String(body.display_tag).trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      return json({ error: "invalid_display_tag" }, 400);
    }
    updates.display_tag = trimmed;
  }

  if (Object.prototype.hasOwnProperty.call(body, "x_link")) {
    const value = String(body.x_link);
    if (value !== "" && !value.startsWith("https://x.com/") && !value.startsWith("https://twitter.com/")) {
      return json({ error: "invalid_x_link" }, 400);
    }
    updates.x_link = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "icon_bg")) {
    if (!ICON_BG.includes(body.icon_bg)) {
      return json({ error: "invalid_icon_bg" }, 400);
    }
    updates.icon_bg = body.icon_bg;
  }

  if (Object.prototype.hasOwnProperty.call(body, "icon_border")) {
    if (!ICON_BORDER.includes(body.icon_border)) {
      return json({ error: "invalid_icon_border" }, 400);
    }
    updates.icon_border = body.icon_border;
  }

  if (Object.prototype.hasOwnProperty.call(body, "icon_crest")) {
    if (!ICON_CREST.includes(body.icon_crest)) {
      return json({ error: "invalid_icon_crest" }, 400);
    }
    updates.icon_crest = body.icon_crest;
  }

  await env.DB.prepare(
    `UPDATE accounts SET
       display_tag = COALESCE(?1, display_tag),
       x_link = COALESCE(?2, x_link),
       icon_bg = COALESCE(?3, icon_bg),
       icon_border = COALESCE(?4, icon_border),
       icon_crest = COALESCE(?5, icon_crest)
     WHERE discord_id = ?6`
  )
    .bind(
      Object.prototype.hasOwnProperty.call(updates, "display_tag") ? updates.display_tag : null,
      Object.prototype.hasOwnProperty.call(updates, "x_link") ? updates.x_link : null,
      Object.prototype.hasOwnProperty.call(updates, "icon_bg") ? updates.icon_bg : null,
      Object.prototype.hasOwnProperty.call(updates, "icon_border") ? updates.icon_border : null,
      Object.prototype.hasOwnProperty.call(updates, "icon_crest") ? updates.icon_crest : null,
      account.discord_id
    )
    .run();

  const after = await env.DB.prepare(
    `SELECT display_tag, x_link, icon_bg, icon_border, icon_crest, rating
       FROM accounts WHERE discord_id = ?1`
  )
    .bind(account.discord_id)
    .first();

  return json(after);
}
