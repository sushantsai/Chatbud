// Talks to the payment providers. Chatbud never trusts what the browser says
// about a payment: after the client returns, the server asks the provider
// itself whether the money arrived, and only then marks a booking paid.
import { createHmac } from "node:crypto";

export type Outcome = {
  outcome: "SUCCEEDED" | "FAILED" | "PENDING";
  reference?: string;
};
type Fetch = typeof fetch;
const env = (key: string) => process.env[key]?.trim() || "";

// Khalti: sandbox unless a live key is supplied and marked live.
const khaltiLive = () => env("KHALTI_MODE") === "live";
const khaltiBase = () =>
  khaltiLive() ? "https://khalti.com/api/v2" : "https://dev.khalti.com/api/v2";
// eSewa: its public sandbox merchant is used until live details are supplied.
const esewaLive = () => !!env("ESEWA_PRODUCT_CODE") && !!env("ESEWA_SECRET");
const esewaCode = () => env("ESEWA_PRODUCT_CODE") || "EPAYTEST";
// Published by eSewa for its sandbox; it cannot move real money.
const esewaSecret = () => env("ESEWA_SECRET") || "8gBm/:&EnhH.1/q";

// Where the payment provider sends the client back to.
export const returnUrl = (paymentId: string) =>
  `${env("PUBLIC_WEB_URL") || "https://chatbud-web.vercel.app"}/pay/return/${paymentId}`;

export function methods() {
  return [
    {
      id: "KHALTI",
      label: "Khalti",
      detail: "Wallet, mobile banking, connectIPS or card",
      available: !!env("KHALTI_SECRET_KEY"),
      test: !khaltiLive(),
    },
    {
      id: "ESEWA",
      label: "eSewa",
      detail: "Pay from your eSewa wallet",
      available: true,
      test: !esewaLive(),
    },
    {
      id: "FONEPAY",
      label: "Fonepay QR",
      detail: "Scan with your bank app. Coming soon.",
      available: false,
      test: false,
    },
    {
      id: "LATER",
      label: "Pay later",
      detail: "Pay Chatbud by cash or bank transfer before your session",
      available: true,
      test: false,
    },
  ];
}

// Rupees as eSewa expects them: "1000" or "1000.5", never paisa.
export const rupees = (amountMinor: number) => String(amountMinor / 100);
export const esewaSignature = (
  total: string,
  transaction: string,
  code = esewaCode(),
  secret = esewaSecret(),
) =>
  createHmac("sha256", secret)
    .update(
      `total_amount=${total},transaction_uuid=${transaction},product_code=${code}`,
    )
    .digest("base64");

// The form the browser posts to eSewa.
export function esewaForm(paymentId: string, amountMinor: number) {
  const total = rupees(amountMinor);
  return {
    url: esewaLive()
      ? "https://epay.esewa.com.np/api/epay/main/v2/form"
      : "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
    fields: {
      amount: total,
      tax_amount: "0",
      total_amount: total,
      transaction_uuid: paymentId,
      product_code: esewaCode(),
      product_service_charge: "0",
      product_delivery_charge: "0",
      success_url: returnUrl(paymentId),
      failure_url: returnUrl(paymentId),
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature: esewaSignature(total, paymentId),
    },
  };
}

export async function esewaStatus(
  paymentId: string,
  amountMinor: number,
  request: Fetch = fetch,
): Promise<Outcome> {
  const query = new URLSearchParams({
    product_code: esewaCode(),
    total_amount: rupees(amountMinor),
    transaction_uuid: paymentId,
  });
  const response = await request(
    `${esewaLive() ? "https://esewa.com.np" : "https://rc.esewa.com.np"}/api/epay/transaction/status/?${query}`,
  );
  if (!response.ok)
    throw new Error(`eSewa status check failed: ${response.status}`);
  const body = (await response.json()) as { status?: string; ref_id?: string };
  if (body.status === "COMPLETE" && body.ref_id)
    return { outcome: "SUCCEEDED", reference: body.ref_id };
  // PENDING and AMBIGUOUS may still complete; everything else is final.
  return {
    outcome: ["PENDING", "AMBIGUOUS"].includes(body.status || "")
      ? "PENDING"
      : "FAILED",
  };
}

export async function khaltiStart(
  payment: {
    id: string;
    amountMinor: number;
    title: string;
    name: string;
    email: string;
  },
  request: Fetch = fetch,
) {
  const response = await request(`${khaltiBase()}/epayment/initiate/`, {
    method: "POST",
    headers: {
      authorization: `Key ${env("KHALTI_SECRET_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      return_url: returnUrl(payment.id),
      website_url: env("PUBLIC_WEB_URL") || "https://chatbud-web.vercel.app",
      // Khalti counts in paisa, as Chatbud does.
      amount: payment.amountMinor,
      purchase_order_id: payment.id,
      purchase_order_name: payment.title || "Chatbud consultation",
      customer_info: { name: payment.name, email: payment.email },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    pidx?: string;
    payment_url?: string;
  };
  if (!response.ok || !body.pidx || !body.payment_url)
    throw new Error(`Khalti did not start the payment: ${response.status}`);
  return { reference: body.pidx, url: body.payment_url };
}

export async function khaltiStatus(
  pidx: string,
  amountMinor: number,
  request: Fetch = fetch,
): Promise<Outcome> {
  const response = await request(`${khaltiBase()}/epayment/lookup/`, {
    method: "POST",
    headers: {
      authorization: `Key ${env("KHALTI_SECRET_KEY")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ pidx }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    total_amount?: number;
    transaction_id?: string;
  };
  // Only "Completed" for the full amount counts as paid.
  if (
    body.status === "Completed" &&
    body.total_amount === amountMinor &&
    body.transaction_id
  )
    return { outcome: "SUCCEEDED", reference: body.transaction_id };
  return {
    outcome: ["Pending", "Initiated"].includes(body.status || "")
      ? "PENDING"
      : "FAILED",
  };
}
