export type Provider = "openai" | "openrouter";

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

export type JobResult = JobSuccess | Failure;
export type ChatResult = { ok: true; reply: string } | Failure;

export interface ExtensionMessage {
  type: "GET_JOB" | "CHAT_JOB" | "OPEN_OPTIONS";
  jobId?: unknown;
  messages?: unknown;
}
