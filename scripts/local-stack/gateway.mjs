// Minimal Supabase stand-in for local end-to-end tests (NOT for production):
//   /rest/v1/*    → PostgREST
//   /auth/v1/*    → password sign-in, refresh, user, logout (JWTs signed with JWT_SECRET)
//   /storage/v1/* → in-memory object store (upload, download, signed URLs, remove)
// Storage RLS is not enforced here; supabase/tests/smoke.sql covers the policies.
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const PGRST = process.env.PGRST_URL ?? "http://127.0.0.1:3001";
const SECRET = process.env.JWT_SECRET;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const objects = new Map(); // "bucket/path" → { type, body }

const b64url = (b) => Buffer.from(b).toString("base64url");
export function sign(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? "").split(".");
  if (!s) return null;
  const good = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (good !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp && p.exp < Date.now() / 1000 ? null : p;
}
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });

async function userById(id) {
  const { rows } = await db.query("select id, email, raw_user_meta_data from auth.users where id = $1", [id]);
  const u = rows[0];
  return u && { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
}
async function session(userId) {
  const user = await userById(userId);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: sign({ sub: userId, role: "authenticated", aud: "authenticated", email: user.email, exp }),
    token_type: "bearer", expires_in: 3600, expires_at: exp,
    refresh_token: sign({ sub: userId, typ: "refresh", exp: exp + 86400 }), user,
  };
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); return res.end(); }

    if (url.pathname.startsWith("/rest/v1/")) {
      const body = await readBody(req);
      const headers = { ...req.headers };
      delete headers.host;
      const r = await fetch(PGRST + url.pathname.slice("/rest/v1".length) + url.search, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "transfer-encoding", "connection"].includes(k))));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }

    if (url.pathname === "/auth/v1/token") {
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const { rows } = await db.query("select id from auth.users where lower(email) = lower($1) and encrypted_password = crypt($2, encrypted_password)", [b.email, b.password]);
        if (!rows[0]) return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        return json(res, 200, await session(rows[0].id));
      }
      const p = verify(b.refresh_token);
      if (!p) return json(res, 400, { error: "invalid_grant", error_description: "Invalid refresh token" });
      return json(res, 200, await session(p.sub));
    }
    if (url.pathname === "/auth/v1/user") {
      const p = verify(bearer);
      if (!p?.sub) return json(res, 401, { msg: "invalid JWT", code: 401 });
      return json(res, 200, await userById(p.sub));
    }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }

    if (url.pathname.startsWith("/storage/v1/object/")) {
      let rest = decodeURIComponent(url.pathname.slice("/storage/v1/object/".length));
      if (rest.startsWith("sign/")) {
        rest = rest.slice(5);
        if (req.method === "POST") return json(res, 200, { signedURL: `/object/sign/${rest}?token=local` });
        const o = objects.get(rest);
        if (!o) return json(res, 404, { error: "not_found" });
        res.writeHead(200, { "content-type": o.type }); return res.end(o.body);
      }
      if (!verify(bearer)?.sub) return json(res, 403, { error: "Unauthorized" });
      if (req.method === "DELETE") {
        const b = JSON.parse((await readBody(req)).toString() || "{}");
        (b.prefixes ?? []).forEach((p) => objects.delete(`${rest}/${p}`));
        return json(res, 200, []);
      }
      if (rest.startsWith("authenticated/")) rest = rest.slice("authenticated/".length);
      if (req.method === "POST" || req.method === "PUT") {
        if (objects.has(rest) && req.headers["x-upsert"] !== "true") return json(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        objects.set(rest, { type: req.headers["content-type"] ?? "application/octet-stream", body: await readBody(req) });
        return json(res, 200, { Key: rest, Id: crypto.randomUUID() });
      }
      const o = objects.get(rest);
      if (!o) return json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": o.type }); return res.end(o.body);
    }
    json(res, 404, { error: `gateway: no route for ${url.pathname}` });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`gateway on :${PORT}`));
