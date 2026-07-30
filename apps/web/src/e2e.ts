export type E2eGroup = "Protocol" | "Discovery" | "Tools" | "Skills" | "Verification" | "MCP Apps";

export interface E2eCaseView {
  id: string;
  group: E2eGroup;
  title: string;
  status: "passed" | "failed";
  durationMs: number;
  detail: string;
  evidence: string[];
}

export interface E2eReportView {
  runId: string;
  status: "passed" | "failed";
  startedAt: string;
  finishedAt: string;
  protocolVersion: string;
  total: number;
  passed: number;
  failed: number;
  cases: E2eCaseView[];
}

const groups = new Set<E2eGroup>(["Protocol", "Discovery", "Tools", "Skills", "Verification", "MCP Apps"]);

export function asE2eReport(value: unknown): E2eReportView | null {
  const candidate = value && typeof value === "object" && "report" in value
    ? (value as { report?: unknown }).report
    : value;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.runId !== "string"
    || (record.status !== "passed" && record.status !== "failed")
    || typeof record.startedAt !== "string"
    || typeof record.finishedAt !== "string"
    || typeof record.protocolVersion !== "string"
    || typeof record.total !== "number"
    || typeof record.passed !== "number"
    || typeof record.failed !== "number"
    || !Array.isArray(record.cases)
  ) return null;

  const cases = record.cases.flatMap((item): E2eCaseView[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.id !== "string"
      || typeof entry.group !== "string"
      || !groups.has(entry.group as E2eGroup)
      || typeof entry.title !== "string"
      || (entry.status !== "passed" && entry.status !== "failed")
      || typeof entry.durationMs !== "number"
      || typeof entry.detail !== "string"
      || !Array.isArray(entry.evidence)
      || !entry.evidence.every((value) => typeof value === "string")
    ) return [];
    return [{
      id: entry.id,
      group: entry.group as E2eGroup,
      title: entry.title,
      status: entry.status,
      durationMs: entry.durationMs,
      detail: entry.detail,
      evidence: entry.evidence as string[],
    }];
  });
  if (cases.length !== record.cases.length || cases.length !== record.total) return null;

  return {
    runId: record.runId,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    protocolVersion: record.protocolVersion,
    total: record.total,
    passed: record.passed,
    failed: record.failed,
    cases,
  };
}
