import { definePlugin, PluginRouteError } from "emdash";
import type { PluginContext, RouteContext } from "emdash";

import {
	DEFAULT_BADGE_THRESHOLDS,
	newlyUnlockedBadges,
	sanitizeBadgeThresholds,
	type BadgeThreshold,
} from "./badges.js";
import { buildDigestCronSchedule, type DigestFrequency } from "./digest.js";
import {
	buildScope,
	isValidEmail,
	normalizeEmail,
	subscriptionId,
	type SubscriptionRecord,
	type SubscriptionScope,
} from "./subscriptions.js";
import { buildConfirmEmail, buildDigestEmail, buildReplyNotificationEmail } from "./templates.js";

const DIGEST_CRON_NAME = "engagement-daily-digest";

interface PointsRecord {
	userId: string;
	name: string;
	points: number;
	commentCount: number;
	badges: string[];
	lastCommentAt: string;
}

interface DigestQueueEntry {
	collection: string;
	contentId: string;
	title: string;
	slug: string;
	queuedAt: string;
}

interface EngagementOptions {
	siteName?: string;
	digestHourUtc?: number;
	digestFrequency?: DigestFrequency;
	digestWeekday?: number;
	pointsPerComment?: number;
	badgeThresholds?: BadgeThreshold[];
	/** Site path to a friendly confirm page (e.g. "/subscribe/confirm"). Blank = raw API link. */
	confirmPageUrl?: string;
	/** Site path to a friendly unsubscribe page (e.g. "/subscribe/unsubscribe"). Blank = raw API link. */
	unsubscribePageUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime config lives in plugin KV settings (admin-configurable via the
 * plugin's settings page), not in the astro.config-level `options` passed
 * to `engagementPlugin()` — that field only carries capability/storage
 * declarations across to the manifest; there's no runtime path from it into
 * hook/route handlers. Mirrors the existing webhook-notifier plugin.
 */
async function getOptions(ctx: PluginContext): Promise<Required<EngagementOptions>> {
	const [
		siteName,
		digestHourUtc,
		digestFrequency,
		digestWeekday,
		pointsPerComment,
		badgeThresholds,
		confirmPageUrl,
		unsubscribePageUrl,
	] = await Promise.all([
		ctx.kv.get<string>("settings:siteName"),
		ctx.kv.get<number>("settings:digestHourUtc"),
		ctx.kv.get<string>("settings:digestFrequency"),
		ctx.kv.get<number>("settings:digestWeekday"),
		ctx.kv.get<number>("settings:pointsPerComment"),
		ctx.kv.get<BadgeThreshold[]>("settings:badgeThresholds"),
		ctx.kv.get<string>("settings:confirmPageUrl"),
		ctx.kv.get<string>("settings:unsubscribePageUrl"),
	]);
	return {
		siteName: siteName || ctx.site.name || "This site",
		digestHourUtc:
			typeof digestHourUtc === "number" && digestHourUtc >= 0 && digestHourUtc <= 23
				? digestHourUtc
				: 13,
		digestFrequency: digestFrequency === "weekly" ? "weekly" : "daily",
		digestWeekday:
			typeof digestWeekday === "number" && digestWeekday >= 0 && digestWeekday <= 6
				? digestWeekday
				: 0,
		pointsPerComment: typeof pointsPerComment === "number" ? pointsPerComment : 10,
		badgeThresholds: Array.isArray(badgeThresholds) ? badgeThresholds : DEFAULT_BADGE_THRESHOLDS,
		confirmPageUrl: confirmPageUrl || "",
		unsubscribePageUrl: unsubscribePageUrl || "",
	};
}

/**
 * Builds the confirm/unsubscribe link sent in emails. Points at the site's
 * own friendly page (see `emdash-plugin-engagement/astro`'s
 * `ConfirmSubscription`/`Unsubscribe` components) when the admin has
 * configured one; otherwise falls back to the plugin's raw JSON API route.
 */
function buildTokenLink(
	ctx: PluginContext,
	pagePath: string,
	apiRoute: "confirm" | "unsubscribe",
	token: string,
): string {
	const path = pagePath || `/_emdash/api/plugins/engagement/${apiRoute}`;
	return ctx.url(`${path}?token=${encodeURIComponent(token)}`);
}

async function findSubscriptionByToken(
	ctx: PluginContext,
	token: string,
): Promise<{ id: string; data: SubscriptionRecord } | null> {
	const sub = ctx.storage.subscriptions!;
	const result = await sub.query({ where: { token }, limit: 1 });
	const first = result.items[0];
	return first ? { id: first.id, data: first.data as SubscriptionRecord } : null;
}

/**
 * Awards points/badges and sends reply notifications for one newly-approved
 * comment. Called from both `comment:afterCreate` (auto-approved comments)
 * and `comment:afterModerate` (comments approved after moderation) — never
 * both for the same comment, since a comment is either auto-approved on
 * creation or held and approved later, not both.
 */
async function handleApprovedComment(
	comment: {
		id: string;
		contentId: string;
		collection: string;
		parentId: string | null;
		authorName: string;
		authorEmail: string;
		authorUserId: string | null;
	},
	content: { id: string; collection: string; slug: string; title?: string },
	ctx: PluginContext,
): Promise<void> {
	const opts = await getOptions(ctx);

	// Gamification — only for identified commenters (authorUserId set).
	if (comment.authorUserId) {
		const points = ctx.storage.points!;
		const existing = ((await points.get(comment.authorUserId)) as PointsRecord | null) ?? null;
		const commentCount = (existing?.commentCount ?? 0) + 1;
		const newBadges = newlyUnlockedBadges(
			commentCount,
			existing?.badges ?? [],
			opts.badgeThresholds,
		);
		let name = existing?.name ?? "";
		if (!name && ctx.users) {
			const user = await ctx.users.get(comment.authorUserId);
			name = user?.name ?? "";
		}
		const record: PointsRecord = {
			userId: comment.authorUserId,
			name,
			points: (existing?.points ?? 0) + opts.pointsPerComment,
			commentCount,
			badges: [...(existing?.badges ?? []), ...newBadges],
			lastCommentAt: new Date().toISOString(),
		};
		await points.put(comment.authorUserId, record);
	}

	// Reply notifications — only for actual replies, to subscribers of this thread.
	if (!comment.parentId) return;

	const sub = ctx.storage.subscriptions!;
	const scope: SubscriptionScope = `thread:${comment.contentId}`;
	const subscribers = await sub.query({ where: { scope, status: "confirmed" }, limit: 1000 });
	if (subscribers.items.length === 0 || !ctx.email) return;

	const commentUrl = ctx.url(`/${content.slug}#comment-${comment.id}`);
	for (const { id, data } of subscribers.items) {
		const record = data as SubscriptionRecord;
		if (normalizeEmail(record.email) === normalizeEmail(comment.authorEmail)) continue; // don't notify people about their own reply
		const unsubscribeUrl = buildTokenLink(ctx, opts.unsubscribePageUrl, "unsubscribe", record.token);
		const body = buildReplyNotificationEmail(
			opts.siteName,
			comment.authorName,
			commentUrl,
			unsubscribeUrl,
		);
		try {
			await ctx.email.send({ to: record.email, ...body });
		} catch (error) {
			ctx.log.warn(`Failed to send reply notification to subscription ${id}`, error);
		}
	}
}

/**
 * Default export must be the `definePlugin()` result itself, not a factory
 * function — that's what marks this entrypoint as "standard" format (see
 * `format: "standard"` in `index.ts`'s `engagementPlugin()` descriptor),
 * which is required to run under `sandboxed: []`. A function-wrapped export
 * here reads as "native" format and Emdash refuses to sandbox it.
 */
export default definePlugin({
	id: "engagement",
	version: "0.2.1",

	hooks: {
			"plugin:activate": {
				handler: async (_event, ctx) => {
					const opts = await getOptions(ctx);
					if (ctx.cron) {
						await ctx.cron.schedule(DIGEST_CRON_NAME, {
							schedule: buildDigestCronSchedule(
								opts.digestHourUtc,
								opts.digestFrequency,
								opts.digestWeekday,
							),
						});
					}
				},
			},

			"content:afterPublish": {
				errorPolicy: "continue",
				handler: async (event, ctx) => {
					const content = event.content;
					const contentId = typeof content.id === "string" ? content.id : String(content.id);
					const title = typeof content.title === "string" ? content.title : contentId;
					const slug = typeof content.slug === "string" ? content.slug : contentId;

					const queue = ctx.storage.digestQueue!;
					const entry: DigestQueueEntry = {
						collection: event.collection,
						contentId,
						title,
						slug,
						queuedAt: new Date().toISOString(),
					};
					await queue.put(`${event.collection}:${contentId}`, entry);
				},
			},

			"comment:afterCreate": {
				errorPolicy: "continue",
				handler: async (event, ctx) => {
					if (event.comment.status !== "approved") return;
					await handleApprovedComment(
						{
							id: event.comment.id,
							contentId: event.comment.contentId,
							collection: event.comment.collection,
							parentId: event.comment.parentId,
							authorName: event.comment.authorName,
							authorEmail: event.comment.authorEmail,
							authorUserId: event.comment.authorUserId,
						},
						event.content,
						ctx,
					);
				},
			},

			"comment:afterModerate": {
				errorPolicy: "continue",
				handler: async (event, ctx) => {
					if (event.newStatus !== "approved" || event.previousStatus === "approved") return;
					await handleApprovedComment(
						{
							id: event.comment.id,
							contentId: event.comment.contentId,
							collection: event.comment.collection,
							parentId: event.comment.parentId,
							authorName: event.comment.authorName,
							authorEmail: event.comment.authorEmail,
							authorUserId: event.comment.authorUserId,
						},
						{
							id: event.comment.contentId,
							collection: event.comment.collection,
							slug: event.comment.contentId,
						},
						ctx,
					);
				},
			},

			cron: {
				handler: async (event, ctx) => {
					if (event.name !== DIGEST_CRON_NAME) return;
					const opts = await getOptions(ctx);
					const queue = ctx.storage.digestQueue!;
					const queued = await queue.query({ limit: 1000 });
					if (queued.items.length === 0 || !ctx.email) return;

					const items = queued.items.map(({ data }) => {
						const entry = data as DigestQueueEntry;
						return { title: entry.title, url: ctx.url(`/${entry.slug}`) };
					});

					const sub = ctx.storage.subscriptions!;
					const subscribers = await sub.query({
						where: { scope: "posts", status: "confirmed" },
						limit: 10000,
					});

					for (const { id, data } of subscribers.items) {
						const record = data as SubscriptionRecord;
						const unsubscribeUrl = buildTokenLink(
							ctx,
							opts.unsubscribePageUrl,
							"unsubscribe",
							record.token,
						);
						const body = buildDigestEmail(opts.siteName, items, unsubscribeUrl);
						try {
							await ctx.email.send({ to: record.email, ...body });
						} catch (error) {
							ctx.log.warn(`Failed to send digest to subscription ${id}`, error);
						}
					}

					await queue.deleteMany(queued.items.map((i) => i.id));
					await ctx.kv.set("state:lastDigestSentAt", new Date().toISOString());
					await ctx.kv.set("state:lastDigestPostCount", items.length);
				},
			},
		},

		routes: {
			subscribe: {
				public: true,
				handler: async (ctx: RouteContext) => {
					const input = isRecord(ctx.input) ? ctx.input : {};
					const email = typeof input.email === "string" ? input.email : "";
					const scopeKind = input.scope === "thread" ? "thread" : "posts";
					const contentId = typeof input.contentId === "string" ? input.contentId : undefined;

					if (!isValidEmail(email)) throw PluginRouteError.badRequest("Invalid email address");

					let scope: SubscriptionScope;
					try {
						scope = buildScope(scopeKind, contentId);
					} catch {
						throw PluginRouteError.badRequest("contentId is required for thread subscriptions");
					}

					const opts = await getOptions(ctx);
					const id = subscriptionId(scope, email);
					const sub = ctx.storage.subscriptions!;
					const existing = (await sub.get(id)) as SubscriptionRecord | null;
					if (existing?.status === "confirmed") {
						return { status: "already-subscribed" };
					}

					const token = crypto.randomUUID();
					const record: SubscriptionRecord = {
						email: normalizeEmail(email),
						scope,
						status: "pending",
						token,
						createdAt: new Date().toISOString(),
					};
					await sub.put(id, record);

					if (ctx.email) {
						const confirmUrl = buildTokenLink(ctx, opts.confirmPageUrl, "confirm", token);
						const body = buildConfirmEmail(opts.siteName, confirmUrl);
						try {
							await ctx.email.send({ to: record.email, ...body });
						} catch (error) {
							ctx.log.warn(`Failed to send confirmation email to ${record.email}`, error);
						}
					}

					return { status: "pending-confirmation" };
				},
			},

			confirm: {
				public: true,
				handler: async (ctx: RouteContext) => {
					const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
					if (!token) throw PluginRouteError.badRequest("Missing token");

					const found = await findSubscriptionByToken(ctx, token);
					if (!found) throw PluginRouteError.badRequest("Invalid or expired confirmation link");

					const sub = ctx.storage.subscriptions!;
					await sub.put(found.id, { ...found.data, status: "confirmed" });
					return { status: "confirmed", email: found.data.email };
				},
			},

			unsubscribe: {
				public: true,
				handler: async (ctx: RouteContext) => {
					const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
					if (token) {
						const found = await findSubscriptionByToken(ctx, token);
						if (found) await ctx.storage.subscriptions!.delete(found.id);
					}
					// Always report success — don't let this endpoint be used to
					// probe whether a given token is currently valid.
					return { status: "unsubscribed" };
				},
			},

			leaderboard: {
				public: true,
				handler: async (ctx: RouteContext) => {
					const limitParam = new URL(ctx.request.url).searchParams.get("limit");
					const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 100);
					const points = ctx.storage.points!;
					const result = await points.query({ orderBy: { points: "desc" }, limit });
					return {
						items: result.items.map(({ data }) => data as PointsRecord),
					};
				},
			},

			admin: {
				handler: async (ctx: RouteContext) => {
					const interaction = ctx.input as {
						type: string;
						page?: string;
						action_id?: string;
						values?: Record<string, unknown>;
					};

					if (interaction.type === "page_load" && interaction.page === "widget:status") {
						return buildStatusWidget(ctx);
					}
					if (interaction.type === "page_load" && interaction.page === "/settings") {
						return buildSettingsPage(ctx);
					}
					if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
						return saveSettings(ctx, interaction.values ?? {});
					}
					return { blocks: [] };
				},
			},
		},
	});

