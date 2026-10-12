import test from "node:test";
import assert from "node:assert/strict";
import { emptyDashboard } from "../src/dashboard/models.ts";
import { initialSharedFilters, sharedProvinceOptions, resolveSharedFilters, provinceKey } from "../src/dashboard/discovery-filters.ts";
const options = (cities, workTypes = []) => ({ cities, workModels: [], workTypes });
const kariyer = options([{ id: "34", name: "İstanbul(Avr.)" }, { id: "82", name: "İstanbul(Asya)" }, { id: "998", name: "İstanbul" }, { id: "6", name: "Ankara" }], [{ id: "full", name: "Tam Zamanlı" }, { id: "part", name: "Part Time" }]);
const iskur = options([{ id: "34", name: "İSTANBUL" }, { id: "48", name: "MUĞLA" }]);

test("shared provinces normalize Turkish characters, collapse İstanbul sides, and intersect selected sources", () => {
  assert.deepEqual(sharedProvinceOptions(kariyer, iskur, ["kariyer", "iskur"]), [{ id: "istanbul", name: "İstanbul" }]);
  assert.equal(sharedProvinceOptions(kariyer, iskur, ["kariyer"]).length, 2);
  assert.deepEqual(sharedProvinceOptions(kariyer, iskur, ["iskur"]).map(o => o.id), ["istanbul", "mugla"]);
  assert.equal(provinceKey("ŞANLIURFA"), "sanliurfa");
  assert.equal(sharedProvinceOptions(kariyer, options([]), ["kariyer", "iskur"]).length, 2);
});
test("each provider receives its own observed codes; İstanbul prefers the whole city or both sides", () => {
  const prefs = { ...emptyDashboard().preferences, filters: { province: "istanbul", employmentType: "part-time" } };
  assert.deepEqual(resolveSharedFilters(prefs, "kariyer", kariyer).cities, ["998"]);
  assert.deepEqual(resolveSharedFilters(prefs, "kariyer", kariyer).workTypes, ["part"]);
  assert.deepEqual(resolveSharedFilters(prefs, "kariyer", options(kariyer.cities.filter(o => o.id !== "998"), kariyer.workTypes)).cities, ["34", "82"]);
  assert.equal(resolveSharedFilters(prefs, "iskur", iskur).iskur.province, "34");
  assert.equal(resolveSharedFilters(prefs, "iskur", iskur).iskur.employmentType, "2");
});
test("unavailable common filters raise an error instead of searching without the requested restriction", () => {
  const prefs = { ...emptyDashboard().preferences, filters: { province: "mugla", employmentType: "" } };
  assert.throws(() => resolveSharedFilters(prefs, "kariyer", kariyer), /Seçilen il/);
  assert.throws(() => resolveSharedFilters({ ...prefs, filters: { province: "", employmentType: "full-time" } }, "kariyer", options([])), /çalışma şekli/);
  const cleared = resolveSharedFilters({ ...prefs, cities: ["34"], iskur: { ...prefs.iskur, province: "48", employmentType: "1" }, filters: { province: "", employmentType: "" } }, "iskur", iskur);
  assert.equal(cleared.iskur.province, ""); assert.equal(cleared.iskur.employmentType, "");
});
test("saved separate preferences remain readable and initialize the shared controls", () => {
  const prefs = { ...emptyDashboard().preferences, cities: ["82"], iskur: { province: "48", employmentType: "1", sector: "kamuRadio" } };
  assert.deepEqual(initialSharedFilters(prefs, kariyer, iskur), { province: "istanbul", employmentType: "full-time" });
  assert.deepEqual(resolveSharedFilters(prefs, "kariyer", kariyer).cities, ["82"]);
  assert.equal(resolveSharedFilters(prefs, "iskur", iskur).iskur.province, "48");
  assert.equal(initialSharedFilters({ ...prefs, providers: ["iskur"] }, kariyer, iskur).province, "mugla");
});
