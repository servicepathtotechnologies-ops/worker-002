# 03 - Copy project and configure environment

## 1) Extract zip
Extract `worker_migration_YYYYMMDD.zip` to a path without spaces if possible.

Example:
`C:\dev\ctrlchecks\worker`

## 2) Open project
```powershell
cd C:\dev\ctrlchecks\worker
```

## 3) Install dependencies
```powershell
npm install
```

## 4) Create local `.env`
- Copy from `templates/ENV_TEMPLATE.env`
- Fill all required values from secure source

```powershell
Copy-Item NEW_LAPTOP_SETUP_GUIDE\templates\ENV_TEMPLATE.env .env
```

## 5) Prisma setup
```powershell
npx prisma generate
```

If database schema migrations are required in your environment:
```powershell
npm run prisma:migrate:deploy
```

## 6) Optional build sanity
```powershell
npm run type-check
npm run build
```
