import { z } from "zod";

export const skillComponentSchema = z.enum(["resource", "prompt", "tool", "workflow"]);
export type SkillComponent = z.infer<typeof skillComponentSchema>;

export const skillInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
}).strict();
export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  components: z.array(skillComponentSchema).min(1),
  inputRequired: z.boolean(),
  inputs: z.array(skillInputSchema),
}).strict().superRefine((skill, context) => {
  if (skill.inputRequired !== skill.inputs.some((input) => input.required)) {
    context.addIssue({ code: "custom", message: "inputRequired must match required inputs.", path: ["inputRequired"] });
  }
});
export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const skillExecutionStatusSchema = z.enum(["completed", "input_required", "rejected", "failed"]);
export type SkillExecutionStatus = z.infer<typeof skillExecutionStatusSchema>;

export const skillExecuteRequestSchema = z.object({
  skillId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
  confirmation: z.boolean().optional(),
}).strict();
export type SkillExecuteRequest = z.infer<typeof skillExecuteRequestSchema>;

export const skillExecuteResponseSchema = z.object({
  status: skillExecutionStatusSchema,
  auditId: z.string().min(1),
  message: z.string().min(1),
  requiredInputs: z.array(z.string().min(1)).optional(),
}).strict();
export type SkillExecuteResponse = z.infer<typeof skillExecuteResponseSchema>;
