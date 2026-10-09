import { z } from "zod";

export const applicationStatuses = ["saved", "applied", "interview", "offer", "rejected", "withdrawn"] as const;
export const statusLabels: Record<ApplicationStatus, string> = { saved: "Kaydedildi", applied: "Başvuruldu", interview: "Görüşme", offer: "Teklif", rejected: "Olumsuz", withdrawn: "Geri çekildi" };
export type ApplicationStatus = typeof applicationStatuses[number];
const timestamp = z.number().finite().nonnegative();
const jobId = z.string().regex(/^\d{1,16}$/);
const text = z.string().max(4000);
export const eventSchema = z.object({ id: z.string().max(200), text, at: z.string().max(100), viewed: z.boolean(), source: z.enum(["api", "manual"]) }).strict();
export const applicationSchema = z.object({
  jobId, title: text, companyName: text, jobUrl: z.string().max(2000), createdAt: timestamp,
  status: z.enum(applicationStatuses), statusManual: z.boolean(), appliedAt: z.string().max(100), notes: text,
  followUpAt: z.string().max(30), variantId: z.string().max(100), responded: z.boolean(),
  interviewed: z.boolean(), offered: z.boolean(), manualEvents: z.array(eventSchema.extend({ source: z.literal("manual") })).max(100),
  api: z.object({ applied: z.boolean().nullable(), appliedAt: z.string().max(100), cvId: z.string().max(512), cvName: text,
    events: z.array(eventSchema.extend({ source: z.literal("api") })).max(100), fetchedAt: timestamp.nullable(), error: text }).strict(),
}).strict();
export type TrackedApplication = z.infer<typeof applicationSchema>;
export const variantSchema = z.object({ id: z.string().max(100), label: z.enum(["A", "B"]), resumeId: z.string().max(512), name: text,
  content: z.record(z.string(), z.unknown()), fetchedAt: timestamp, truncated: z.boolean() }).strict();
export type CvVariantSnapshot = z.infer<typeof variantSchema>;
export const experimentSchema = z.object({ id: z.string().max(100), name: z.string().trim().min(1).max(100), createdAt: timestamp,
  variants: z.tuple([variantSchema, variantSchema]) }).strict();
export type CvExperiment = z.infer<typeof experimentSchema>;
export const preferencesSchema = z.object({ keyword: z.string().trim().max(200), cities: z.array(z.string().max(30)).max(10),
  workModels: z.array(z.string().max(30)).max(3), resumeId: z.string().max(512) }).strict();
export type JobDiscoveryPreferences = z.infer<typeof preferencesSchema>;
const optionSchema = z.object({ id: z.string().max(30), name: z.string().max(200) }).strict();
export const discoveryJobSchema = z.object({ id: jobId, title: text, companyName: text, jobUrl: z.string().max(2000), location: text,
  workModel: text, publishedAt: z.string().max(100), firstSeenAt: timestamp }).strict();
export type DiscoveryJob = z.infer<typeof discoveryJobSchema>;
export const dashboardSchema = z.object({ version: z.literal(1), applications: z.array(applicationSchema).max(500),
  experiments: z.array(experimentSchema).max(20), preferences: preferencesSchema,
  discovery: z.object({ jobs: z.array(discoveryJobSchema).max(50), seen: z.record(z.string(), timestamp),
    fetchedAt: timestamp.nullable(), currentPage: z.number().int().positive(), total: z.number().nonnegative(),
    options: z.object({ cities: z.array(optionSchema).max(200), workModels: z.array(optionSchema).max(20) }).strict() }).strict(),
}).strict();
export type DashboardState = z.infer<typeof dashboardSchema>;
export interface ApplicationImportSummary { added: number; updated: number; total: number; page: number; nextPage: number | null; jobIds: string[]; detailErrors: number; warning: string }
export interface ResumeSummary { id: string; name: string; updatedAt: string }
export const emptyDashboard = (): DashboardState => ({ version: 1, applications: [], experiments: [],
  preferences: { keyword: "", cities: [], workModels: [], resumeId: "" },
  discovery: { jobs: [], seen: {}, fetchedAt: null, currentPage: 1, total: 0, options: { cities: [], workModels: [] } } });
const dateInput = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/);
export const applicationPatchSchema = z.object({ status: z.enum(applicationStatuses), appliedAt: dateInput, notes: text,
  followUpAt: dateInput, variantId: z.string().max(100), responded: z.boolean(),
  manualEvents: z.array(eventSchema.extend({ source: z.literal("manual") })).max(100) }).strict();
export const dashboardMessageSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get") }).strict(),
  z.object({ action: z.literal("track"), jobId }).strict(),
  z.object({ action: z.literal("update"), jobId, patch: applicationPatchSchema }).strict(),
  z.object({ action: z.literal("remove"), jobId }).strict(),
  z.object({ action: z.literal("refresh") }).strict(),
  z.object({ action: z.literal("importApplications"), page: z.number().int().min(1).max(1000).default(1), seenJobIds: z.array(jobId).max(500).default([]) }).strict(),
  z.object({ action: z.literal("resumes") }).strict(),
  z.object({ action: z.literal("createExperiment"), name: z.string().trim().min(1).max(100), resumeA: z.string().min(1).max(512), resumeB: z.string().min(1).max(512) }).strict(),
  z.object({ action: z.literal("search"), preferences: preferencesSchema, page: z.number().int().min(1).max(1000) }).strict(),
]);
export const analysisMessageSchema = z.object({ scope: z.string().regex(/^[a-f0-9]{64}$/), jobId, experimentId: z.string().max(100).optional(), resumeId: z.string().max(512).optional() }).strict()
  .refine(v => Boolean(v.experimentId) !== Boolean(v.resumeId));
export type DashboardRequest = z.infer<typeof dashboardMessageSchema>;
