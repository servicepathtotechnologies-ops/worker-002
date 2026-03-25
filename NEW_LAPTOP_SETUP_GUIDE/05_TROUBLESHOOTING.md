# 05 - Troubleshooting

## npm install fails
- Delete lock and modules, reinstall:
```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
```

## Prisma client errors
```powershell
npx prisma generate
```
If schema mismatch:
```powershell
npm run prisma:migrate:deploy
```

## Port already in use
- Change `PORT` in `.env`
- Restart server

## CORS or frontend connection issues
- Verify `CORS_ORIGIN` and `ALLOWED_ORIGINS`
- Ensure frontend URL matches env settings

## API key / secret issues
- Re-check `.env` values from secure source
- Never paste secrets in public logs or screenshots

## TypeScript issues after migration
```powershell
npm run type-check
```
Fix reported issues before running production workloads.
