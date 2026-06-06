import { randomUUID } from "node:crypto";

import dotenv from "dotenv";

dotenv.config({
  path: "../../apps/backend/.env",
});

const { eq } = await import("drizzle-orm");
const { DATABASE_VERIFICATION, ORDER_STATUS } = await import("./constants.js");
const { db } = await import("./index.js");
const { orders } = await import("./schema/index.js");

const reference = `${DATABASE_VERIFICATION.REFERENCE_PREFIX}-${randomUUID()}`;

const [createdOrder] = await db
  .insert(orders)
  .values({
    reference,
    customerName: DATABASE_VERIFICATION.CUSTOMER_NAME,
    status: ORDER_STATUS.PENDING,
    totalCents: DATABASE_VERIFICATION.TOTAL_CENTS,
  })
  .returning();

if (!createdOrder) {
  throw new Error("Database verification insert returned no order.");
}

try {
  const [storedOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, reference));

  if (storedOrder?.id !== createdOrder.id) {
    throw new Error("Database verification could not read the inserted order.");
  }

  console.log(JSON.stringify({
    success: true,
    orderId: storedOrder.id,
    reference: storedOrder.reference,
    status: storedOrder.status,
  }));
} finally {
  await db.delete(orders).where(eq(orders.reference, reference));
  await db.$client.end();
}
