import type { DashboardState, JobDiscoveryPreferences } from "./models.js";
import type { JobProvider } from "../shared/job-provider.js";

type Options = DashboardState["discovery"]["options"];
type Option = Options["cities"][number];
export type SharedFilters = NonNullable<JobDiscoveryPreferences["filters"]>;
const normalized = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const provinceName = (name: string) => name.replace(/\([^)]*\)/g, "").replace(/\s+(?:Avrupa|Asya|Anadolu)(?:\s+Yakası)?\s*$/i, "").trim();
export const provinceKey = (name: string) => normalized(provinceName(name));
export function employmentKey(name: string): SharedFilters["employmentType"] {
  const key = normalized(name);
  if (/tamzamanli|fulltime/.test(key)) return "full-time";
  if (/kismizamanli|yarizamanli|parttime/.test(key)) return "part-time";
  return "";
}
export function sharedProvinceOptions(kariyer: Options, iskur: Options, providers: JobProvider[]): Option[] {
  const groups = providers.map(p => p === "kariyer" ? kariyer.cities : iskur.cities);
  const available = groups.filter(g => g.length);
  const combined = new Map<string, Option>();
  for (const group of available) for (const option of group) {
    const id = provinceKey(option.name);
    if (!id || (available.length > 1 && !available.every(g => g.some(o => provinceKey(o.name) === id)))) continue;
    const name = provinceName(option.name).toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/g, c => c.toLocaleUpperCase("tr-TR"));
    combined.set(id, { id, name });
  }
  return [...combined.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}
export function initialSharedFilters(prefs: JobDiscoveryPreferences, kariyer: Options, iskur: Options): SharedFilters {
  if (prefs.filters) return prefs.filters;
  const city = prefs.providers.includes("kariyer") ? kariyer.cities.find(o => prefs.cities.includes(o.id)) : undefined;
  const province = iskur.cities.find(o => o.id === prefs.iskur.province);
  return { province: provinceKey(city?.name ?? province?.name ?? ""), employmentType: prefs.iskur.employmentType === "1" ? "full-time" : prefs.iskur.employmentType === "2" ? "part-time" : "" };
}
export function resolveSharedFilters(prefs: JobDiscoveryPreferences, provider: JobProvider, options: Options) {
  if (!prefs.filters) return { cities: prefs.cities, workTypes: [] as string[], iskur: prefs.iskur };
  const { province, employmentType } = prefs.filters;
  const matches = province ? options.cities.filter(o => provinceKey(o.name) === province) : [];
  if (province && !matches.length) throw new Error("Seçilen il bu kaynağın filtre seçeneklerinde bulunamadı. Önce tüm illerle yenileyin.");
  if (provider === "iskur") return { cities: [] as string[], workTypes: [] as string[], iskur: { ...prefs.iskur,
    province: matches[0]?.id ?? "", employmentType: employmentType === "full-time" ? "1" as const : employmentType === "part-time" ? "2" as const : "" as const } };
  const workTypes = employmentType ? options.workTypes.filter(o => employmentKey(o.name) === employmentType).map(o => o.id) : [];
  if (employmentType && !workTypes.length) throw new Error("Seçilen çalışma şekli Kariyer.net filtrelerinde bulunamadı. Önce tüm çalışma şekilleriyle yenileyin.");
  // İstanbul's all-city option avoids combining overlapping European/Asian options.
  const wholeCity = matches.find(o => normalized(o.name) === province || (province === "istanbul" && o.id === "998"));
  return { cities: wholeCity ? [wholeCity.id] : matches.map(o => o.id), workTypes, iskur: prefs.iskur };
}

export function needsKariyerFilterOptions(prefs: JobDiscoveryPreferences, options: Options): boolean {
  return Boolean(prefs.filters?.province && !options.cities.some(o => provinceKey(o.name) === prefs.filters!.province))
    || Boolean(prefs.filters?.employmentType && !options.workTypes.some(o => employmentKey(o.name) === prefs.filters!.employmentType))
    || (!prefs.filters && prefs.cities.some(id => !options.cities.some(o => o.id === id)))
    || prefs.workModels.some(id => !options.workModels.some(o => o.id === id));
}
