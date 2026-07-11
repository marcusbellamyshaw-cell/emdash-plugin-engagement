import { describe, expect, it } from "vitest";

import {
	buildScope,
	isValidEmail,
	normalizeEmail,
	subscriptionId,
} from "../src/subscriptions.js";

describe("isValidEmail", () => {
	it("accepts a normal address", () => {
		expect(isValidEmail("reader@example.com")).toBe(true);
	});

	it.each(["", "not-an-email", "missing-domain@", "@missing-local.com", "spaces in@it.com"])(
		"rejects %s",
		(input) => {
			expect(isValidEmail(input)).toBe(false);
		},
	);
});

describe("normalizeEmail", () => {
	it("lowercases and trims", () => {
		expect(normalizeEmail("  Reader@Example.COM  ")).toBe("reader@example.com");
	});
});

describe("buildScope", () => {
	it("returns \"posts\" for a site-wide subscription", () => {
		expect(buildScope("posts")).toBe("posts");
	});

	it("returns a thread-prefixed scope when contentId is given", () => {
		expect(buildScope("thread", "abc123")).toBe("thread:abc123");
	});

	it("throws for a thread scope missing contentId", () => {
		expect(() => buildScope("thread")).toThrow(/contentId is required/);
	});
});

describe("subscriptionId", () => {
	it("combines scope and normalized email into one id", () => {
		expect(subscriptionId("posts", "Reader@Example.com")).toBe("posts:reader@example.com");
	});

	it("is stable regardless of email casing", () => {
		expect(subscriptionId("thread:abc", "A@B.com")).toBe(subscriptionId("thread:abc", "a@b.COM"));
	});
});
