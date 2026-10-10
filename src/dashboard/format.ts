import { dateTime } from "./data.js";

export const dateLabel = (value: string | number | null) => {
  const n = typeof value === "number" ? value : value ? dateTime(value) : null;
  return n === null ? "—" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(n);
};
export const inputDate = (value: string) => { const n = dateTime(value); return n === null ? "" : new Date(n).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); };
export const percent = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 }).format(value);
