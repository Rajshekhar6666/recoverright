import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MILESTONE_QUOTES,
  getMilestoneForPercentage,
  getExactMilestoneTier,
  speakMilestoneQuote,
  type MilestoneQuote,
} from "../lib/milestoneQuotes";

describe("motivational milestone quotes and progress mapping", () => {
  test("all 10 milestone tiers are defined from 10% to 100%", () => {
    assert.equal(MILESTONE_QUOTES.length, 10);
    const percentages = MILESTONE_QUOTES.map((m) => m.pct);
    assert.deepEqual(percentages, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  test("each milestone contains non-empty English and Hindi content matching user brief", () => {
    const expectedEmojis = ["🌱", "🌿", "🌼", "🌻", "🌟", "💪", "🌈", "🌷", "🕊️", "🎉"];

    MILESTONE_QUOTES.forEach((m, idx) => {
      assert.equal(m.emoji, expectedEmojis[idx]);
      assert.ok(m.title.en.trim().length > 0, `Missing English title for ${m.pct}%`);
      assert.ok(m.title.hi.trim().length > 0, `Missing Hindi title for ${m.pct}%`);
      assert.ok(m.quote.en.trim().length > 0, `Missing English quote for ${m.pct}%`);
      assert.ok(m.quote.hi.trim().length > 0, `Missing Hindi quote for ${m.pct}%`);
      assert.ok(m.cheer.en.includes("RecoverRight"), `Cheer for ${m.pct}% must mention RecoverRight`);
      assert.ok(m.cheer.hi.includes("RecoverRight"), `Hindi cheer for ${m.pct}% must mention RecoverRight`);
    });

    // Verify specific requested phrases
    const m10 = MILESTONE_QUOTES.find((m) => m.pct === 10)!;
    assert.ok(m10.quote.en.includes("Every journey begins with one step"));
    assert.ok(m10.quote.hi.includes("हर सफर एक छोटे कदम से शुरू होता है"));

    const m50 = MILESTONE_QUOTES.find((m) => m.pct === 50)!;
    assert.ok(m50.quote.en.includes("Look how far you've come"));
    assert.ok(m50.quote.hi.includes("देखिए, आप कितना आगे आ चुके हैं"));

    const m100 = MILESTONE_QUOTES.find((m) => m.pct === 100)!;
    assert.ok(m100.quote.en.includes("Congratulations!"));
    assert.ok(m100.quote.hi.includes("बहुत-बहुत बधाई!"));
  });

  test("getMilestoneForPercentage maps progress percentages accurately", () => {
    assert.equal(getMilestoneForPercentage(0), null);
    assert.equal(getMilestoneForPercentage(5), null);
    assert.equal(getMilestoneForPercentage(9), null);

    assert.equal(getMilestoneForPercentage(10)?.pct, 10);
    assert.equal(getMilestoneForPercentage(19)?.pct, 10);
    assert.equal(getMilestoneForPercentage(20)?.pct, 20);
    assert.equal(getMilestoneForPercentage(35)?.pct, 30);
    assert.equal(getMilestoneForPercentage(50)?.pct, 50);
    assert.equal(getMilestoneForPercentage(78)?.pct, 70);
    assert.equal(getMilestoneForPercentage(99)?.pct, 90);
    assert.equal(getMilestoneForPercentage(100)?.pct, 100);
  });

  test("getExactMilestoneTier calculates multiples of 10", () => {
    assert.equal(getExactMilestoneTier(8), null);
    assert.equal(getExactMilestoneTier(10)?.pct, 10);
    assert.equal(getExactMilestoneTier(15)?.pct, 10);
    assert.equal(getExactMilestoneTier(52)?.pct, 50);
    assert.equal(getExactMilestoneTier(100)?.pct, 100);
  });
});
