import { describe, expect, it } from "vitest";

import { buildDigestCronSchedule } from "../src/digest.js";

describe("buildDigestCronSchedule", () => {
	it("builds a daily schedule ignoring weekday", () => {
		expect(buildDigestCronSchedule(13, "daily", 4)).toBe("0 13 * * *");
	});

	it("builds a weekly schedule pinned to the given weekday", () => {
		expect(buildDigestCronSchedule(9, "weekly", 1)).toBe("0 9 * * 1");
	});

	it("supports Sunday (0) as a weekly weekday", () => {
		expect(buildDigestCronSchedule(0, "weekly", 0)).toBe("0 0 * * 0");
	});
});
