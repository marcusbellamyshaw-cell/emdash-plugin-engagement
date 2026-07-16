import { describe, expect, it } from "vitest";

import {
	newlyUnlockedBadges,
	sanitizeBadgeThresholds,
	DEFAULT_BADGE_THRESHOLDS,
} from "../src/badges.js";

describe("newlyUnlockedBadges", () => {
	it("unlocks the first badge on the first comment", () => {
		expect(newlyUnlockedBadges(1, [])).toEqual(["First Comment"]);
	});

	it("unlocks nothing between thresholds", () => {
		expect(newlyUnlockedBadges(5, ["First Comment"])).toEqual([]);
	});

	it("unlocks multiple thresholds crossed at once", () => {
		// custom thresholds where two land on the same count
		const thresholds = [
			{ count: 1, label: "A" },
			{ count: 1, label: "B" },
			{ count: 2, label: "C" },
		];
		expect(newlyUnlockedBadges(1, [], thresholds)).toEqual(["A", "B"]);
	});

	it("never re-unlocks a badge already held", () => {
		expect(newlyUnlockedBadges(50, ["First Comment", "Regular", "Super Commenter"])).toEqual([]);
	});

	it("default thresholds are ascending and cover the documented tiers", () => {
		const counts = DEFAULT_BADGE_THRESHOLDS.map((t) => t.count);
		expect(counts).toEqual([1, 10, 50, 200]);
	});
});

describe("sanitizeBadgeThresholds", () => {
	it("sorts rows ascending by count regardless of input order", () => {
		const raw = [
			{ count: 50, label: "Super Commenter" },
			{ count: 1, label: "First Comment" },
		];
		expect(sanitizeBadgeThresholds(raw)).toEqual([
			{ count: 1, label: "First Comment" },
			{ count: 50, label: "Super Commenter" },
		]);
	});

	it("drops rows with a non-positive count or empty label", () => {
		const raw = [
			{ count: 0, label: "Zero" },
			{ count: 5, label: "" },
			{ count: -1, label: "Negative" },
			{ count: 5, label: "Valid" },
		];
		expect(sanitizeBadgeThresholds(raw)).toEqual([{ count: 5, label: "Valid" }]);
	});

	it("coerces string counts from form input to numbers", () => {
		expect(sanitizeBadgeThresholds([{ count: "3", label: "Three" }])).toEqual([
			{ count: 3, label: "Three" },
		]);
	});

	it("falls back to defaults when nothing valid survives", () => {
		expect(sanitizeBadgeThresholds([{ count: 0, label: "" }])).toEqual(DEFAULT_BADGE_THRESHOLDS);
	});

	it("falls back to defaults for non-array input", () => {
		expect(sanitizeBadgeThresholds(undefined)).toEqual(DEFAULT_BADGE_THRESHOLDS);
		expect(sanitizeBadgeThresholds("nope")).toEqual(DEFAULT_BADGE_THRESHOLDS);
	});
});
