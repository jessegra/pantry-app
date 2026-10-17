# Sync plan (milestone S, before recipes)

**Status: done (Oct 2026).** Steps 1-4 below are built, tested and live on pantry.jessegravenor.com.

Goal: the pantry lives on pantry.jessegravenor.com, with a full offline copy on each
device that syncs when it reconnects. One household password for now; a second named
user (e.g. a partner) is a later phase. Owner-approved order: sync, then recipes.

## Shape

- **Still local-first.** Every screen keeps reading and writing IndexedDB, so the app works
  identically offline. Sync runs underneath the repository; no screen changes except a
  Sync section in Settings → More (SPEC §7 anticipated this).
- **Server:** a small PHP 8.4 API in `/api/` on the same subdomain (same origin: no CORS),
  storing records in MySQL 5.7 on the existing hosting.
- **What syncs:** items, locations, groups, stores, list entries, staples, categories (and
  recipes later). Not synced: the Quick add activity log (per device), local settings.

## How changes travel

- **Outbox.** Dexie hooks on the synced tables record every create, update and delete in a
  local `outbox` table, and stamp `updatedAt`. The repository code doesn't change.
- **Deletes become tombstones** in the outbox and on the server, so other devices learn
  about them. (Locally, records are still removed.)
- **Push:** send the outbox in batches; the server keeps a record if it's newer than what
  it has. **Pull:** ask for everything changed since this device's last cursor (a server
  sequence number, so device clocks don't matter for "what's new"), apply it locally
  without re-queuing it.
- **Conflicts:** the newest change to a record wins (by `updatedAt`). Fine for a pantry: two
  phones rarely edit the same item at the same moment, and the next tap corrects it.
- **When:** on open, when the connection returns, when the app comes to the foreground,
  a couple of seconds after local changes, and every minute while open.

## Signing in

- The household password is set as a GitHub secret; the deploy stores only its hash on
  the server (never the password, never in chat). Changing it = update the secret and
  redeploy, which also signs every device out.
- Signing in on a device gets a long-lived random device token (stored hashed on the
  server), sent with each request over HTTPS. "Sign out" on a device, and "Sign out all
  devices" for a lost phone.
- Login attempts are rate-limited.

## First connection of a device

- **Server empty** (the first device): this device's data is uploaded. That's how your real
  data gets there: import your export into the new address, then connect.
- **Server already has data** (the second device): the device's own data (usually just
  the sample data) is replaced by the server's, after a confirmation that offers an export.

## UI (Settings → More → Sync)

- Not connected: "Keep this pantry on pantry.jessegravenor.com" + password field + Connect.
- Connected: "Synced 2 minutes ago" or "Offline: 3 changes waiting", Sync now, Sign out,
  Sign out all devices.
- A small status dot on the Settings tab only when something needs attention (offline
  with waiting changes for a long time, or signed out by a password change).

## Build steps (each ends with tests passing, like the main milestones)

1. **Server API + database:** schema, endpoints (sign in, push, pull, sign out), config
   written by the deploy from secrets, `.htaccess` keeping config and internals private.
   Tests run in CI against real PHP 8.4 + MySQL 5.7. A probe confirms PHP runs on the host.
2. **Sync engine in the app:** outbox hooks, push/pull, newest-wins merge, retry with
   back-off. Unit tests against a fake server.
3. **Sync UI** in Settings → More, first-connection flow.
4. **End-to-end:** two browsers syncing through the real PHP server in CI: an edit, a
   delete, and changes made offline arriving after reconnect.

## Needed from the owner

1. In the Network Solutions panel: create a **MySQL database** and a database user with
   full rights to it. Note the host name, database name, user and password.
2. Add GitHub secrets (same place as the SFTP ones):
   `PANTRY_DB_HOST`, `PANTRY_DB_NAME`, `PANTRY_DB_USER`, `PANTRY_DB_PASSWORD`, and
   `PANTRY_HOUSEHOLD_PASSWORD` (the password you'll type on each device).

## Later phases (not now)

- ~~Named users (a partner's own sign-in), still sharing one household pantry.~~ Done: docs/USERS_PLAN.md.
- Recipes, synced from the start.
