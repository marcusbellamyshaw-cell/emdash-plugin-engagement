# emdash-plugin-engagement

Post-publish/reply email digests and comment-activity gamification (points,
badges, leaderboard) for [EmDash CMS](https://emdashcms.com) sites — the
retention mechanics most publishing platforms treat as table stakes
(Jetpack Subscriptions, Ghost's built-in newsletters, Discourse's trust
levels/badges), built as a plugin so it needs no core changes.

Needs no core changes. Built entirely on public plugin hooks
(`content:afterPublish`, `comment:afterCreate`, `comment:afterModerate`,
`cron`) and the `email:send` / `users:read` capabilities.

## What it does

- **New-post digest.** Readers subscribe once; a daily email lists everything
  published since the last digest. Skipped entirely on quiet days — no post,
  no email.
- **Reply notifications.** Readers can subscribe to a specific comment thread
  and get an immediate email when someone replies.
- **Comment gamification.** Every approved, identified (logged-in) comment
  earns points and can unlock badges ("First Comment", "Regular", "Super
  Commenter", "Legend" by default, or your own thresholds). A public
  leaderboard route exposes the top commenters.
- All subscriptions are double opt-in (a confirmation email is sent before
  anything is delivered) and every email carries an unsubscribe link.

## Install

```bash
npm install emdash-plugin-engagement
```

```js
// astro.config.mjs
import { engagementPlugin } from "emdash-plugin-engagement";

export default {
  integrations: [
    emdash({
      sandboxed: [engagementPlugin()],
      // ...
    }),
  ],
};
```

`sandboxed` (recommended) runs the plugin in an isolate, same trust model as
any other third-party plugin. `plugins: [engagementPlugin()]` also works if
you'd rather run it in-process.

Requires `emdash >= 0.25.0` and an email provider configured (anything that
grants `email:send` capability delivery — see EmDash's email setup docs).

## Configure

After install, open the plugin's **Engagement Settings** page in the admin
(auto-registered under Plugins). You can set:

- Site name used in email subjects/bodies (defaults to your site's configured name)
- Daily digest send hour (UTC)
- Points awarded per approved comment

Badge thresholds are code-level only for now (see `src/badges.ts`) — pass a
custom list via `settings:badgeThresholds` in the plugin's KV store if you
need different tiers than the defaults.

## Add the subscribe UI

The plugin ships a small, dependency-free Astro component. Drop it next to
your `<Comments>` component:

```astro
---
import { SubscribeForm } from "emdash-plugin-engagement/astro";
---

<SubscribeForm scope="posts" />
<!-- or, per-post reply notifications: -->
<SubscribeForm scope="thread" contentId={post.id} />
```

It posts to the plugin's own API and needs no props beyond `scope` (and
`contentId` for `scope="thread"`).

## Routes

All under `/_emdash/api/plugins/engagement/`, all public (no auth required):

| Route | Method | Purpose |
|---|---|---|
| `subscribe` | POST | `{ email, scope: "posts"\|"thread", contentId? }` — starts the double opt-in flow |
| `confirm` | GET | `?token=` — confirms a pending subscription |
| `unsubscribe` | GET | `?token=` — removes a subscription (idempotent) |
| `leaderboard` | GET | `?limit=` (default 10, max 100) — top commenters by points |

## Known limitations (v0.1.0)

- `confirm`/`unsubscribe` links return raw JSON (all plugin routes do —
  there's no HTML-response path in the current plugin route system). Clicking
  the email link shows `{"data":{"status":"confirmed"}}` rather than a
  friendly page. Build your own thin confirmation page against these routes
  if you want nicer UX; the API itself is enough to build on.
- Badge thresholds aren't yet admin-configurable through the settings UI
  (KV-settable only, see above).
- The digest is daily-only; no immediate/weekly option yet.

## License

MIT
