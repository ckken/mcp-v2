import { z } from "zod";
import { apiErrorSchema } from "./status.ts";

export const mcpAppBridgeReadySchema = z.object({ type: z.literal("mcp-app/ready") }).strict();
export type McpAppBridgeReady = z.infer<typeof mcpAppBridgeReadySchema>;

export const mcpAppBridgeContextSchema = z.object({
  type: z.literal("mcp-app/context"),
  appId: z.string().min(1),
  locale: z.string().min(1),
}).strict();
export type McpAppBridgeContext = z.infer<typeof mcpAppBridgeContextSchema>;

export const mcpAppBridgeToolCallSchema = z.object({
  type: z.literal("mcp-app/tool-call"),
  requestId: z.string().uuid(),
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
}).strict();
export type McpAppBridgeToolCall = z.infer<typeof mcpAppBridgeToolCallSchema>;

export const mcpAppBridgeToolResultSchema = z.object({
  type: z.literal("mcp-app/tool-result"),
  requestId: z.string().uuid(),
  result: z.unknown(),
}).strict();
export type McpAppBridgeToolResult = z.infer<typeof mcpAppBridgeToolResultSchema>;

export const mcpAppBridgeErrorSchema = z.object({
  type: z.literal("mcp-app/error"),
  requestId: z.string().uuid().optional(),
  error: apiErrorSchema,
}).strict();
export type McpAppBridgeError = z.infer<typeof mcpAppBridgeErrorSchema>;

export const mcpAppBridgeMessageSchema = z.discriminatedUnion("type", [
  mcpAppBridgeReadySchema,
  mcpAppBridgeContextSchema,
  mcpAppBridgeToolCallSchema,
  mcpAppBridgeToolResultSchema,
  mcpAppBridgeErrorSchema,
]);
export type McpAppBridgeMessage = z.infer<typeof mcpAppBridgeMessageSchema>;
