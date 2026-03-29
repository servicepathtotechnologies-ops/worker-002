# 02 - Setup new laptop (Windows)

## 1) Install required software
- Git (latest stable)
- nvm-windows (recommended) + Node.js LTS 20.x
- VS Code + Cursor (if used)
- Optional: PostgreSQL tools / Supabase CLI / Docker Desktop (if your workflow needs them)

## 2) Configure Node runtime (recommended)
```powershell
nvm install 20
nvm use 20
node -v
```

## 3) Verify install
```powershell
git --version
node -v
npm -v
```

## 4) Configure terminal execution policy (if needed)
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 5) Optional developer tools
- Postman/Insomnia
- TablePlus/DBeaver
- Browser with dev tools enabled
