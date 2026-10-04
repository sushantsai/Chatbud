// Run against the development web server. Uses isolated fictional preview sessions only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.CHATBUD_TEST_URL || "http://127.0.0.1:3000";
function visitor() {
  let cookie = "";
  return async (path, body, expected = body ? 201 : 200, mode = "demo") => {
    const response = await fetch(`${base}/api/${path}?mode=${mode}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    const data = await response.json();
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
}
const a = visitor(),
  b = visitor();
const catalog = await a("catalog");
assert.equal(catalog.providers.length, 4);
assert.equal(catalog.products.length, 4);
await b("catalog");
const hold = {
  serviceId: "demo-s1",
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  idempotencyKey: randomUUID(),
};
const held = await a("appointments/holds", hold);
assert.equal((await a("appointments/holds", hold)).id, held.id);
await a("appointments/holds", { ...hold, idempotencyKey: randomUUID() }, 409);
await a("appointments/holds", { ...hold, serviceId: "demo-s2" }, 409);
assert.equal((await b("me")).appointments.length, 0);
const order = {
  items: [{ skuId: "demo-p1", quantity: 2 }],
  idempotencyKey: randomUUID(),
};
const ordered = await a("orders", order);
assert.equal(ordered.total, 1300);
assert.equal((await a("orders", order)).id, ordered.id);
await a(
  "orders",
  { ...order, items: [{ skuId: "demo-p1", quantity: 3 }] },
  409,
);
await a(
  "orders",
  {
    items: [
      { skuId: "demo-p1", quantity: 1 },
      { skuId: "demo-p1", quantity: 1 },
    ],
    idempotencyKey: randomUUID(),
  },
  400,
);
await a(
  "orders",
  {
    items: [
      { skuId: "demo-p1", quantity: 1 },
      { skuId: "missing", quantity: 1 },
    ],
    idempotencyKey: randomUUID(),
  },
  409,
);
assert.equal((await a("catalog")).products[0].stock, 16);
assert.equal((await b("catalog")).products[0].stock, 18);
assert.equal((await b("me")).orders.length, 0);
const application = await a("providers/applications", {
  profession: "dietitian",
  bio: "Fictional practitioner for the automated development smoke test.",
  experience: "Fictional qualification; do not publish.",
});
assert.equal((await b("admin/overview")).applications.length, 0);
await b("admin/review", { id: application.id, decision: "REJECTED" }, 404);
await a("admin/review", { id: application.id, decision: "NEEDS_INFORMATION" });
assert.equal((await a("me")).providerApplication.status, "NEEDS_INFORMATION");
await a("me", undefined, 401, "live");
await a("admin/overview", undefined, 401, "live");
const live = await a("catalog", undefined, 200, "live");
assert.equal(live.mode, "live");
assert.ok(live.providers.every((p) => !p.id.startsWith("demo-")));
assert.ok(live.products.every((p) => !p.id.startsWith("demo-")));
console.log(
  "PASS: catalog, holds, overlap, idempotency, inventory atomicity, session isolation, application review, and live auth gates.",
);