async function buildStatusWidget(ctx: PluginContext) {
	const [subs, points, lastDigestSentAt, lastDigestPostCount] = await Promise.all([
		ctx.storage.subscriptions!.count({ status: "confirmed" }),
		ctx.storage.points!.query({ orderBy: { points: "desc" }, limit: 3 }),
		ctx.kv.get<string>("state:lastDigestSentAt"),
		ctx.kv.get<number>("state:lastDigestPostCount"),
	]);

	const top3 = points.items
		.map(({ data }) => data as PointsRecord)
		.map((p) => `${p.name || p.userId}: ${p.points} pts`)
		.join(", ");

	return {
		blocks: [
			{
				type: "fields",
				fields: [
					{ label: "Confirmed subscribers", value: String(subs) },
					{ label: "Last digest sent", value: lastDigestSentAt ?? "Never" },
					{ label: "Posts in last digest", value: String(lastDigestPostCount ?? 0) },
				],
			},
			{
				type: "context",
				text: top3 ? `Top commenters: ${top3}` : "No comment activity yet.",
			},
		],
	};
}

async function buildSettingsPage(ctx: PluginContext) {
	const opts = await getOptions(ctx);
	return {
		blocks: [
			{ type: "header", text: "Engagement Settings" },
			{
				type: "context",
				text: "Configure the new-post digest and comment gamification.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "engagement-settings",
				fields: [
					{
						type: "text_input",
						action_id: "siteName",
						label: "Site name (used in email subjects)",
						initial_value: opts.siteName,
					},
					{
						type: "text_input",
						action_id: "digestHourUtc",
						label: "Digest send hour (UTC, 0-23)",
						initial_value: String(opts.digestHourUtc),
					},
					{
						type: "select",
						action_id: "digestFrequency",
						label: "Digest frequency",
						options: [
							{ label: "Daily", value: "daily" },
							{ label: "Weekly", value: "weekly" },
						],
						initial_value: opts.digestFrequency,
					},
					{
						type: "text_input",
						action_id: "digestWeekday",
						label: "Weekly digest day (0=Sunday...6=Saturday, ignored when frequency is daily)",
						initial_value: String(opts.digestWeekday),
					},
					{
						type: "text_input",
						action_id: "pointsPerComment",
						label: "Points per approved comment",
						initial_value: String(opts.pointsPerComment),
					},
					{
						type: "text_input",
						action_id: "confirmPageUrl",
						label: "Confirm page path (blank = raw API link, e.g. /subscribe/confirm)",
						initial_value: opts.confirmPageUrl,
					},
					{
						type: "text_input",
						action_id: "unsubscribePageUrl",
						label: "Unsubscribe page path (blank = raw API link, e.g. /subscribe/unsubscribe)",
						initial_value: opts.unsubscribePageUrl,
					},
					{
						type: "repeater",
						action_id: "badgeThresholds",
						label: "Badge thresholds",
						item_label: "Badge",
						min_items: 1,
						fields: [
							{ type: "number_input", action_id: "count", label: "Comments required", min: 1 },
							{ type: "text_input", action_id: "label", label: "Badge label" },
						],
						initial_value: opts.badgeThresholds,
					},
				],
				submit: { label: "Save Settings", action_id: "save_settings" },
			},
		],
	};
}

