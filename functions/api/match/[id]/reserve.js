import { callMatchmaker, requireAccount, json } from "../../../_lib/session.js";
import { checkRateLimit } from "../../../_lib/rate_limit.js";

export async function onRequestPost({ request, env, params }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  const allowed = await checkRateLimit(env, "reserve:" + account.discord_id, 20, 60);
  if (!allowed) {
    return json({ error: "rate_limited" }, 429);
  }

  return callMatchmaker(env, "/reserve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      match_id: params.id,
      discord_id: account.discord_id,
    }),
  });
}
