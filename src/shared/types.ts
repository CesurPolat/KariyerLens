export type Provider = "openai" | "openrouter" | "cesurpolat";

export interface ProviderSettings {
  apiKey?: string;
  model?: string;
}

export interface ChatSettings {
  provider?: string;
  providers?: Partial<Record<Provider, ProviderSettings>>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Job {
  id: string;
  title: string;
  jobUrl?: string;
  companyName?: string;
  companyUrl?: string;
  logoUrl?: string;
  location?: string;
  employmentType?: string;
  workModel?: string;
  position?: string;
  sector: string[];
  workAreas: string[];
  publishedAt?: string;
  jobDateText?: string;
  lastModifiedAt?: string;
  jobDateStatus?: string;
  closingDate?: string;
  updateCount?: string;
  applicationReviewText?: string;
  qualifications?: string;
  applicationCount?: string;
  experience?: string;
  education: string[];
  languages: string[];
  isActive: boolean;
  isEasyApply: boolean;
}

export interface Failure {
  ok: false;
  code: string;
  message: string;
  status?: number;
}

export interface JobSuccess {
  ok: true;
  data: Job;
  fetchedAt: number;
  cached?: boolean;
}

export interface JobVisitMeasurement { timestamp: number; count: number }
export interface JobVisitHistory {
  measurements: JobVisitMeasurement[];
  status: "saved" | "unchanged" | "unavailable" | "invalid-count";
}
export type JobVisitResult = (JobSuccess & { history: JobVisitHistory }) | Failure;
export type JobResult = JobSuccess | Failure;
export type ChatResult = { ok: true; reply: string } | Failure;
export type ChatProgress = { type: "status"; text: string } | { type: "text"; content: string };
export type ChatStreamEvent = ChatProgress | { type: "done"; result: ChatResult };

export interface ExtensionMessage {
  type: "GET_JOB_VISIT" | "GET_JOB" | "CHAT_JOB" | "OPEN_OPTIONS" | "GET_MEMORY_STATUS" | "SET_MEMORY_ENABLED" | "CLEAR_MEMORY" | "REFRESH_CV_MEMORY" | "GET_CHAT_SIZE" | "SET_CHAT_SIZE";
  jobId?: unknown;
  messages?: unknown;
  enabled?: unknown;
  size?: unknown;
}

export interface CompanyProfile {
  followers: string | null;
  openJobs: number | null;
  jobsUrl: string | null;
}
export interface CompanyStats extends CompanyProfile {
  companyName: string | null;
  profileUrl: string | null;
}
export type CompanyStatsResult = { ok: true; data: CompanyStats } | Failure;
