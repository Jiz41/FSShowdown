const RACES = [
  { name: "フェブラリーステークス", venue: "東京", distance: 1600, surface: "ダート" },
  { name: "高松宮記念", venue: "中京", distance: 1200, surface: "芝" },
  { name: "大阪杯", venue: "阪神", distance: 2000, surface: "芝" },
  { name: "桜花賞", venue: "阪神", distance: 1600, surface: "芝" },
  { name: "皐月賞", venue: "中山", distance: 2000, surface: "芝" },
  { name: "天皇賞(春)", venue: "京都", distance: 3200, surface: "芝" },
  { name: "NHKマイルカップ", venue: "東京", distance: 1600, surface: "芝" },
  { name: "ヴィクトリアマイル", venue: "東京", distance: 1600, surface: "芝" },
  { name: "オークス", venue: "東京", distance: 2400, surface: "芝" },
  { name: "日本ダービー", venue: "東京", distance: 2400, surface: "芝" },
  { name: "安田記念", venue: "東京", distance: 1600, surface: "芝" },
  { name: "宝塚記念", venue: "阪神", distance: 2200, surface: "芝" },
  { name: "スプリンターズステークス", venue: "中山", distance: 1200, surface: "芝" },
  { name: "秋華賞", venue: "京都", distance: 2000, surface: "芝" },
  { name: "菊花賞", venue: "京都", distance: 3000, surface: "芝" },
  { name: "天皇賞(秋)", venue: "東京", distance: 2000, surface: "芝" },
  { name: "エリザベス女王杯", venue: "京都", distance: 2200, surface: "芝" },
  { name: "マイルチャンピオンシップ", venue: "京都", distance: 1600, surface: "芝" },
  { name: "ジャパンカップ", venue: "東京", distance: 2400, surface: "芝" },
  { name: "チャンピオンズカップ", venue: "中京", distance: 1800, surface: "ダート" },
  { name: "有馬記念", venue: "中山", distance: 2500, surface: "芝" },
];

const MATCH_TTL_SECONDS = 15 * 60;
const REPORT_TTL_SECONDS = 10 * 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function notifyMatchByDM(env, discordId, matchedAt) {
  try {
    const account = await env.DB.prepare(
      `SELECT notify_dm FROM accounts WHERE discord_id = ?1`
    ).bind(discordId).first();
    if (!account || account.notify_dm !== 1) return;

    const channelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });
    const channel = await channelRes.json();
    if (!channel || !channel.id) return;

    const content = `⚡️HERE COMES A NEW CHALLENGER！⚡️\n<t:${matchedAt}:t>に開始したマッチングに対戦相手が現れました。15分以内にゲートイン（対戦開始）してください。\n[サイトを開く →](https://fsshowdown.pages.dev/queue.html)`;

    await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    // DM送信の失敗（未サーバー参加・DM拒否設定等）はマッチング処理を失敗させない
  }
}

