export interface VerificationRunView {
  id: string;
  name: string;
  status: "pending" | "running" | "passed" | "failed" | "cancelled";
  finishedAt?: string;
  steps?: string[];
}

export function asRuns(value: unknown): VerificationRunView[] {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { runs?: unknown }).runs)
      ? (value as { runs: unknown[] }).runs
      : [];

  return values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const status = record.status;
    const id = typeof record.id === "string" ? record.id : record.runId;
    if (
      typeof id !== "string"
      || (
        status !== "pending"
        && status !== "passed"
        && status !== "failed"
        && status !== "running"
        && status !== "cancelled"
      )
    ) return [];

    const steps = Array.isArray(record.steps)
      ? record.steps.filter((step): step is string => typeof step === "string")
      : undefined;
    const base: VerificationRunView = {
      id,
      name: typeof record.name === "string" ? record.name : "Verification run",
      status,
      ...(steps === undefined ? {} : { steps }),
    };
    return typeof record.finishedAt === "string"
      ? [{ ...base, finishedAt: record.finishedAt }]
      : [base];
  });
}