async function saveSettings(ctx: PluginContext, values: Record<string, unknown>) {
	const current = await getOptions(ctx);
	if (typeof values.siteName === "string") await ctx.kv.set("settings:siteName", values.siteName);

	let digestHourUtc = current.digestHourUtc;
	if (typeof values.digestHourUtc === "string" || typeof values.digestHourUtc === "number") {
		const hour = Number(values.digestHourUtc);
		if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
			digestHourUtc = hour;
			await ctx.kv.set("settings:digestHourUtc", hour);
		}
	}

	let digestFrequency = current.digestFrequency;
	if (values.digestFrequency === "daily" || values.digestFrequency === "weekly") {
		digestFrequency = values.digestFrequency;
		await ctx.kv.set("settings:digestFrequency", digestFrequency);
	}

	let digestWeekday = current.digestWeekday;
	if (typeof values.digestWeekday === "string" || typeof values.digestWeekday === "number") {
		const weekday = Number(values.digestWeekday);
		if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
			digestWeekday = weekday;
			await ctx.kv.set("settings:digestWeekday", weekday);
		}
	}

	if (ctx.cron) {
		await ctx.cron.schedule(DIGEST_CRON_NAME, {
			schedule: buildDigestCronSchedule(digestHourUtc, digestFrequency, digestWeekday),
		});
	}

	if (typeof values.pointsPerComment === "string" || typeof values.pointsPerComment === "number") {
		const points = Number(values.pointsPerComment);
		if (Number.isFinite(points) && points >= 0) {
			await ctx.kv.set("settings:pointsPerComment", points);
		}
	}

	if (values.badgeThresholds !== undefined) {
		await ctx.kv.set("settings:badgeThresholds", sanitizeBadgeThresholds(values.badgeThresholds));
	}

	if (typeof values.confirmPageUrl === "string") {
		await ctx.kv.set("settings:confirmPageUrl", values.confirmPageUrl.trim());
	}
	if (typeof values.unsubscribePageUrl === "string") {
		await ctx.kv.set("settings:unsubscribePageUrl", values.unsubscribePageUrl.trim());
	}

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" },
	};
}
