import { z } from "zod";
import { serviceStatusSchema, timestampSchema } from "./status.ts";

export const MODERN_PROTOCOL_VERSION = "2026-07-28" as const;

export const protocolSupportSchema = z.object({
  version: z.literal(MODERN_PROTOCOL_VERSION),
  modernOnly: z.literal(true),
  legacy: z.literal("reject"),
  transport: z.literal("json-http"),
  sse: z.literal(false),
}).strict();
export type ProtocolSupport = z.infer<typeof protocolSupportSchema>;

export const capabilityKeySchema = z.enum([
  "tools", "resources", "prompts", "skills", "apps", "tasks", "auth", "verification",
]);
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;

export const capabilityMatrixSchema = z.object({
  tools: z.boolean(),
  resources: z.boolean(),
  prompts: z.boolean(),
  skills: z.boolean(),
  apps: z.boolean(),
  tasks: z.boolean(),
  auth: z.boolean(),
  verification: z.boolean(),
}).strict();
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

export const serviceHealthSchema = z.object({
  status: serviceStatusSchema,
  protocol: protocolSupportSchema,
  capabilities: capabilityMatrixSchema,
  checkedAt: timestampSchema,
}).strict();
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
