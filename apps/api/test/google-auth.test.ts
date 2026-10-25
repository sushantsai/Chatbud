import assert from "node:assert/strict";
import { test } from "node:test";
import { safeAuthReturnPath } from "../../web/app/_lib/oauth";

test("authentication returns only to a safe path on the Chatbud origin", () => {
  for (const path of [
    "/",
    "/pro/profile",
    "/admin/integrations",
    "/professionals?type=dietitian#book",
  ])
    assert.equal(safeAuthReturnPath(path), path);
  for (const path of [
    null,
    "",
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/%2fevil.invalid",
    "/%5cevil.invalid",
    "/%00bad",
    "/%0d%0aevil",
    "/auth/callback?code=used",
    "/%zz",
    "javascript:alert(1)",
  ])
    assert.equal(safeAuthReturnPath(path), "/", String(path));
});
