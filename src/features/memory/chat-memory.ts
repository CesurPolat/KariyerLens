import { z } from "zod";
import type { KariyerToolResult } from "../../shared/kariyer/kariyer-tools.js";

export const MEMORY_STORAGE_KEY = "chatMemory";
export const CV_TTL_MS = 24 * 60 * 60 * 1000;
export const JOB_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const MEMORY_MAX_BYTES = 2 * 1024 * 1024;
const timestamp = z.number().finite().nonnegative();
const snapshot = z.object({
  id: z.string().regex(/^\d{1,16}$/), data: z.record(z.string(), z.unknown()),
  fetchedAt: timestamp, lastViewedAt: timestamp, views: z.number().int().positive(),
});
const resume = z.object({
  scope: z.string().regex(/^[a-f0-9]{64}$/), name: z.enum(["get_resumes", "get_resume"]),
  input: z.record(z.string(), z.unknown()), fetchedAt: timestamp,
  result: z.object({ ok: z.literal(true), data: z.unknown(), truncated: z.boolean(), methodAssumed: z.boolean() }),
});
const schema = z.object({ version: z.literal(1), enabled: z.boolean(), jobs: z.array(snapshot), resumes: z.array(resume) });
type State = z.infer<typeof schema>;
export type MemoryJob = z.infer<typeof snapshot>;
export interface MemoryStatus { enabled: boolean; jobCount: number; cvCount: number; cvFetchedAt: number | null }
let writes: Promise<unknown> = Promise.resolve();
let revision = 0;
const pending = new Map<string, Promise<KariyerToolResult>>();
const empty = (): State => ({ version: 1, enabled: true, jobs: [], resumes: [] });
const bytes = (state: State) => new TextEncoder().encode(JSON.stringify(state)).byteLength;

function prune(state: State): State {
  const now = Date.now();
  state.jobs = state.jobs.filter(j => j.lastViewedAt >= now - JOB_MAX_AGE_MS && j.lastViewedAt <= now)
    .sort((a, b) => b.lastViewedAt - a.lastViewedAt || a.id.localeCompare(b.id)).slice(0, 100);
  state.resumes = state.resumes.filter(r => r.fetchedAt <= now && now - r.fetchedAt < CV_TTL_MS)
    .sort((a, b) => b.fetchedAt - a.fetchedAt);
  while (bytes(state) > MEMORY_MAX_BYTES && state.jobs.length) state.jobs.pop();
  while (bytes(state) > MEMORY_MAX_BYTES && state.resumes.length) state.resumes.pop();
  return state;
}

/** All reads and read/modify/writes share the worker's queue. */
function transact<T>(fn: (state: State) => T): Promise<T> {
  const operation = writes.then(async () => {
    const stored = await chrome.storage.local.get(MEMORY_STORAGE_KEY);
    const raw = stored[MEMORY_STORAGE_KEY];
    const parsed = schema.safeParse(raw);
    const state = prune(parsed.success ? parsed.data : empty());
    const result = fn(state);
    prune(state);
    if (JSON.stringify(raw) !== JSON.stringify(state)) await chrome.storage.local.set({ [MEMORY_STORAGE_KEY]: state });
    return result;
  });
  writes = operation.catch(() => {});
  return operation;
}

