import { z } from "zod";

export const serviceStatusSchema = z.enum(["healthy", "degraded", "unavailable"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const runStatusSchema = z.enum(["pending", "running", "passed", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const stepStatusSchema = z.enum(["pending", "running", "passed", "failed", "skipped"]);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const timestampSchema = z.string().datetime({ offset: true });

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ApiError = z.infer<typeof apiErrorSchema>;
