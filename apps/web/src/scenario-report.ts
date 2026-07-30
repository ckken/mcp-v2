import {
  scenarioReportSchema,
  type ScenarioId,
  type ScenarioReport,
  type ScenarioStepResult,
} from "@mcp-v2/shared";

export type ScenarioReportView = ScenarioReport;
export type ScenarioStepView = ScenarioStepResult;
export type { ScenarioId };

export function asScenarioReport(value: unknown): ScenarioReportView | null {
  const candidate = value && typeof value === "object" && "report" in value
    ? (value as { report?: unknown }).report
    : value;
  const parsed = scenarioReportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
