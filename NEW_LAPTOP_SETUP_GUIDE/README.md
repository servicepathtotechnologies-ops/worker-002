# New Laptop Migration Guide (CtrlChecks Worker)

This folder is your migration playbook when moving this project to a new laptop.

## Recommended order
1. `01_PREPARE_OLD_LAPTOP.md`
2. `02_SETUP_NEW_LAPTOP_WINDOWS.md`
3. `03_COPY_PROJECT_AND_CONFIG.md`
4. `04_FIRST_RUN_AND_VALIDATION.md`
5. `05_TROUBLESHOOTING.md`

## Important security note
- Do **not** store real secrets in this guide folder.
- Use `templates/ENV_TEMPLATE.env` as a placeholder file.
- On the new laptop, create a real `.env` manually from your secure password manager.

## What to zip
Zip the full `worker` folder (including this guide), but exclude heavy or machine-specific folders if possible:
- `node_modules/`
- `dist/`
- `coverage/`
- `logs/`
- `tmp/`

## Minimal migration checklist
- [ ] Git, Node.js, npm installed on new laptop
- [ ] Project copied and extracted
- [ ] `.env` created from secure secrets
- [ ] `npm install` completed
- [ ] `npx prisma generate` completed
- [ ] `npm run dev` starts successfully
- [ ] Health endpoint and one workflow smoke-test pass
