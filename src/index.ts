import type { PluginDescriptor } from "emdash";

export { createPlugin } from "./sandbox-entry.js";

/**
 * Post-publish/reply email digests + comment-activity gamification
 * (points, badges, leaderboard) for EmDash sites.
 *
 * Needs no core changes — built entirely on public hooks
 * (`content:afterPublish`, `comment:afterCreate`, `cron`) and the
 * `email:send` / `users:read` capabilities.
 *
 * Runtime config (site name in emails, digest send hour, points per
 * comment, badge thresholds) is set from the plugin's own admin Settings
 * page after install, not here — this factory just registers the plugin.
 */
export function engagementPlugin(): PluginDescriptor {
	return {
		id: "engagement",
		version: "0.1.0",
		entrypoint: "emdash-plugin-engagement",
		capabilities: ["email:send", "users:read"],
		adminPages: [{ path: "/settings", label: "Engagement Settings", icon: "send" }],
		adminWidgets: [{ id: "status", title: "Engagement", size: "third" }],
		storage: {
			subscriptions: { indexes: ["email", "scope", "status", "token"] },
			points: { indexes: ["points"] },
			digestQueue: { indexes: ["collection"] },
		},
	};
}
