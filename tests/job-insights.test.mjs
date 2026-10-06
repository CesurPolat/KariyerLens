import test from "node:test";
import assert from "node:assert/strict";
import { getApplicationInsight, getHiringActivity } from "../src/content/job-insights.ts";

test("missing application/date data does not produce a hiring estimate", () => {
  const job = { applicationReviewText: "Şirket başvuruları bugün inceledi." };
  assert.equal(getApplicationInsight(job), null);
  assert.equal(getHiringActivity(job, null).score, null);
});

test("recent review cannot make an old, crowded listing look active", () => {
  const activity = getHiringActivity({ applicationCount: "2.000", applicationReviewText: "Şirket başvuruları bugün inceledi." }, { openDays: 90, applicationsPerDay: 22 });
  assert.equal(activity.score, 15);
  assert.equal(activity.label, "Çok düşük hareketlilik");
  assert.match(activity.copy, /rekabet yoğun/);
});

test("four-day review uses the existing recency score", () => {
  const activity = getHiringActivity({ applicationCount: "200", applicationReviewText: "Şirket başvuruları 4 gün önce inceledi." }, { openDays: 7, applicationsPerDay: 200 / 7 });
  assert.equal(activity.score, 67);
});

test("15+ days is a stale review rather than missing data", () => {
  const activity = getHiringActivity({ applicationCount: "200", applicationReviewText: "Şirket başvuruları 15+ gün önce inceledi." }, { openDays: 20, applicationsPerDay: 10 });
  assert.equal(activity.score, 30);
  assert.match(activity.copy, /aktif takip etmiyor olabilir/);
});

test("known review with missing application count explains the actual missing field", () => {
  const job = { publishedAt: "2026-10-01", applicationReviewText: "Şirket başvuruları 15+ gün önce inceledi." };
  const activity = getHiringActivity(job, getApplicationInsight(job));
  assert.equal(activity.score, null);
  assert.match(activity.copy, /başvuru sayısı/);
  assert.doesNotMatch(activity.copy, /inceleme zamanı/);
});

test("invalid publication date and unknown review are reported together", () => {
  const job = { publishedAt: "invalid", applicationCount: "200" };
  const activity = getHiringActivity(job, getApplicationInsight(job));
  assert.equal(activity.score, null);
  assert.match(activity.copy, /yayın tarihi/);
  assert.match(activity.copy, /son başvuru inceleme zamanı/);
  assert.doesNotMatch(activity.copy, /başvuru sayısı/);
});
