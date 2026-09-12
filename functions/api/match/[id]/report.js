import { callMatchmaker, requireAccount, json } from "../../../_lib/session.js";

export async function onRequestPost({ request, env, params }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid_json" }, 400);
  }

  const result = body && body.result;
  if (result !== "win" && result !== "loss") {
    return json({ error: "invalid_result" }, 400);
  }

  return callMatchmaker(env, "/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      match_id: params.id,
      discord_id: account.discord_id,
      result,
    }),
  });
}
