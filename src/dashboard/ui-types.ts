import type { Failure } from "../shared/types.js";
import type { ApplicationImportSummary, DashboardRequest, DashboardState, ResumeSummary } from "./models.js";
export type DashboardPage = "applications" | "experiments" | "discovery";
export type DashboardReply = { ok: true; data?: DashboardState; resumes?: ResumeSummary[]; notice?: string; scope?: string; importSummary?: ApplicationImportSummary } | Failure;
export type Act = (request: DashboardRequest) => Promise<DashboardReply>;
export type Analyze = (jobId: string, choice: { experimentId?: string; resumeId?: string }, title: string) => void;
