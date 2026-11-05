// Scratch test: real handler and real supabase-js, with only network fetch stubbed.
import assert from "node:assert/strict";
import handler from "../api/connect.js";

const VICTIM = "victim-id";
const REAL = "verified-user-id";
let startCalls;
let authMode;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/auth/v1/user")) {
    if (authMode === "down") throw new TypeError("fetch failed");
    if (authMode === "500") return new Response("{}", { status: 500, headers: { "content-type": "application/json" } });
    const auth = new Headers(init.headers).get("authorization");
    if (auth === "Bearer good-token") {
      return Response.json({ id: REAL, aud: "authenticated", email: "x@example.com" });
    }
    return Response.json({ code: 403, msg: "invalid JWT" }, { status: 403 });
  }
  if (u.includes("/start")) {
    startCalls.push(JSON.parse(init.body));
    return Response.json({ dailyRoom: "https://x.daily.co/r", dailyToken: "t" });
  }
  throw new Error("unexpected fetch " + u);
};

function run({ method = "POST", authorization, body = {} }) {
  const out = { status: 200, body: undefined };
  const res = {
    status(c) { out.status = c; return this; },
    setHeader() { return this; },
    json(b) { out.body = b; return this; },
    send(b) { out.body = b; return this; },
  };
  const headers = authorization ? { authorization } : {};
  return handler({ method, headers, body }, res).then(() => out);
}

function reset(env = true) {
  startCalls = [];
  authMode = "ok";
  process.env.PIPECAT_PUBLIC_KEY = "pk";
  if (env) {
    process.env.VITE_SUPABASE_URL = "https://proj.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "anon";
  } else {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  }
}

const cases = {
  "missing token -> 401, no session started": async () => {
    reset();
    const r = await run({ body: { user_id: VICTIM } });
    assert.equal(r.status, 401);
    assert.equal(startCalls.length, 0);
  },
  "non-bearer header -> 401": async () => {
    reset();
    const r = await run({ authorization: "Basic abc" });
    assert.equal(r.status, 401);
    assert.equal(startCalls.length, 0);
  },
  "invalid token -> 401, no session started": async () => {
    reset();
    const r = await run({ authorization: "Bearer forged", body: { user_id: VICTIM } });
    assert.equal(r.status, 401);
    assert.equal(startCalls.length, 0);
  },
  "valid token + spoofed user_id -> verified id wins": async () => {
    reset();
    const r = await run({
      authorization: "Bearer good-token",
      body: { user_id: VICTIM, language: "fr", mode: "chat" },
    });
    assert.equal(r.status, 200);
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0].body.user_id, REAL);
    assert.equal(startCalls[0].body.language, "fr");
    assert.ok(!JSON.stringify(startCalls[0]).includes(VICTIM));
  },
  "valid token, no body -> verified id still sent": async () => {
    reset();
    const r = await run({ authorization: "Bearer good-token", body: undefined });
    assert.equal(r.status, 200);
    assert.equal(startCalls[0].body.user_id, REAL);
  },
  "supabase env missing -> 500, no session started": async () => {
    reset(false);
    const r = await run({ authorization: "Bearer good-token" });
    assert.equal(r.status, 500);
    assert.equal(startCalls.length, 0);
  },
  "supabase returns 500 -> no session started": async () => {
    reset();
    authMode = "500";
    const r = await run({ authorization: "Bearer good-token" });
    console.log("    status on auth 500:", r.status);
    assert.equal(startCalls.length, 0);
  },
  "supabase unreachable -> no session started": async () => {
    reset();
    authMode = "down";
    const r = await run({ authorization: "Bearer good-token" });
    console.log("    status on auth unreachable:", r.status);
    assert.equal(startCalls.length, 0);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(cases)) {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "\n    ", e.message);
  }
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
