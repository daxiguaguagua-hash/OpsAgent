import { randomUUID } from "node:crypto";

import { ORDER_STATUS } from "@opsagent/db/constants";
import {
  countOrders,
  createOrder,
  listOrders,
} from "@opsagent/db/orders";
import {
  type NewOrder,
  type Order,
} from "@opsagent/db/schema";
import {
  OPS_SERVICE_STATUS,
  type OrderHealthDto,
} from "@opsagent/shared";
import { z } from "zod";

import { CACHE_KEY } from "../cache/constants";
import { getCacheClient } from "../cache/index";
import { ORDER_BUSINESS } from "./constants";

export const createOrderInputSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  totalCents: z.number().int().positive(),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export interface OrderService {
  checkHealth(): Promise<OrderHealthDto>;
  create(input: CreateOrderInput): Promise<Order>;
  list(): Promise<Order[]>;
}

export const orderService: OrderService = {
  async checkHealth() {
    const cache = await getCacheClient();
    await cache.set(
      CACHE_KEY.ORDER_HEALTH,
      new Date().toISOString(),
      { EX: ORDER_BUSINESS.CACHE_TTL_SECONDS },
    );

    return {
      status: OPS_SERVICE_STATUS.OK,
      services: {
        database: OPS_SERVICE_STATUS.CONNECTED,
        cache: OPS_SERVICE_STATUS.CONNECTED,
      },
      orderCount: await countOrders(),
    };
  },

  async create(input) {
    const values: NewOrder = {
      reference: `${ORDER_BUSINESS.REFERENCE_PREFIX}-${randomUUID()}`,
      customerName: input.customerName,
      status: ORDER_STATUS.PENDING,
      totalCents: input.totalCents,
    };
    return createOrder(values);
  },

  list() {
    return listOrders(ORDER_BUSINESS.LIST_LIMIT);
  },
};
