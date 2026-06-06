import { count, desc } from "drizzle-orm";

import { db } from "./index.js";
import {
  type NewOrder,
  type Order,
  orders,
} from "./schema/index.js";

export async function countOrders(): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(orders);
  return result?.value ?? 0;
}

export async function createOrder(values: NewOrder): Promise<Order> {
  const [createdOrder] = await db.insert(orders).values(values).returning();

  if (!createdOrder) {
    throw new Error("Order creation returned no record.");
  }

  return createdOrder;
}

export function listOrders(limit: number): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
