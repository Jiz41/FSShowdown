import { callMatchmaker, requireAccount } from "../../../_lib/session.js";

export async function onRequestPost({ request, env, params }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  return callMatchmaker(env, "/reserve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      match_id: params.id,
      discord_id: account.discord_id,
    }),
  });
}
