import { json, requireAccount, SESSION_COOKIE } from "../../_lib/session.js";
import { checkRateLimit } from "../../_lib/rate_limit.js";

export async function onRequestPost({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  const allowed = await checkRateLimit(env, "account_delete:" + account.discord_id, 5, 60);
  if (!allowed) {
    return json({ error: "rate_limited" }, 429);
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM ratings WHERE discord_id = ?1`).bind(account.discord_id),
    env.DB.prepare(`DELETE FROM sessions WHERE discord_id = ?1`).bind(account.discord_id),
    env.DB.prepare(`DELETE FROM accounts WHERE discord_id = ?1`).bind(account.discord_id),
  ]);

  return json(
    { success: true },
    200,
    { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  );
}
