import { describe, expect, it } from "vitest";

import { newlyUnlockedBadges, DEFAULT_BADGE_THRESHOLDS } from "../src/badges.js";

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
