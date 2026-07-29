import { z } from "zod";
import { runStatusSchema, stepStatusSchema, timestampSchema } from "./status.ts";

export const verificationStepNameSchema = z.enum([
  "health_check",
  "skill_discovery",
  "order_query",
  "skill_execution",
  "human_confirmation",
]);
export type VerificationStepName = z.infer<typeof verificationStepNameSchema>;

export const verificationEvidenceSchema = z.object({
  client: z.string().min(1),
  protocolVersion: z.literal("2026-07-28"),
  tool: z.string().min(1),
  requestId: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  durationMs: z.number().int().nonnegative(),
  confirmed: z.boolean(),
}).strict();
export type VerificationEvidence = z.infer<typeof verificationEvidenceSchema>;

export const verificationStepSchema = z.object({
  name: verificationStepNameSchema,
  status: stepStatusSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  evidence: verificationEvidenceSchema.optional(),
  errorCode: z.string().min(1).optional(),
}).strict().superRefine((step, context) => {
  if (step.status === "passed" && !step.evidence) {
    context.addIssue({ code: "custom", message: "Passed steps require sanitized evidence.", path: ["evidence"] });
  }
  if (step.status === "failed" && !step.errorCode) {
    context.addIssue({ code: "custom", message: "Failed steps require an error code.", path: ["errorCode"] });
  }
});
export type VerificationStep = z.infer<typeof verificationStepSchema>;

export const verificationRunSchema = z.object({
  runId: z.string().uuid(),
  status: runStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  steps: z.array(verificationStepSchema).length(5),
}).strict().superRefine((run, context) => {
  const names = new Set(run.steps.map((step) => step.name));
  if (names.size !== 5) context.addIssue({ code: "custom", message: "Verification step names must be unique.", path: ["steps"] });
  if (run.status === "passed" && run.steps.some((step) => step.status !== "passed")) {
    context.addIssue({ code: "custom", message: "Passed runs require every step to pass.", path: ["steps"] });
  }
});
export type VerificationRun = z.infer<typeof verificationRunSchema>;

export const verificationStartResponseSchema = z.object({ run: verificationRunSchema }).strict();
export type VerificationStartResponse = z.infer<typeof verificationStartResponseSchema>;
