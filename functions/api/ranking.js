import { json } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");

  if (platform !== "ps5" && platform !== "pc") {
    return json({ error: "invalid_platform" }, 400);
  }

  const rows = await env.DB.prepare(
    `SELECT
       a.discord_id, a.display_tag, a.icon_bg, a.icon_border, a.icon_crest, a.flag, r.rating,
       COALESCE(SUM(CASE WHEN (m.player1_id = a.discord_id AND m.player1_result='win') OR (m.player2_id = a.discord_id AND m.player2_result='win') THEN 1 ELSE 0 END), 0) AS wins,
       COALESCE(SUM(CASE WHEN (m.player1_id = a.discord_id AND m.player1_result='loss') OR (m.player2_id = a.discord_id AND m.player2_result='loss') THEN 1 ELSE 0 END), 0) AS losses
     FROM ratings r
     JOIN accounts a ON a.discord_id = r.discord_id
     LEFT JOIN matches m ON (m.player1_id = a.discord_id OR m.player2_id = a.discord_id) AND m.status = 'completed' AND m.platform = r.platform
     WHERE r.platform = ?1
     GROUP BY a.discord_id
     ORDER BY r.rating DESC
     LIMIT 100`
  )
    .bind(platform)
    .all();

  const results = (rows && rows.results) ? rows.results : [];

  const ranking = results.map((row) => ({
    discord_id: row.discord_id,
    display_tag: row.display_tag ? row.display_tag : "名無しの騎手",
    icon_bg: row.icon_bg,
    icon_border: row.icon_border,
    icon_crest: row.icon_crest,
    flag: row.flag,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
  }));

  return json({ ranking });
}
