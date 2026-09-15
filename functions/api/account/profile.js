import { json, requireAccount } from "../../_lib/session.js";
import { checkRateLimit } from "../../_lib/rate_limit.js";

const ICON_BG = ["red", "blue", "green", "purple", "orange", "yellow", "black", "white"];
const ICON_BORDER = ["solid", "double", "dashed", "thick"];
const ICON_CREST = ["🐎", "🏆", "⭐", "👑", "⚡", "🛡️", "🦅", "🔥"];
const FLAG = ["JP", "UK", "US", "HK", "AU", "TR", "IE", "OTHER"];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const discordId = url.searchParams.get("id");
  if (!discordId) {
    return json({ error: "missing_id" }, 400);
  }

  const account = await env.DB.prepare(
    `SELECT discord_id, display_tag, x_link, icon_bg, icon_border, icon_crest, flag
       FROM accounts WHERE discord_id = ?1`
  )
    .bind(discordId)
    .first();

  if (!account) {
    return json({ error: "not_found" }, 404);
  }

  const ratingsResult = await env.DB.prepare(
    `SELECT platform, rating FROM ratings WHERE discord_id = ?1`
  ).bind(discordId).all();
  const ratings = (ratingsResult && ratingsResult.results) ? ratingsResult.results : [];

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

  const wins = winsRow ? winsRow.n : 0;
  const losses = lossesRow ? lossesRow.n : 0;

  const matchRows = await env.DB.prepare(
    `SELECT venue, distance,
            CASE WHEN player1_id = ?1 THEN player1_result ELSE player2_result END AS my_result
       FROM matches
      WHERE status = 'completed' AND (player1_id = ?1 OR player2_id = ?1)`
  )
    .bind(discordId)
    .all();

  const distanceCategories = ["短距離", "マイル", "中距離", "クラシック", "長距離", "超長距離"];
  const distanceStats = {};
  for (const cat of distanceCategories) {
    distanceStats[cat] = { category: cat, wins: 0, losses: 0 };
  }
  const venueStats = {};

  for (const row of (matchRows && matchRows.results) ? matchRows.results : []) {
    if (row.distance !== null && row.distance !== undefined) {
      const cat = distanceCategory(row.distance);
      if (distanceStats[cat]) {
        if (row.my_result === "win") distanceStats[cat].wins += 1;
        else if (row.my_result === "loss") distanceStats[cat].losses += 1;
      }
    }
    if (row.venue) {
      if (!venueStats[row.venue]) {
        venueStats[row.venue] = { venue: row.venue, wins: 0, losses: 0 };
      }
      if (row.my_result === "win") venueStats[row.venue].wins += 1;
      else if (row.my_result === "loss") venueStats[row.venue].losses += 1;
    }
  }

  return json({
    display_tag: account.display_tag ? account.display_tag : "名無しの騎手",
    x_link: account.x_link,
    icon_bg: account.icon_bg,
    icon_border: account.icon_border,
    icon_crest: account.icon_crest,
    flag: account.flag,
    ratings: ratings,
    wins,
    losses,
    total: wins + losses,
    distance_stats: distanceCategories.map((cat) => distanceStats[cat]),
    venue_stats: Object.values(venueStats),
  });
}

function distanceCategory(distance) {
  if (distance === 2400) return "クラシック";
  if (distance <= 1300) return "短距離";
  if (distance <= 1899) return "マイル";
  if (distance <= 2100) return "中距離";
  if (distance <= 2700) return "長距離";
  return "超長距離";
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

  const hasFlagUpdate = Object.prototype.hasOwnProperty.call(body, "flag");
  if (hasFlagUpdate) {
    if (body.flag !== null && !FLAG.includes(body.flag)) {
      return json({ error: "invalid_flag" }, 400);
    }
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

  if (hasFlagUpdate) {
    await env.DB.prepare(
      `UPDATE accounts SET flag = ?1 WHERE discord_id = ?2`
    )
      .bind(body.flag, account.discord_id)
      .run();
  }

  const after = await env.DB.prepare(
    `SELECT display_tag, x_link, icon_bg, icon_border, icon_crest, flag, rating
       FROM accounts WHERE discord_id = ?1`
  )
    .bind(account.discord_id)
    .first();

  return json(after);
}
