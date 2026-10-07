// A booking is marked paid only when the provider itself reports full payment.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  esewaForm,
  esewaSignature,
  esewaStatus,
  khaltiStart,
  khaltiStatus,
  methods,
  rupees,
} from "../src/payments";
const keys = [
  "KHALTI_SECRET_KEY",
  "KHALTI_MODE",
  "ESEWA_PRODUCT_CODE",
  "ESEWA_SECRET",
  "PUBLIC_WEB_URL",
];
afterEach(() => keys.forEach((key) => delete process.env[key]));
const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const id = "3f2b8c1e-7a4d-4e9b-9c55-0d6a1f2e3b4c";

test("amounts go to eSewa in rupees", () => {
  assert.equal(rupees(100000), "1000");
  assert.equal(rupees(150050), "1500.5");
});

test("the eSewa signature covers amount, transaction and product code", () => {
  // Regression value for eSewa's documented sandbox example message.
  assert.equal(
    esewaSignature("100", "11-201-13", "EPAYTEST", "8gBm/:&EnhH.1/q"),
    "5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=",
  );
  assert.notEqual(
    esewaSignature("101", "11-201-13", "EPAYTEST", "8gBm/:&EnhH.1/q"),
    esewaSignature("100", "11-201-13", "EPAYTEST", "8gBm/:&EnhH.1/q"),
  );
});

test("the eSewa form uses the sandbox until live details are set", () => {
  const sandbox = esewaForm(id, 100000);
  assert.match(sandbox.url, /^https:\/\/rc-epay\.esewa\.com\.np\//);
  assert.equal(sandbox.fields.product_code, "EPAYTEST");
  assert.equal(sandbox.fields.total_amount, "1000");
  assert.equal(
    sandbox.fields.success_url,
    `https://chatbud-web.vercel.app/pay/return/${id}`,
  );
  process.env.ESEWA_PRODUCT_CODE = "CHATBUD";
  process.env.ESEWA_SECRET = "test-value";
  assert.match(esewaForm(id, 100000).url, /^https:\/\/epay\.esewa\.com\.np\//);
  assert.equal(methods().find((m) => m.id === "ESEWA")?.test, false);
});

test("eSewa counts only COMPLETE with a reference as paid", async () => {
  assert.deepEqual(
    await esewaStatus(
      id,
      100000,
      reply(200, { status: "COMPLETE", ref_id: "0007G36" }),
    ),
    {
      outcome: "SUCCEEDED",
      reference: "0007G36",
    },
  );
  assert.equal(
    (await esewaStatus(id, 100000, reply(200, { status: "COMPLETE" }))).outcome,
    "FAILED",
  );
  assert.equal(
    (await esewaStatus(id, 100000, reply(200, { status: "PENDING" }))).outcome,
    "PENDING",
  );
  assert.equal(
    (await esewaStatus(id, 100000, reply(200, { status: "NOT_FOUND" })))
      .outcome,
    "FAILED",
  );
  assert.equal(
    (await esewaStatus(id, 100000, reply(200, { status: "CANCELED" }))).outcome,
    "FAILED",
  );
  await assert.rejects(esewaStatus(id, 100000, reply(500, {})));
});

test("Khalti is offered only when a key is set, and starts in the sandbox", async () => {
  assert.equal(methods().find((m) => m.id === "KHALTI")?.available, false);
  process.env.KHALTI_SECRET_KEY = "test-value";
  assert.equal(methods().find((m) => m.id === "KHALTI")?.available, true);
  const seen: { url: string; body: any; auth: string }[] = [];
  const started = await khaltiStart(
    {
      id,
      amountMinor: 100000,
      title: "Session",
      name: "Test",
      email: "t@example.invalid",
    },
    (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        body: JSON.parse(String(init.body)),
        auth: (init.headers as any).authorization,
      });
      return new Response(
        JSON.stringify({
          pidx: "px1",
          payment_url: "https://test-pay.khalti.com/?pidx=px1",
        }),
      );
    }) as unknown as typeof fetch,
  );
  assert.deepEqual(started, {
    reference: "px1",
    url: "https://test-pay.khalti.com/?pidx=px1",
  });
  assert.equal(seen[0].url, "https://dev.khalti.com/api/v2/epayment/initiate/");
  assert.equal(seen[0].auth, "Key test-value");
  assert.equal(seen[0].body.amount, 100000);
  assert.equal(seen[0].body.purchase_order_id, id);
  await assert.rejects(
    khaltiStart(
      { id, amountMinor: 1, title: "", name: "", email: "" },
      reply(401, { detail: "Invalid token." }),
    ),
  );
});

test("Khalti counts only Completed for the full amount as paid", async () => {
  const done = {
    status: "Completed",
    total_amount: 100000,
    transaction_id: "tx9",
  };
  assert.deepEqual(await khaltiStatus("px1", 100000, reply(200, done)), {
    outcome: "SUCCEEDED",
    reference: "tx9",
  });
  assert.equal(
    (
      await khaltiStatus(
        "px1",
        100000,
        reply(200, { ...done, total_amount: 1000 }),
      )
    ).outcome,
    "FAILED",
  );
  assert.equal(
    (await khaltiStatus("px1", 100000, reply(200, { status: "Pending" })))
      .outcome,
    "PENDING",
  );
  assert.equal(
    (await khaltiStatus("px1", 100000, reply(400, { status: "User canceled" })))
      .outcome,
    "FAILED",
  );
  assert.equal(
    (await khaltiStatus("px1", 100000, reply(400, { status: "Expired" })))
      .outcome,
    "FAILED",
  );
  assert.equal(
    (await khaltiStatus("px1", 100000, reply(200, { status: "Refunded" })))
      .outcome,
    "FAILED",
  );
});

test("Fonepay is listed but not yet available; pay later always is", () => {
  assert.equal(methods().find((m) => m.id === "FONEPAY")?.available, false);
  assert.equal(methods().find((m) => m.id === "LATER")?.available, true);
});
