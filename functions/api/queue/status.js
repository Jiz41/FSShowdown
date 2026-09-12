import { callMatchmaker, json, requireAccount } from "../../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

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
        username: account.username,
        display_tag: account.display_tag,
        rating: account.rating,
      },
    },
    result.status
  );
}
