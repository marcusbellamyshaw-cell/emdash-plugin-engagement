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
