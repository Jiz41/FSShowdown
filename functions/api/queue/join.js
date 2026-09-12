import { callMatchmaker, requireAccount } from "../../_lib/session.js";

export async function onRequestPost({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  return callMatchmaker(env, "/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      discord_id: account.discord_id,
      username: account.username,
      display_tag: account.display_tag,
      rating: account.rating,
    }),
  });
}
