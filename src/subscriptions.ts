const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
	return EMAIL_PATTERN.test(email.trim());
}

export type SubscriptionScope = "posts" | `thread:${string}`;

/**
 * Builds the canonical scope string for a subscription request.
 * Throws on a `"thread"` request missing `contentId` — the route handler
 * is expected to catch this and return a 400 before any storage write.
 */
export function buildScope(scope: "posts" | "thread", contentId?: string): SubscriptionScope {
	if (scope === "thread") {
		if (!contentId) throw new Error("contentId is required for thread subscriptions");
		return `thread:${contentId}`;
	}
	return "posts";
}

export function subscriptionId(scope: SubscriptionScope, email: string): string {
	return `${scope}:${normalizeEmail(email)}`;
}

export interface SubscriptionRecord {
	email: string;
	scope: SubscriptionScope;
	status: "pending" | "confirmed";
	token: string;
	createdAt: string;
}
