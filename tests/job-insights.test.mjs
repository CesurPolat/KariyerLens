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
  assert.equal(activity.label, "Çok düşük devir");
  assert.match(activity.copy, /rekabet yoğun/);
});

test("four-day review uses the existing recency score", () => {
  const activity = getHiringActivity({ applicationCount: "200", applicationReviewText: "Şirket başvuruları 4 gün önce inceledi." }, { openDays: 7, applicationsPerDay: 200 / 7 });
  assert.equal(activity.score, 67);
});
