// Short-request warning shown by the agent builder. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { shortTaskReason } from "../src/lib/planner/promptCheck.js";

test("flags fragments, including non-Latin ones", () => {
  for (const t of ["Below, यह एजेंट", "", "   ", "faculty report", "list free faculty", "!!! ??? 123 456 789"]) {
    assert.ok(shortTaskReason(t), `should warn: ${JSON.stringify(t)}`);
  }
});

test("accepts real task descriptions in any script", () => {
  for (const t of [
    "List faculty who have no lectures today and send me a report",
    "Every Monday at 9 AM, summarise open student tickets by school",
    "आज जिन शिक्षकों की कोई कक्षा नहीं है उनकी सूची बनाओ",
  ]) {
    assert.equal(shortTaskReason(t), null, `should accept: ${t}`);
  }
});
