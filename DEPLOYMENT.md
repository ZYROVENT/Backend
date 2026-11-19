# Backend deployment notes

## Secure account, social, GCoins, and playtime operations

Configure `SUPABASE_SERVICE_ROLE_KEY` as a private environment variable in the
backend deployment (for example, Render) before deploying these backend changes
and running `supabase/migrations/20261005_secure_gcoins_gameplay.sql` in the
Supabase SQL Editor. If you have already executed an earlier version of this
migration, run the updated SQL again; its schema changes are idempotent. It adds
the profile status and privacy columns used by the social APIs. Deploy the
backend and migration together: registration,
OAuth account creation, profile changes, social operations, shop purchases,
rewards, and gameplay synchronization now use the authenticated backend's
service-role client. The migration blocks direct client writes to `users` and
direct client access to `friendships` and `messages`.

Never put this key in GLauncher, renderer code, or any public repository. The
launcher continues to authenticate with its account token; the backend derives
the user ID from that token and computes the elapsed playtime itself. The
affected endpoints return `503` until the service-role key is configured.

Before deploying the level and inventory integration, run these migrations in
order in the Supabase SQL Editor:

1. `supabase/migrations/20261005_user_achievements.sql`
2. `supabase/migrations/20261005_secure_gcoins_gameplay.sql`
3. `supabase/migrations/20261006_player_progression.sql`
4. `supabase/migrations/20261007_cosmetic_catalog_equipment.sql`
5. `supabase/migrations/20261008_bubble_sticker_editor.sql`

The progression migration converts existing playtime (1 XP per minute) and
saved launcher achievements (25 XP each) once, then awards XP from server-side
gameplay heartbeats and newly inserted achievements. It also creates the
authoritative cosmetic inventory and atomic shop/reward claim RPCs. Deploy the
backend with the migration because `/api/progression/me`,
`/api/progression/rewards/claim`, `/api/user_info`, and shop purchases depend on
these tables and functions. Level-up rewards can be claimed from the web
dashboard or the launcher.

The gameplay heartbeat stores its last accepted timestamp in backend memory.
The first heartbeat establishes a baseline; subsequent heartbeats add at most 30
seconds each. If the backend restarts, it establishes a new baseline before
counting more time.

## Cosmetic catalog and equipment

`cosmetic_catalog` is the source of truth for store items. The launcher and web
dashboard fetch enabled entries from `/api/shop/cosmetics`; they do not ship a
hard-coded bubble list. `user_cosmetics` stores each account's owned items and
one equipped item per type (`bubble`, `nametag`, or `badge`). Users can manage
their inventory from the launcher store or the web dashboard.

An administrator can list all entries with `GET /api/admin/cosmetics`, add a
cosmetic with `POST /api/admin/cosmetics`, update it with
`PUT /api/admin/cosmetics/:itemId`, or retire it with
`DELETE /api/admin/cosmetics/:itemId` (soft-disable). These routes require an
authenticated account with administrator permissions. Example request:

```json
{
  "item_id": "bubble_example",
  "name": "Burbuja Ejemplo",
  "type": "bubble",
  "price": 125,
  "icon": "✨",
  "description": "Una burbuja nueva",
  "css_code": "background: linear-gradient(135deg, #121212, #5533aa); border: 2px solid #a88bff; border-radius: 16px; color: #ffffff; box-shadow: 0 0 12px #5533aa;"
}
```

`css_code` is CSS declarations only (no selector or surrounding braces). The
clients scope those properties to message bubbles and previews. For safety,
the backend and clients accept only visual properties such as backgrounds,
borders, colors, typography, and shadows; external URLs, imports, and arbitrary
selectors are rejected or ignored. The catalog write routes run on the backend
with its service-role key; never put that key in the future admin application.

Bubble stickers are stored in the public-read-only `cosmetic-stickers` Storage
bucket. Apply `20261008_bubble_sticker_editor.sql` before using the sticker
editor. An admin uploads PNG, JPEG, or WebP images (up to 5 MB) through
`POST /api/admin/cosmetics/:itemId/sticker`; the backend validates and
normalizes each image to WebP before saving it. Sticker position, size, and
rotation are persisted in `cosmetic_catalog.sticker_config` and included in
catalog and inventory responses. The web dashboard and launcher use that
shared configuration when drawing equipped bubbles and previews.
