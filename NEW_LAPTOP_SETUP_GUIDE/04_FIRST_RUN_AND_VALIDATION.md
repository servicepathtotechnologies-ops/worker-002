# 04 - First run and validation

## 1) Start development server
```powershell
npm run dev
```

Expected: server starts without crash and reports listening port.

## 2) Health check
In another terminal:
```powershell
curl http://localhost:3001/health
```

Expected: healthy response JSON or OK message.

## 3) Core API smoke tests
- Generate workflow endpoint
- Execute workflow endpoint
- Form trigger submit endpoint

## 4) Runtime checks
- Run one workflow with If/Else
- Run one Slack workflow
- Confirm no missing env/credential errors for your expected setup

## 5) Final acceptance checklist
- [ ] `npm run dev` stable for 5+ min
- [ ] health endpoint works
- [ ] one workflow generate+execute works
- [ ] form trigger flow works
- [ ] logs do not show repeated fatal errors
