export const SESSION_COOKIE = "fssh_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(token, maxAgeSeconds = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function getAccount(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT a.discord_id, a.username, a.display_tag, a.rating
       FROM sessions s
       JOIN accounts a ON a.discord_id = s.discord_id
      WHERE s.token = ?1 AND s.expires_at > ?2`
  )
    .bind(token, now)
    .first();
  return row || null;
}

export async function requireAccount(env, request) {
  const account = await getAccount(env, request);
  if (!account) {
    return { account: null, response: json({ error: "unauthorized" }, 401) };
  }
  return { account, response: null };
}

export function matchmakerStub(env) {
  const id = env.MATCHMAKER.idFromName("global");
  return env.MATCHMAKER.get(id);
}

export async function callMatchmaker(env, path, init = {}) {
  const stub = matchmakerStub(env);
  return stub.fetch(`https://matchmaker.internal${path}`, init);
}
