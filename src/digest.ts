export type DigestFrequency = "daily" | "weekly";

/**
 * Builds the cron expression for the digest send. `weekday` is 0 (Sunday)
 * through 6 (Saturday) and is only meaningful for `"weekly"` — the digest
 * queue itself holds whatever accumulated since the last send, so cadence
 * only changes when the flush fires, not what gets included in it.
 */
export function buildDigestCronSchedule(
	hourUtc: number,
	frequency: DigestFrequency,
	weekday: number,
): string {
	const dayField = frequency === "weekly" ? String(weekday) : "*";
	return `0 ${hourUtc} * * ${dayField}`;
}