export async function hashMemorySession(bearer?: string): Promise<string | null> {
  if (!bearer) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

export function getMemoryStatus(): Promise<MemoryStatus> {
  return transact(s => ({ enabled: s.enabled, jobCount: s.jobs.length,
    cvCount: s.resumes.filter(r => r.name === "get_resume").length,
    cvFetchedAt: s.resumes.length ? Math.max(...s.resumes.map(r => r.fetchedAt)) : null }));
}
export function setMemoryEnabled(enabled: boolean): Promise<void> {
  revision++;
  return transact(s => { s.enabled = enabled; });
}
export function clearMemory(cvOnly = false): Promise<void> {
  revision++;
  return transact(s => { s.resumes = []; if (!cvOnly) s.jobs = []; });
}

export async function rememberJob(data: Record<string, unknown>, fetchedAt: number, increment: boolean, expectedRevision = revision): Promise<void> {
  if (!snapshot.shape.id.safeParse(data.id).success) return;
  await transact(s => {
    if (!s.enabled || revision !== expectedRevision) return;
    const id = data.id as string;
    const old = s.jobs.find(j => j.id === id);
    const next = { id, data: old && old.fetchedAt > fetchedAt ? old.data : data,
      fetchedAt: Math.max(old?.fetchedAt ?? 0, fetchedAt),
      lastViewedAt: increment ? Date.now() : old?.lastViewedAt ?? Date.now(),
      views: (old?.views ?? 0) + (increment ? 1 : 0) };
    if (!next.views) return;
    s.jobs = [...s.jobs.filter(j => j.id !== id), next];
  }).catch(() => {});
}
export function memoryRevision(): number { return revision; }

function list(state: State, order: "recent" | "frequent", limit: number) {
  return [...state.jobs].sort((a, b) => (order === "frequent" ? b.views - a.views : 0)
    || b.lastViewedAt - a.lastViewedAt || a.id.localeCompare(b.id)).slice(0, limit).map(j => ({
      id: j.id, title: j.data.title, companyName: j.data.companyName,
      fetchedAt: j.fetchedAt, lastViewedAt: j.lastViewedAt, views: j.views, historical: true,
    }));
}
export async function listMemoryJobs(order: "recent" | "frequent", limit: number) {
  return transact(s => s.enabled ? { ok: true, data: list(s, order, Math.max(1, Math.min(10, limit))) }
    : { ok: false, code: "MEMORY_DISABLED", message: "Hafıza kapalı." })
    .catch(() => ({ ok: false, code: "MEMORY_UNAVAILABLE", message: "Hafıza okunamadı." }));
}
export async function getMemoryJob(jobId: string) {
  return transact(s => {
    if (!s.enabled) return { ok: false, code: "MEMORY_DISABLED", message: "Hafıza kapalı." };
    const job = s.jobs.find(j => j.id === jobId);
    return job ? { ok: true, data: { ...job, historical: true } }
      : { ok: false, code: "MEMORY_NOT_FOUND", message: "Bu ilan hafızada bulunamadı." };
  }).catch(() => ({ ok: false, code: "MEMORY_UNAVAILABLE", message: "Hafıza okunamadı." }));
}
export async function memoryJobContext(): Promise<string> {
  return transact(s => {
    if (!s.enabled) return "";
    const recent = list(s, "recent", 5), frequent = list(s, "frequent", 5);
    const jobs = [...new Map([...recent, ...frequent].map(j => [j.id, j])).values()];
    return jobs.length ? JSON.stringify(jobs) : "";
  }).catch(() => "");
}

/** Only already-sanitized successful CV tool results are persisted. */
export async function withResumeMemory(name: string, input: Record<string, unknown>, scope: string | null,
  load: () => Promise<KariyerToolResult>, signal?: AbortSignal): Promise<KariyerToolResult> {
  if (!scope || !["get_resumes", "get_resume"].includes(name)) return load();
  const startedRevision = revision;
  const inputKey = JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
  const key = JSON.stringify([startedRevision, scope, name, inputKey]);
  const cached = await transact(s => s.enabled ? s.resumes.find(r =>
    r.scope === scope && r.name === name && JSON.stringify(r.input) === inputKey) : undefined).catch(() => undefined);
  if (signal?.aborted) return { ok: false, code: "CANCELLED", message: "İstek durduruldu." };
  if (cached && startedRevision === revision) return { ...cached.result, cached: true, fetchedAt: cached.fetchedAt };
  // Requests with independent cancellation signals must not share an abortable fetch.
  const existing = !signal ? pending.get(key) : undefined;
  if (existing) return existing;
  const operation = (async () => {
    const result = await load();
    if (result.ok && !signal?.aborted) await transact(s => {
      if (!s.enabled || startedRevision !== revision) return;
      s.resumes = s.resumes.filter(r => !(r.scope === scope && r.name === name && JSON.stringify(r.input) === inputKey));
      s.resumes.push({ scope, name: name as "get_resumes" | "get_resume", input: JSON.parse(inputKey),
        fetchedAt: Date.now(), result: { ok: true, data: result.data, truncated: result.truncated, methodAssumed: result.methodAssumed } });
    }).catch(() => {});
    return result;
  })();
  if (!signal) pending.set(key, operation);
  try { return await operation; } finally { if (pending.get(key) === operation) pending.delete(key); }
}
