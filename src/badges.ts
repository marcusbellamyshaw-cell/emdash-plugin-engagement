export interface BadgeThreshold {
	count: number;
	label: string;
}

export const DEFAULT_BADGE_THRESHOLDS: BadgeThreshold[] = [
	{ count: 1, label: "First Comment" },
	{ count: 10, label: "Regular" },
	{ count: 50, label: "Super Commenter" },
	{ count: 200, label: "Legend" },
];

/**
 * Coerces admin-submitted repeater rows into valid badge thresholds,
 * dropping malformed rows and sorting ascending by count. Falls back to
 * `DEFAULT_BADGE_THRESHOLDS` if nothing valid survives, so a bad save never
 * leaves the plugin with an empty threshold list.
 */
export function sanitizeBadgeThresholds(raw: unknown): BadgeThreshold[] {
	if (!Array.isArray(raw)) return DEFAULT_BADGE_THRESHOLDS;
	const cleaned = raw
		.map((row): BadgeThreshold | null => {
			if (typeof row !== "object" || row === null) return null;
			const count = Number((row as Record<string, unknown>).count);
			const label = String((row as Record<string, unknown>).label ?? "").trim();
			if (!Number.isFinite(count) || count < 1 || !label) return null;
			return { count: Math.floor(count), label };
		})
		.filter((t): t is BadgeThreshold => t !== null)
		.sort((a, b) => a.count - b.count);
	return cleaned.length > 0 ? cleaned : DEFAULT_BADGE_THRESHOLDS;
}

/**
 * Badge labels newly unlocked by reaching `commentCount`, excluding badges
 * already held. Crossing two thresholds in one comment (e.g. count jumps
 * from 0 to 1 while a threshold sits at 1) returns both.
 */
export function newlyUnlockedBadges(
	commentCount: number,
	existingBadges: string[],
	thresholds: BadgeThreshold[] = DEFAULT_BADGE_THRESHOLDS,
): string[] {
	const existing = new Set(existingBadges);
	return thresholds
		.filter((t) => commentCount >= t.count && !existing.has(t.label))
		.map((t) => t.label);
}
