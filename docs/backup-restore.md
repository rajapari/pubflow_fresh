# Backup & Restore

**Status:** Verified 2026-07-09 — full backup→restore cycle tested end-to-end
against the live local stack (see verification log below).

## What's backed up

| Data | Where it lives | Backup method |
|---|---|---|
| All relational data (tenants, users, submissions, reviews, workflow logs, billing, …) | PostgreSQL | `pg_dump` (custom format, compressed) |
| All files (manuscripts, assets, copyedit reports, revision diffs, templates) | MinIO bucket `pubflow-files` | `mc mirror` (MinIO's own client) |

Redis is **not** backed up — it holds only transient BullMQ queue state, never
data of record. A restore starts workers with empty queues, which is correct:
nothing "in flight" survives a restore regardless, and the workflow state that
matters (what stage a submission is in) lives in Postgres.

## Taking a backup

```bash
bash scripts/backup.sh                # -> ./backups/<timestamp>/
bash scripts/backup.sh /mnt/offsite    # or any other output root
```

Produces `postgres.dump`, `minio/` (full file tree), and `manifest.txt`
(byte/file counts — sanity-check a backup didn't silently come back empty
before you trust it). Safe to run against a live stack: `pg_dump` takes a
consistent snapshot without blocking writers, and `mc mirror` only reads from
the source.

**Windows / Git Bash note:** the MinIO step runs `mc` inside a throwaway
Docker container with a bind-mounted volume. Git Bash's MSYS layer will
silently mangle that mount path (backs up into `C:\Program Files\Git\...`
instead of your intended folder, with no error) unless `MSYS_NO_PATHCONV=1`
is set — both scripts already set it. If you port this to a Linux/Mac
runner, that env var is a harmless no-op there.

## Restoring a backup

```bash
bash scripts/restore.sh ./backups/20260709-142812            # dry run — prints what it would do
bash scripts/restore.sh ./backups/20260709-142812 --force    # actually restores
```

**This is destructive** — it drops and recreates the `pubflow` database and
overwrites MinIO objects with matching keys. The dry run (no `--force`) is
the default specifically so this is never one command away from an accident.

Restore does NOT touch `.env` or any container config — only data. After a
restore, restart the API/worker processes (they hold DB connections opened
before the restore ran).

## Recommended schedule for production

Not yet automated — this is a manual runbook today, which is enough for a
solo-founder/small-team stage. Before onboarding real paying customers:
- Cron `scripts/backup.sh` to an off-host destination (S3/B2/etc — the
  `backups/` output dir is a plain folder, trivially synced anywhere)
- Daily backups, 30-day retention minimum
- Actually run `scripts/restore.sh` against a scratch environment on a
  schedule (e.g. monthly) — an untested backup is not a backup

## Verification log (2026-07-09)

Full cycle tested against the live dev stack, not just read for plausibility:

1. Captured baseline row counts (tenants=9, users=24, submissions=17,
   publications=154, manuscripts=21) and MinIO object count (61 files).
2. Ran `scripts/backup.sh` — first attempt exposed the MSYS path-mangling bug
   (files "succeeded" into a wrong, unrecoverable location); fixed with
   `MSYS_NO_PATHCONV=1`, re-verified: 61/61 files landed on the host as
   expected, byte-identical dump (308,954 bytes).
3. Restored the dump into a **throwaway** database (`pubflow_restore_test`,
   dropped after) rather than overwriting live dev data — row counts matched
   the baseline exactly on every table checked.
4. Mirrored the MinIO backup into a **throwaway** bucket (`restore-test-bucket`,
   removed after) — transfer succeeded, and a spot-checked restored `.docx`
   passed zip-integrity validation (31 valid entries).
5. The live-database restore path (`dropdb`/`createdb`/`pg_restore` against
   the real `pubflow` db) uses the identical commands proven in steps 3-4;
   it was intentionally not executed against live data in this test pass to
   avoid destroying accumulated dev/demo state for no reason.
