import { z } from "zod";

export const SCENARIO_IDS = [
  "loop",
  "protocol",
  "tools",
  "skills",
  "mcp-apps",
  "codex",
] as const;

export const scenarioIdSchema = z.enum(SCENARIO_IDS);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;

export const scenarioTriggerSchema = z.enum(["ui", "api", "mcp-client", "codex"]);
export type ScenarioTrigger = z.infer<typeof scenarioTriggerSchema>;

export const scenarioProtocolModeSchema = z.enum(["auto", "modern", "legacy"]);
export type ScenarioProtocolMode = z.infer<typeof scenarioProtocolModeSchema>;

export const scenarioEntryValueSchema = z.union([
  z.string().max(256),
  z.number().finite(),
  z.boolean(),
]);
export type ScenarioEntryValue = z.infer<typeof scenarioEntryValueSchema>;

const scenarioParametersSchema = z.record(
  z.string().regex(/^[a-z][a-zA-Z0-9]{0,47}$/),
  scenarioEntryValueSchema,
).superRefine((value, context) => {
  if (Object.keys(value).length > 16) {
    context.addIssue({
      code: "custom",
      message: "A scenario entry may contain at most 16 parameters.",
    });
  }
});

export const scenarioEntryRequestSchema = z.object({
  trigger: scenarioTriggerSchema.default("ui"),
  protocolMode: scenarioProtocolModeSchema.default("auto"),
  selection: z.string().max(128).optional(),
  parameters: scenarioParametersSchema.default({}),
});
export type ScenarioEntryRequest = z.infer<typeof scenarioEntryRequestSchema>;

export const scenarioEntryOptionSchema = z.object({
  value: scenarioEntryValueSchema,
  label: z.string().min(1).max(96),
});
export type ScenarioEntryOption = z.infer<typeof scenarioEntryOptionSchema>;

export const scenarioEntryFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,47}$/),
  label: z.string().min(1).max(96),
  description: z.string().min(1).max(240),
  control: z.enum(["select", "text", "boolean"]),
  binding: z.enum(["protocolMode", "selection", "parameter"]),
  required: z.boolean(),
  defaultValue: scenarioEntryValueSchema.optional(),
  options: z.array(scenarioEntryOptionSchema).max(64).optional(),
  source: z.enum(["server/discover", "tools/list", "prompts/list", "resources/list", "application"]),
});
export type ScenarioEntryField = z.infer<typeof scenarioEntryFieldSchema>;

export const scenarioDiscoverySnapshotSchema = z.object({
  protocolVersions: z.array(z.string()).max(16),
  tools: z.array(z.string()).max(128),
  prompts: z.array(z.string()).max(128),
  resources: z.array(z.string()).max(128),
  extensions: z.array(z.string()).max(32),
});
export type ScenarioDiscoverySnapshot = z.infer<typeof scenarioDiscoverySnapshotSchema>;

export const scenarioCacheHintSchema = z.object({
  ttlMs: z.number().int().nonnegative(),
  cacheScope: z.enum(["public", "private"]),
});
export type ScenarioCacheHint = z.infer<typeof scenarioCacheHintSchema>;

export const scenarioEntryDefinitionSchema = z.object({
  scenarioId: scenarioIdSchema,
  fields: z.array(scenarioEntryFieldSchema).max(16),
  supportedTriggers: z.array(scenarioTriggerSchema).min(1),
  discovery: scenarioDiscoverySnapshotSchema,
  cache: z.object({
    discover: scenarioCacheHintSchema,
    tools: scenarioCacheHintSchema,
  }),
});
export type ScenarioEntryDefinition = z.infer<typeof scenarioEntryDefinitionSchema>;

export const scenarioGateSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(96),
  status: z.enum(["passed", "failed"]),
  detail: z.string().min(1).max(240),
});
export type ScenarioGate = z.infer<typeof scenarioGateSchema>;

export const scenarioEntrySnapshotSchema = z.object({
  trigger: scenarioTriggerSchema,
  protocolMode: scenarioProtocolModeSchema,
  selection: z.string().max(128).optional(),
  parameters: scenarioParametersSchema,
  traceparent: z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/),
  discovery: scenarioDiscoverySnapshotSchema,
  cache: z.object({
    discover: scenarioCacheHintSchema,
    tools: scenarioCacheHintSchema,
  }),
  gates: z.array(scenarioGateSchema).min(1).max(12),
});
export type ScenarioEntrySnapshot = z.infer<typeof scenarioEntrySnapshotSchema>;

export const scenarioStepResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number().nonnegative(),
  detail: z.string().min(1),
  evidence: z.array(z.string()),
});
export type ScenarioStepResult = z.infer<typeof scenarioStepResultSchema>;

export const scenarioReportSchema = z.object({
  runId: z.string().min(1),
  scenarioId: scenarioIdSchema,
  status: z.enum(["passed", "failed"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  entry: scenarioEntrySnapshotSchema,
  route: z.array(z.string().min(1)).min(1),
  steps: z.array(scenarioStepResultSchema).min(1),
}).superRefine((report, context) => {
  if (
    report.route.length !== report.steps.length
    || report.route.some((id, index) => id !== report.steps[index]?.id)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scenario route must exactly match the ordered step ids.",
      path: ["route"],
    });
  }
});
export type ScenarioReport = z.infer<typeof scenarioReportSchema>;
