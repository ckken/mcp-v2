import { z } from "zod";
import { timestampSchema } from "./status.ts";

export const orderStatusSchema = z.enum(["draft", "confirmed", "processing", "shipped", "cancelled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderLineSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
}).strict();
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderSchema = z.object({
  id: z.string().min(1),
  status: orderStatusSchema,
  currency: z.string().length(3).toUpperCase(),
  lines: z.array(orderLineSchema).min(1),
  total: z.number().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
export type Order = z.infer<typeof orderSchema>;

export const orderQuerySchema = z.object({
  orderId: z.string().min(1).optional(),
  status: orderStatusSchema.optional(),
}).strict().refine((query) => query.orderId !== undefined || query.status !== undefined, {
  message: "Provide orderId or status.",
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const orderListResponseSchema = z.object({ orders: z.array(orderSchema) }).strict();
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
