import assert from "node:assert/strict";
import test from "node:test";

import {
  OPS_API_ROUTE,
  OPS_HTTP_METHOD,
} from "@opsagent/shared";

import {
  createOrder,
  OpsApiError,
  triggerBackendFailure,
} from "./opsApi";

const TEST_SERVER_URL = "http://opsagent.test";

test("createOrder uses the shared order route and POST method", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = init?.method ?? "";
    return Response.json({
      order: {
        id: 1,
        reference: "order-test",
        customerName: "Ops Demo",
        status: "pending",
        totalCents: 9900,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  };

  await createOrder(
    TEST_SERVER_URL,
    {
      customerName: "Ops Demo",
      totalCents: 9900,
    },
    fetcher,
  );

  assert.equal(requestedUrl, `${TEST_SERVER_URL}${OPS_API_ROUTE.ORDERS}`);
  assert.equal(requestedMethod, OPS_HTTP_METHOD.POST);
});

test("failed responses become OpsApiError with the backend error code", async () => {
  const fetcher: typeof fetch = async () => Response.json(
    {
      error: {
        code: "DEMO_FORCED_FAILURE",
        message: "Controlled failure",
      },
    },
    { status: 500 },
  );

  await assert.rejects(
    triggerBackendFailure(TEST_SERVER_URL, fetcher),
    (error: unknown) => {
      assert.ok(error instanceof OpsApiError);
      assert.equal(error.status, 500);
      assert.equal(error.code, "DEMO_FORCED_FAILURE");
      return true;
    },
  );
});
