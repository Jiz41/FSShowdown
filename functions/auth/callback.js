import { json, newToken, sessionCookie, SESSION_TTL_SECONDS } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return json({ error: "missing_code" }, 400);
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    return json({ error: "token_exchange_failed", detail: body }, 502);
  }
  const tokenData = await tokenResponse.json();

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userResponse.ok) {
    const body = await userResponse.text();
    return json({ error: "user_fetch_failed", detail: body }, 502);
  }
  const user = await userResponse.json();

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO accounts (discord_id, username, display_tag, rating, created_at)
     VALUES (?1, ?2, ?3, 1000, ?4)
     ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username`
  )
    .bind(user.id, user.username, user.username, now)
    .run();

  const token = newToken();
  await env.DB.prepare(
    `INSERT INTO sessions (token, discord_id, expires_at) VALUES (?1, ?2, ?3)`
  )
    .bind(token, user.id, now + SESSION_TTL_SECONDS)
    .run();

  return new Response(null, {
    status: 302,
    headers: {
      location: "/queue",
      "set-cookie": sessionCookie(token),
    },
  });
}
