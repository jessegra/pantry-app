# People plan: a second user

Status: built (Oct 2026), all four steps.

Goal: the owner's partner gets their own sign-in to the same household pantry. Owner
decisions (Oct 2026):

- **Invite from a phone.** Settings → More → Sync → People → **Invite someone**: type a
  name, get a one-time code (24 hours). On the new person's phone: Sync → **I have an invite code**,
  enter it, pick their own password. No passwords in GitHub or chat.
- **Name + password** to sign in. The household password (the `PANTRY_HOUSEHOLD_PASSWORD`
  secret) becomes the first person's password, so signed-in devices stay signed in.
  That person starts out named "Owner" and can rename themselves.
- **Everyone can manage people**: invite, rename, sign someone's devices out, give
  someone a new sign-in code (a forgotten password), remove someone (not yourself, never
  the last person).
- **Who did it**: everything stays shared (one pantry, list, recipe book). List entries
  show "Added by Kim"; an item shows "Changed 2 hours ago by Kim". Only once there are
  two or more people, and "you" for your own.

## Added after (Oct 2026, owner request)

- **Show password** (eye button) on every password field.
- **Forgot your password?** on the sign-in form explains the way back: a sign-in code.
- **Get a sign-in code for yourself** (People → your name), from a device you're signed in
  on: use it on another device to choose a new password. A code you make for yourself
  leaves your other devices signed in; one someone else makes signs them out (that one is
  for when you've lost access). "I have a code" covers invites and sign-in codes.

## Server

- `users` (id, name unique, password_hash, from_config, created_at). Created on first
  use from the config hash. `devices.user_id` ties each device to a person; existing
  devices become the first person's.
- `invites` (code_hash, name or user_id, created_by, expires_at). Codes are 8 letters
  and digits (no look-alikes), shown as `ABCD-EFGH`, stored hashed, single use. Bad
  codes count toward the same 10-per-15-minutes limit as bad passwords.
- Changing `PANTRY_HOUSEHOLD_PASSWORD` now resets only the first person's password and
  signs out only their devices (the recovery path if that password is forgotten).
- Passwords chosen in the app: at least 8 characters.
- Routes: `POST /login {name, password, device}` (a name that matches no one falls back
  to checking the password against everyone: older app versions send no name),
  `GET /me`, `POST /invite`, `POST /join`, `POST /people/code`, `POST /people/rename`,
  `POST /people/sign-out`, `POST /people/remove`. `logout-all` still signs out every
  device of everyone (a lost phone).

## App

- Sign-in form: Your name, Password, Name for this device; or **I have an invite code**:
  code, new password, device name.
- **People** list under Sync: each person, their devices, last seen; Invite someone; per
  person Rename / New sign-in code / Sign out their devices / Remove.
- Each local write is stamped with the signed-in person's id (`updatedBy`, and
  `createdBy` on new records), by the same database hooks that mark changes for sync.
  Names come from `/me`, refreshed on each sync.

## Steps

1. Server: tables, bootstrap, routes; the fake server to match; contract tests for both.
2. Engine: sign in with a name, join with a code, people, stamping writes.
3. Settings: sign-in / join forms, People list with invite and management.
4. "Added by" / "Changed by" notes; two-phone e2e through an invite.
