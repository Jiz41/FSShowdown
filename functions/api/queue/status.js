import { callMatchmaker, json, requireAccount } from "../../_lib/session.js";
import { checkRateLimit } from "../../_lib/rate_limit.js";

export async function onRequestGet({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  const allowed = await checkRateLimit(env, "queue_status:" + account.discord_id, 30, 60);
  if (!allowed) {
    return json({ error: "rate_limited" }, 429);
  }

  const ratingsResult = await env.DB.prepare(
    `SELECT platform, rating FROM ratings WHERE discord_id = ?1`
  ).bind(account.discord_id).all();
  const ratings = (ratingsResult && ratingsResult.results) ? ratingsResult.results : [];

  const notifyDmRow = await env.DB.prepare(
    `SELECT notify_dm FROM accounts WHERE discord_id = ?1`
  ).bind(account.discord_id).first();
  const notifyDm = !!(notifyDmRow && notifyDmRow.notify_dm);

  const result = await callMatchmaker(
    env,
    `/status?discord_id=${encodeURIComponent(account.discord_id)}`,
    { method: "GET" }
  );
  const body = await result.json();

  return json(
    {
      ...body,
      account: {
        discord_id: account.discord_id,
        display_tag: account.display_tag,
        ratings: ratings,
        notify_dm: notifyDm,
      },
    },
    result.status
  );
}
