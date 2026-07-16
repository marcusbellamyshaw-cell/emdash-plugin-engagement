# emdash-plugin-engagement

**Currently not installable on a working site.** Confirmed on a real
production deploy (not just local dev): every public route this plugin
exposes (`subscribe`/`confirm`/`unsubscribe`/`leaderboard`) is broken by
two Emdash core bugs, filed and unfixed as of this writing —
[emdash-cms/emdash#2078](https://github.com/emdash-cms/emdash/issues/2078)
(`sandboxed: []` 401s every non-admin route) and
[emdash-cms/emdash#2079](https://github.com/emdash-cms/emdash/issues/2079)
(`plugins: []` trusted mode crashes any route touching `ctx.storage`/
`ctx.email`/etc.). Comment gamification and the new-post digest queue
(hooks, not routes) should still work, but there's no way to actually
subscribe or view the leaderboard until one of those lands upstream. Don't
install this yet — check the linked issues for status first.

Post-publish/reply email digests and comment-activity gamification (points,
badges, leaderboard) for [EmDash CMS](https://emdashcms.com) sites — the
retention mechanics most publishing platforms treat as table stakes
(Jetpack Subscriptions, Ghost's built-in newsletters, Discourse's trust
levels/badges), built as a plugin so it needs no core changes.

Needs no core changes. Built entirely on public plugin hooks
(`content:afterPublish`, `comment:afterCreate`, `comment:afterModerate`,
`cron`) and the `email:send` / `users:read` / `content:read` capabilities.

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
      plugins: [engagementPlugin()],
      // ...
    }),
  ],
};
```

**Use `plugins: [engagementPlugin()]` (trusted/in-process) for now, not
`sandboxed: [...]`.** Emdash's sandboxed-plugin loader only reads a route's
`public: true` flag from a marketplace/registry-installed bundle's manifest —
a plugin registered via `sandboxed: []` in `astro.config.mjs` never gets that
metadata populated, so every route but the implicit `admin` one falls back to
requiring authentication, breaking `subscribe`/`confirm`/`unsubscribe`/
`leaderboard` for anonymous readers. Filed upstream:
[emdash-cms/emdash#2078](https://github.com/emdash-cms/emdash/issues/2078).
Once that's fixed, `sandboxed: [engagementPlugin()]` should work and is the
better isolation story.

Requires `emdash >= 0.25.0` and an email provider configured (anything that
grants `email:send` capability delivery — see EmDash's email setup docs).

## Configure

After install, open the plugin's **Engagement Settings** page in the admin
(auto-registered under Plugins). You can set:

- Site name used in email subjects/bodies (defaults to your site's configured name)
- Digest send hour (UTC), frequency (daily or weekly), and weekly send day
- Points awarded per approved comment
- Badge thresholds (comments required + label per tier) — edit, add, or
  remove tiers directly on the settings page; defaults are "First Comment"
  (1), "Regular" (10), "Super Commenter" (50), "Legend" (200) from
  `src/badges.ts`

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

## Add friendly confirm/unsubscribe pages

Plugin routes only ever return JSON, so the raw `confirm`/`unsubscribe` API
links aren't something you'd want a reader to land on directly. Point the
email links at your own thin pages instead, and drop these components in:

```astro
---
// src/pages/subscribe/confirm.astro
import { ConfirmSubscription } from "emdash-plugin-engagement/astro";
---

<ConfirmSubscription />
```

```astro
---
// src/pages/subscribe/unsubscribe.astro
import { Unsubscribe } from "emdash-plugin-engagement/astro";
---

<Unsubscribe />
```

Both read the `token` query param client-side and call the plugin's
`confirm`/`unsubscribe` routes, replacing a status paragraph with the result.
They're intentionally unstyled — wrap them in your own page chrome.

Then set **Confirm page path** / **Unsubscribe page path** on the Engagement
Settings admin page to `/subscribe/confirm` / `/subscribe/unsubscribe` (or
wherever you placed them) so email links point at your pages instead of the
raw JSON API routes. Leave either blank to keep that one on the raw link.

## Routes

All under `/_emdash/api/plugins/engagement/`, all public (no auth required):

| Route | Method | Purpose |
|---|---|---|
| `subscribe` | POST | `{ email, scope: "posts"\|"thread", contentId? }` — starts the double opt-in flow |
| `confirm` | GET | `?token=` — confirms a pending subscription |
| `unsubscribe` | GET | `?token=` — removes a subscription (idempotent) |
| `leaderboard` | GET | `?limit=` (default 10, max 100) — top commenters by points |

## Known limitations (v0.2.0)

- Plugin routes still only return JSON (no HTML-response path in the
  current plugin route system) — the `ConfirmSubscription`/`Unsubscribe`
  components above are the workaround, not a core fix. If you don't wire up
  the page paths in settings, the raw links still show
  `{"data":{"status":"confirmed"}}`.
- Digest cadence is daily or weekly only; no arbitrary cron expression or
  immediate/instant option.

## License

MIT
