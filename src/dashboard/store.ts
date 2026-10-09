import { dashboardSchema, emptyDashboard } from "./models.js";
import type { DashboardState } from "./models.js";
export const DASHBOARD_STORAGE_KEY = "kariyerLensDashboard";
const MAX_BYTES = 3 * 1024 * 1024;
let queue: Promise<unknown> = Promise.resolve();
const accountKey = (scope: string) => DASHBOARD_STORAGE_KEY + ":" + scope;
export async function accountScope(candidateId: string): Promise<string> {
  if (!/^\d{1,16}$/.test(candidateId)) throw new Error("Geçersiz aday kimliği.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kariyerlens:candidate:" + candidateId));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function transactDashboard<T>(scope: string, guard: () => void, fn: (state: DashboardState) => T, save = true): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(scope)) return Promise.reject(new Error("Geçersiz hesap kapsamı."));
  const operation = queue.then(async () => {
    guard(); const key = accountKey(scope); const stored = await chrome.storage.local.get(key); guard();
    const raw = stored[key];
    const parsed = raw === undefined ? emptyDashboard() : dashboardSchema.parse(raw);
    const result = fn(parsed); guard();
    if (save) {
      dashboardSchema.parse(parsed);
      if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_BYTES) throw new Error("Dashboard depolaması dolu. Eski takip kayıtlarını kaldırın.");
      await chrome.storage.local.set({ [key]: parsed }); guard();
    }
    return structuredClone(result);
  });
  queue = operation.catch(() => {}); return operation;
}
