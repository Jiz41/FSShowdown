import { newToken } from "../_lib/session.js";
import { checkRateLimit } from "../_lib/rate_limit.js";

export async function onRequestGet({ request, env }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const allowed = await checkRateLimit(env, "login:" + ip, 10, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const origin = new URL(request.url).origin;
  const state = newToken();
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${origin}/auth/callback`,
    response_type: "code",
    scope: "identify",
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: `https://discord.com/oauth2/authorize?${params.toString()}`,
      "set-cookie": `fssh_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
