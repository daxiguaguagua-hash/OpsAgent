import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import {
  DATABASE_TABLE,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
} from "../constants.js";

export const orders = pgTable(DATABASE_TABLE.ORDERS, {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  customerName: text("customer_name").notNull(),
  status: text("status", { enum: ORDER_STATUS_VALUES })
    .notNull()
    .default(ORDER_STATUS.PENDING),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
