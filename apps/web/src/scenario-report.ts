export type ScenarioId = "loop" | "protocol" | "tools" | "skills" | "mcp-apps" | "codex";

export interface ScenarioStepView {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  detail: string;
  evidence: string[];
}

export interface ScenarioReportView {
  runId: string;
  scenarioId: ScenarioId;
  status: "passed" | "failed";
  startedAt: string;
  finishedAt: string;
  steps: ScenarioStepView[];
}

const scenarioIds = new Set<ScenarioId>(["loop", "protocol", "tools", "skills", "mcp-apps", "codex"]);

export function asScenarioReport(value: unknown): ScenarioReportView | null {
  const candidate = value && typeof value === "object" && "report" in value
    ? (value as { report?: unknown }).report
    : value;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.runId !== "string"
    || typeof record.scenarioId !== "string"
    || !scenarioIds.has(record.scenarioId as ScenarioId)
    || (record.status !== "passed" && record.status !== "failed")
    || typeof record.startedAt !== "string"
    || typeof record.finishedAt !== "string"
    || !Array.isArray(record.steps)
  ) return null;

  const steps = record.steps.flatMap((item): ScenarioStepView[] => {
    if (!item || typeof item !== "object") return [];
    const step = item as Record<string, unknown>;
    if (
      typeof step.id !== "string"
      || typeof step.title !== "string"
      || (step.status !== "passed" && step.status !== "failed" && step.status !== "skipped")
      || typeof step.durationMs !== "number"
      || typeof step.detail !== "string"
      || !Array.isArray(step.evidence)
      || !step.evidence.every((evidence) => typeof evidence === "string")
    ) return [];
    return [{
      id: step.id,
      title: step.title,
      status: step.status,
      durationMs: step.durationMs,
      detail: step.detail,
      evidence: step.evidence as string[],
    }];
  });
  if (steps.length !== record.steps.length || steps.length === 0) return null;

  return {
    runId: record.runId,
    scenarioId: record.scenarioId as ScenarioId,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    steps,
  };
}
