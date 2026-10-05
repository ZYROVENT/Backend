# Backend deployment notes

## Secure account, social, GCoins, and playtime operations

Configure `SUPABASE_SERVICE_ROLE_KEY` as a private environment variable in the
backend deployment (for example, Render) before deploying these backend changes
and running `supabase/migrations/20261005_secure_gcoins_gameplay.sql` in the
Supabase SQL Editor. Deploy the backend and migration together: registration,
OAuth account creation, profile changes, social operations, shop purchases,
rewards, and gameplay synchronization now use the authenticated backend's
service-role client. The migration blocks direct client writes to `users` and
direct client access to `friendships` and `messages`.

Never put this key in GLauncher, renderer code, or any public repository. The
launcher continues to authenticate with its account token; the backend derives
the user ID from that token and computes the elapsed playtime itself. The
affected endpoints return `503` until the service-role key is configured.

The gameplay heartbeat stores its last accepted timestamp in backend memory.
The first heartbeat establishes a baseline; subsequent heartbeats add at most 30
seconds each. If the backend restarts, it establishes a new baseline before
counting more time.
