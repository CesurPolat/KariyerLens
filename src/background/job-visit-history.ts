import type { JobVisitHistory, JobVisitMeasurement } from "../shared/types.js";
import { parseExactApplicationCount } from "../shared/application-count.js";

export const JOB_VISIT_STORAGE_KEY = "jobVisitHistory";
const MAX_VISITS = 200;
const MAX_JOBS = 200;
type Histories = Record<string, JobVisitMeasurement[]>;
let writes: Promise<unknown> = Promise.resolve();

function readHistories(value: unknown): Histories {
  const histories: Histories = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return histories;
  for (const [id, points] of Object.entries(value)) {
    if (!/^\d{1,16}$/.test(id) || !Array.isArray(points)) continue;
    histories[id] = points.filter((point): point is JobVisitMeasurement =>
      !!point && typeof point === "object" && Number.isFinite(point.timestamp) && point.timestamp > 0 &&
      Number.isSafeInteger(point.count) && point.count >= 0
    ).map(({ timestamp, count }) => ({ timestamp, count })).sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_VISITS);
  }
  return histories;
}

/** Serializes read/modify/write across all jobs so tabs cannot overwrite one another. */
export function recordJobVisit(jobId: string, applicationCount: string | undefined, timestamp: number): Promise<JobVisitHistory> {
  const operation = writes.then(async (): Promise<JobVisitHistory> => {
    let measurements: JobVisitMeasurement[] = [];
    try {
      const stored = await chrome.storage.local.get(JOB_VISIT_STORAGE_KEY);
      const histories = readHistories(stored[JOB_VISIT_STORAGE_KEY]);
      measurements = histories[jobId] || [];
      const count = parseExactApplicationCount(applicationCount);
      if (count === null) return { measurements, status: "invalid-count" };
      if (measurements.at(-1)?.count === count) return { measurements, status: "unchanged" };
      const next = [...measurements, { timestamp, count }].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_VISITS);
      histories[jobId] = next;
      const recent = Object.entries(histories).sort((a, b) =>
        (b[1].at(-1)?.timestamp || 0) - (a[1].at(-1)?.timestamp || 0)
      ).slice(0, MAX_JOBS);
      await chrome.storage.local.set({ [JOB_VISIT_STORAGE_KEY]: Object.fromEntries(recent) });
      return { measurements: next, status: "saved" };
    } catch {
      return { measurements, status: "unavailable" };
    }
  });
  writes = operation.catch(() => {});
  return operation;
}