export class Matchmaker {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/join" && request.method === "POST") {
        return await this.join(await request.json());
      }
      if (url.pathname === "/leave" && request.method === "POST") {
        return await this.leave(await request.json());
      }
      if (url.pathname === "/status" && request.method === "GET") {
        return await this.status(url.searchParams.get("discord_id"));
      }
      if (url.pathname === "/reserve" && request.method === "POST") {
        return await this.reserve(await request.json());
      }
      if (url.pathname === "/report" && request.method === "POST") {
        return await this.report(await request.json());
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: "matchmaker_error", detail: String(err) }, 500);
    }
  }

  async getQueue() {
    return (await this.state.storage.get("queue")) || [];
  }

  async setQueue(queue) {
    await this.state.storage.put("queue", queue);
  }

  async scheduleAlarm(expiresAt) {
    const current = await this.state.storage.getAlarm();
    const targetMs = expiresAt * 1000;
    if (current === null || current > targetMs) {
      await this.state.storage.setAlarm(targetMs);
    }
  }

  async join(body) {
    const { discord_id, display_tag, platform } = body;
    if (!discord_id) return json({ error: "missing_discord_id" }, 400);
    if (!platform) return json({ error: "missing_platform" }, 400);

    const ratingRow = await this.env.DB.prepare(
      `SELECT rating FROM ratings WHERE discord_id = ?1 AND platform = ?2`
    ).bind(discord_id, platform).first();
    const rating = ratingRow ? ratingRow.rating : 1000;

    const existing = await this.findActiveMatch(discord_id);
    if (existing) {
      return json({ status: "matched", match: existing });
    }

    const queue = await this.getQueue();
    const others = queue.filter(
      (entry) => entry.discord_id !== discord_id && entry.platform === platform
    );

    if (others.length === 0) {
      const self = {
        discord_id,
        display_tag,
        rating,
        platform,
        joined_at: Math.floor(Date.now() / 1000),
      };
      await this.setQueue([...others, self]);
      return json({ status: "waiting" });
    }

    let opponent = others[0];
    for (const entry of others) {
      if (Math.abs(entry.rating - rating) < Math.abs(opponent.rating - rating)) {
        opponent = entry;
      }
    }
    await this.setQueue(others.filter((e) => e.discord_id !== opponent.discord_id));

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + MATCH_TTL_SECONDS;
    const matchId = crypto.randomUUID();
    const race = RACES[Math.floor(Math.random() * RACES.length)];
    const raceName = race.name;

    await this.env.DB.prepare(
      `INSERT INTO matches
         (id, player1_id, player2_id, race_name, status, host_id, matched_at, reserved_at, expires_at, venue, distance, surface, platform)
       VALUES (?1, ?2, ?3, ?4, 'pending', NULL, ?5, NULL, ?6, ?7, ?8, ?9, ?10)`
    )
      .bind(matchId, opponent.discord_id, discord_id, raceName, now, expiresAt, race.venue, race.distance, race.surface, platform)
      .run();

    await this.state.storage.put(`match:${opponent.discord_id}`, matchId);
    await this.state.storage.put(`match:${discord_id}`, matchId);
    await this.scheduleAlarm(expiresAt);

    await Promise.all([
      notifyMatchByDM(this.env, opponent.discord_id, now),
      notifyMatchByDM(this.env, discord_id, now),
    ]);

    return json({
      status: "matched",
      match: {
        match_id: matchId,
        race_name: raceName,
        status: "pending",
        host_id: null,
        matched_at: now,
        expires_at: expiresAt,
        opponent_discord_id: opponent.discord_id,
        opponent_display_tag: opponent.display_tag,
      },
    });
  }

  async leave(body) {
    const { discord_id } = body;
    if (!discord_id) return json({ error: "missing_discord_id" }, 400);
    const queue = await this.getQueue();
    await this.setQueue(queue.filter((e) => e.discord_id !== discord_id));
    return json({ status: "left" });
  }

  async status(discordId) {
    if (!discordId) return json({ error: "missing_discord_id" }, 400);

    const match = await this.findActiveMatch(discordId);
    if (match) {
      return json({ status: "matched", match });
    }

    const queue = await this.getQueue();
    const inQueue = queue.some((e) => e.discord_id === discordId);
    return json({ status: inQueue ? "waiting" : "idle" });
  }

  async findActiveMatch(discordId) {
    const matchId = await this.state.storage.get(`match:${discordId}`);
    if (!matchId) return null;

    const row = await this.env.DB.prepare(
      `SELECT id, player1_id, player2_id, race_name, status, host_id,
              matched_at, reserved_at, expires_at, platform
         FROM matches WHERE id = ?1`
    )
      .bind(matchId)
      .first();

    if (!row) {
      await this.state.storage.delete(`match:${discordId}`);
      return null;
    }
    if (row.status === "no_contest") {
      await this.state.storage.delete(`match:${discordId}`);
      return {
        match_id: row.id,
        race_name: row.race_name,
        status: "no_contest",
        host_id: row.host_id,
        matched_at: row.matched_at,
        reserved_at: row.reserved_at,
        expires_at: row.expires_at,
        opponent_discord_id: null,
        opponent_display_tag: null,
        platform: row.platform,
      };
    }

    const opponentId =
      row.player1_id === discordId ? row.player2_id : row.player1_id;
    const opponent = await this.env.DB.prepare(
      `SELECT discord_id, display_tag FROM accounts WHERE discord_id = ?1`
    )
      .bind(opponentId)
      .first();

    return {
      match_id: row.id,
      race_name: row.race_name,
      status: row.status,
      host_id: row.host_id,
      matched_at: row.matched_at,
      reserved_at: row.reserved_at,
      expires_at: row.expires_at,
      opponent_discord_id: opponent ? opponent.discord_id : null,
      opponent_display_tag: opponent ? opponent.display_tag : null,
      platform: row.platform,
    };
  }

  async reserve(body) {
    const { match_id, discord_id } = body;
    if (!match_id || !discord_id) return json({ error: "missing_params" }, 400);

    const row = await this.env.DB.prepare(
      `SELECT id, player1_id, player2_id, race_name, status, host_id, expires_at
         FROM matches WHERE id = ?1`
    )
      .bind(match_id)
      .first();

    if (!row) return json({ error: "match_not_found" }, 404);
    if (row.player1_id !== discord_id && row.player2_id !== discord_id) {
      return json({ error: "not_a_participant" }, 403);
    }
    if (row.status === "no_contest") {
      return json({ status: "no_contest", match_id: row.id }, 409);
    }

    if (row.host_id === null) {
      const now = Math.floor(Date.now() / 1000);
      const reportExpiresAt = now + REPORT_TTL_SECONDS;
      await this.env.DB.prepare(
        `UPDATE matches
            SET host_id = ?1, status = 'reserved', reserved_at = ?2, expires_at = ?4
          WHERE id = ?3 AND host_id IS NULL`
      )
        .bind(discord_id, now, match_id, reportExpiresAt)
        .run();
      await this.scheduleAlarm(reportExpiresAt);
      const after = await this.env.DB.prepare(
        `SELECT host_id, status, reserved_at FROM matches WHERE id = ?1`
      )
        .bind(match_id)
        .first();
      return json({
        status: after.status,
        role: after.host_id === discord_id ? "host" : "guest",
        host_id: after.host_id,
        reserved_at: after.reserved_at,
        race_name: row.race_name,
      });
    }

    return json({
      status: row.status,
      role: row.host_id === discord_id ? "host" : "guest",
      host_id: row.host_id,
      race_name: row.race_name,
    });
  }

  async report(body) {
    const { match_id, discord_id, result } = body;
    if (!match_id || !discord_id || !result) {
      return json({ error: "missing_params" }, 400);
    }
    if (result !== "win" && result !== "loss") {
      return json({ error: "invalid_result" }, 400);
    }

    const row = await this.env.DB.prepare(
      `SELECT id, player1_id, player2_id, status, player1_result, player2_result, platform
         FROM matches WHERE id = ?1`
    )
      .bind(match_id)
      .first();

    if (!row) return json({ error: "match_not_found" }, 404);
    if (row.player1_id !== discord_id && row.player2_id !== discord_id) {
      return json({ error: "not_a_participant" }, 403);
    }
    if (row.status !== "reserved") {
      return json({ error: "invalid_status", status: row.status }, 400);
    }

    if (!row.platform) {
      return json({ error: "invalid_platform_on_match" }, 500);
    }

    const isPlayer1 = row.player1_id === discord_id;
    if (isPlayer1) {
      await this.env.DB.prepare(
        `UPDATE matches SET player1_result = ?1 WHERE id = ?2`
      )
        .bind(result, match_id)
        .run();
    } else {
      await this.env.DB.prepare(
        `UPDATE matches SET player2_result = ?1 WHERE id = ?2`
      )
        .bind(result, match_id)
        .run();
    }

    const after = await this.env.DB.prepare(
      `SELECT player1_id, player2_id, player1_result, player2_result
         FROM matches WHERE id = ?1`
    )
      .bind(match_id)
      .first();

    if (!after.player1_result || !after.player2_result) {
      return json({ status: "awaiting_opponent" });
    }

    const consistent =
      (after.player1_result === "win" && after.player2_result === "loss") ||
      (after.player1_result === "loss" && after.player2_result === "win");

    if (!consistent) {
      await this.env.DB.prepare(
        `UPDATE matches SET player1_result = NULL, player2_result = NULL WHERE id = ?1`
      )
        .bind(match_id)
        .run();
      return json({ status: "mismatch" });
    }

    const winnerId = after.player1_result === "win" ? after.player1_id : after.player2_id;
    const loserId = winnerId === after.player1_id ? after.player2_id : after.player1_id;

    const winnerRow = await this.env.DB.prepare(
      `SELECT rating FROM ratings WHERE discord_id = ?1 AND platform = ?2`
    ).bind(winnerId, row.platform).first();
    const Rw = winnerRow ? winnerRow.rating : 1000;
    const loserRow = await this.env.DB.prepare(
      `SELECT rating FROM ratings WHERE discord_id = ?1 AND platform = ?2`
    ).bind(loserId, row.platform).first();
    const Rl = loserRow ? loserRow.rating : 1000;
    const ratingDiff = Rw - Rl;
    const steps = Math.floor(Math.abs(ratingDiff) / 25);
    let K;
    if (ratingDiff >= 0) {
      K = Math.max(1, 16 - steps);
    } else {
      K = 16 + steps;
    }
    const We = 1 / (1 + Math.pow(10, (Rl - Rw) / 400));
    const rawDelta = K * (1 - We);
    let delta = Math.round(rawDelta);
    delta = Math.min(30, Math.max(1, delta));

    const newWinnerRating = Rw + delta;
    const newLoserRating = Rl - delta;

    await this.env.DB.prepare(
      `INSERT INTO ratings (discord_id, platform, rating) VALUES (?1, ?2, ?3)
       ON CONFLICT(discord_id, platform) DO UPDATE SET rating = excluded.rating`
    ).bind(winnerId, row.platform, newWinnerRating).run();
    await this.env.DB.prepare(
      `INSERT INTO ratings (discord_id, platform, rating) VALUES (?1, ?2, ?3)
       ON CONFLICT(discord_id, platform) DO UPDATE SET rating = excluded.rating`
    ).bind(loserId, row.platform, newLoserRating).run();
    await this.env.DB.prepare(
      `UPDATE matches SET status = 'completed', rating_delta = ?1 WHERE id = ?2`
    )
      .bind(delta, match_id)
      .run();

    await this.state.storage.delete(`match:${after.player1_id}`);
    await this.state.storage.delete(`match:${after.player2_id}`);

    const selfIsWinner = discord_id === winnerId;
    const newRating = selfIsWinner ? newWinnerRating : newLoserRating;

    return json({
      status: "completed",
      result: selfIsWinner ? "win" : "loss",
      rating_delta: delta,
      new_rating: newRating,
    });
  }

  async alarm() {
    const now = Math.floor(Date.now() / 1000);
    await this.env.DB.prepare(
      `UPDATE matches SET status = 'no_contest'
        WHERE status IN ('pending', 'reserved') AND expires_at <= ?1`
    )
      .bind(now)
      .run();

    const next = await this.env.DB.prepare(
      `SELECT MIN(expires_at) AS next_expiry FROM matches WHERE status IN ('pending', 'reserved')`
    ).first();

    if (next && next.next_expiry !== null) {
      await this.state.storage.setAlarm(next.next_expiry * 1000);
    }
  }
}

export default {
  async fetch() {
    return json({ error: "matchmaker_worker_has_no_public_routes" }, 404);
  },
  async scheduled(event, env, ctx) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?1`).bind(now).run();
    await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?1`).bind(now - 3600).run();
  },
};
