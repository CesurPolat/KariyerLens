import type { Failure } from "../shared/types.js";
import type { ApplicationImportSummary, DashboardRequest, DashboardState, ResumeSummary } from "./models.js";
export type DashboardPage = "applications" | "experiments" | "discovery";
export type DashboardReply = { ok: true; data?: DashboardState; resumes?: ResumeSummary[]; notice?: string; scope?: string; importSummary?: ApplicationImportSummary } | Failure;
export type AutoConnectEvent =
  | { type: "status"; text: string }
  | { type: "connected"; result: Extract<DashboardReply, { ok: true }> }
  | { type: "done"; result: Failure | { ok: true }; notice?: string };
export type Act = (request: DashboardRequest) => Promise<DashboardReply>;
export type Analyze = (jobId: string, choice: { experimentId?: string; resumeId?: string }, title: string) => void;
