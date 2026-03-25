# 01 - Prepare old laptop (before zipping)

## 1) Clean the project
From `worker/`:

```powershell
npm run type-check
```

Optional cleanup before zip:

```powershell
Remove-Item -Recurse -Force node_modules, dist, coverage, logs, tmp -ErrorAction SilentlyContinue
```

## 2) Backup secrets safely
- Keep secrets in your password manager (recommended).
- Do not rely on copying plaintext `.env` over chat/email.
- If you must move `.env`, move it only via encrypted channel/device.

## 3) Export local context
Save these for easy restore:
- Current Node version: `node -v`
- Current npm version: `npm -v`
- Any custom ports or local URLs

## 4) Zip project
- Zip the whole `worker` folder
- Name example: `worker_migration_YYYYMMDD.zip`

## 5) Optional: keep a rollback copy
- Keep one untouched zip in cloud + one external drive copy.
