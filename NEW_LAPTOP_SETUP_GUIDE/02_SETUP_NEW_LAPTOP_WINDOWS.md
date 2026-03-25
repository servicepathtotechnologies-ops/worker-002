# 02 - Setup new laptop (Windows)

## 1) Install required software
- Git (latest stable)
- Node.js LTS (match old laptop major version)
- VS Code + Cursor (if used)
- Optional: PostgreSQL tools / Supabase CLI / Docker Desktop (if your workflow needs them)

## 2) Verify install
```powershell
git --version
node -v
npm -v
```

## 3) Configure terminal execution policy (if needed)
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 4) Recommended global tools
```powershell
npm i -g ts-node typescript
```

## 5) Optional developer tools
- Postman/Insomnia
- TablePlus/DBeaver
- Browser with dev tools enabled
