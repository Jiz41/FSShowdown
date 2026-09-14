import { callMatchmaker, json, requireAccount } from "../../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const { account, response } = await requireAccount(env, request);
  if (response) return response;

  const ratingsResult = await env.DB.prepare(
    `SELECT platform, rating FROM ratings WHERE discord_id = ?1`
  ).bind(account.discord_id).all();
  const ratings = (ratingsResult && ratingsResult.results) ? ratingsResult.results : [];

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
      },
    },
    result.status
  );
}
