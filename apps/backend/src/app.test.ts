import assert from "node:assert/strict";
import test from "node:test";

import type { Order } from "@opsagent/db/schema";
import {
  OPS_API_ROUTE,
  OPS_HTTP_METHOD,
  OPS_SERVICE_STATUS,
  type OrderHealthDto,
} from "@opsagent/shared";

import { createApp } from "./app";
import type {
  CreateOrderInput,
  OrderService,
} from "./business/orders";
import {
  API_ERROR_CODE,
  HTTP_STATUS,
} from "./http/constants";
import { DEMO_BUSINESS } from "./business/constants";
import type { DemoService } from "./business/demo";

const FIXTURE_ORDER: Order = {
  id: 1,
  reference: "order-test",
  customerName: "Test Customer",
  status: "pending",
  totalCents: 2500,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const FIXTURE_HEALTH: OrderHealthDto = {
  status: OPS_SERVICE_STATUS.OK,
  services: {
    database: OPS_SERVICE_STATUS.CONNECTED,
    cache: OPS_SERVICE_STATUS.CONNECTED,
  },
  orderCount: 1,
};

function createFakeOrderService(): OrderService {
  const storedOrders = [FIXTURE_ORDER];

  return {
    async checkHealth() {
      return FIXTURE_HEALTH;
    },
    async create(input: CreateOrderInput) {
      const order = {
        ...FIXTURE_ORDER,
        id: storedOrders.length + 1,
        customerName: input.customerName,
        totalCents: input.totalCents,
      };
      storedOrders.push(order);
      return order;
    },
    async list() {
      return storedOrders;
    },
  };
}

test("order health exposes database and cache status", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.ORDER_HEALTH,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), FIXTURE_HEALTH);
});

test("orders can be created and listed", async () => {
  const app = createApp(createFakeOrderService());
  const createResponse = await app.request(OPS_API_ROUTE.ORDERS, {
    method: OPS_HTTP_METHOD.POST,
    body: JSON.stringify({
      customerName: "Vincent",
      totalCents: 9900,
    }),
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(createResponse.status, HTTP_STATUS.CREATED);

  const listResponse = await app.request(OPS_API_ROUTE.ORDERS);
  const body = await listResponse.json() as { orders: Order[] };
  assert.equal(body.orders.length, 2);
  assert.equal(body.orders[1]?.customerName, "Vincent");
});

test("invalid order input returns a stable error code", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.ORDERS,
    {
      method: OPS_HTTP_METHOD.POST,
      body: JSON.stringify({
        customerName: "",
        totalCents: 0,
      }),
      headers: {
        "content-type": "application/json",
      },
    },
  );
  const body = await response.json() as {
    error: { code: string };
  };

  assert.equal(response.status, HTTP_STATUS.BAD_REQUEST);
  assert.equal(body.error.code, API_ERROR_CODE.INVALID_ORDER_INPUT);
});

test("controlled backend failure returns a stable 500 response", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.DEMO_FAIL_500,
    {
      method: OPS_HTTP_METHOD.POST,
    },
  );
  const body = await response.json() as {
    error: {
      code: string;
      message: string;
      stack?: string;
    };
  };

  assert.equal(response.status, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  assert.equal(body.error.code, API_ERROR_CODE.DEMO_FORCED_FAILURE);
  assert.equal(body.error.stack, undefined);
});

test("slow endpoint delegates the configured delay", async () => {
  let requestedDelay = 0;
  const fakeDemoService: DemoService = {
    async delay(milliseconds) {
      requestedDelay = milliseconds;
    },
  };
  const response = await createApp(
    createFakeOrderService(),
    fakeDemoService,
  ).request(OPS_API_ROUTE.DEMO_SLOW);
  const body = await response.json() as {
    status: string;
    configuredDelayMs: number;
    thresholdMs: number;
  };

  assert.equal(response.status, 200);
  assert.equal(requestedDelay, DEMO_BUSINESS.SLOW_DELAY_MS);
  assert.equal(body.status, OPS_SERVICE_STATUS.COMPLETED);
  assert.equal(body.configuredDelayMs, DEMO_BUSINESS.SLOW_DELAY_MS);
  assert.equal(body.thresholdMs, DEMO_BUSINESS.SLOW_THRESHOLD_MS);
});
