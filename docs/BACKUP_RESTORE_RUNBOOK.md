# SukuuNova Backup & Restore Runbook

This runbook closes the application-side backup/restore readiness gap without exposing database recovery through the web application.

## Security model

- Backups are created with PostgreSQL `pg_dump` in custom format.
- The plaintext dump exists only in a temporary operating-system directory and is deleted when the command finishes.
- The retained dump is encrypted with AES-256-GCM.
- A manifest stores SHA-256 hashes for both the encrypted file and the decrypted PostgreSQL archive, plus the AES-GCM IV/authentication tag.
- `BACKUP_ENCRYPTION_KEY` must be kept in a secret manager separately from backup storage.
- Backup artifacts are excluded from Git by `.gitignore`.
- Restore verification refuses the source database fingerprint and refuses `DATABASE_URL`.
- Restore verification requires a separate, empty PostgreSQL database and never drops/cleans an existing schema.
- There is intentionally no school or platform web endpoint for database restore.

## Required operator software

The trusted operator host/container needs PostgreSQL client utilities compatible with the production PostgreSQL major version:

- `pg_dump`
- `pg_restore`
- `psql`

Node.js/tsx and the SukuuNova repository dependencies are also required.

## Encryption key

Set `BACKUP_ENCRYPTION_KEY` to exactly 32 random bytes encoded as either 64 hexadecimal characters or base64.

Example key generation:

```bash
openssl rand -hex 32
```

Do not save this key in the repository, backup folder, support ticket, screenshot, or school settings.

## Create an encrypted backup

Required environment:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_ENCRYPTION_KEY='...'
```

Optional destination (defaults to `./backups`):

```bash
export BACKUP_DIR='/secure/backup-staging'
```

Run:

```bash
npm run db:backup
```

The command creates two retained files with matching timestamps:

- `sukuunova-<timestamp>.dump.enc`
- `sukuunova-<timestamp>.manifest.json`

Move both files to durable off-host backup storage after creation. Keep the encryption key in a separate secret-management system.

## Restore verification drill

Create a separate empty PostgreSQL database for the drill. Do not point this command at production, staging, or any database containing tables.

Required environment:

```bash
export DATABASE_URL='postgresql://production-identity-used-only-for-safety-comparison/...'
export RESTORE_DATABASE_URL='postgresql://.../sukuunova_restore_drill'
export BACKUP_ENCRYPTION_KEY='...'
export BACKUP_MANIFEST='/secure/backups/sukuunova-<timestamp>.manifest.json'
```

Run:

```bash
npm run db:restore:verify
```

The verifier performs these checks in order:

1. Validate the manifest version and AES-GCM metadata.
2. Refuse the source database fingerprint recorded in the manifest.
3. Refuse the database identity currently configured as `DATABASE_URL`.
4. Verify the encrypted file SHA-256.
5. Confirm the restore target has zero public tables.
6. Decrypt into a temporary file.
7. Verify the decrypted PostgreSQL archive SHA-256.
8. Run `pg_restore --list` to validate the archive structure.
9. Restore with `--exit-on-error`, `--no-owner`, and `--no-privileges`.
10. Verify restored Prisma migration history and the core `School` table.

The drill database is left intact for operator inspection. Delete the drill database after validation according to the infrastructure provider's access/retention policy.

## Certification evidence

For each pilot or production recovery drill, record outside the database being backed up:

- backup timestamp;
- encrypted file + manifest object/version identifiers;
- backup command exit status;
- restore-drill target identifier;
- restore command exit status;
- migration count reported by the verifier;
- school count reported by the verifier;
- operator/reviewer identity;
- drill date and any remediation notes.

Do not copy raw database records, credentials, encryption keys, or full connection strings into support tickets or certification notes.

## Production restoration

`db:restore:verify` is deliberately **not** a production-restore command. A real production recovery must be performed by authorized infrastructure operators using the hosting provider's incident procedure, a maintenance window, an approved restore point, and a verified rollback plan. This repository command is for proving that encrypted backups are restorable before an incident occurs.
