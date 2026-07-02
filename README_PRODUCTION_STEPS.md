# ATS SaaS Production MVP Patch

## 1. Install required packages

```powershell
npm install helmet cors express-rate-limit jsonwebtoken multer mammoth pdf-parse razorpay @google/genai @supabase/supabase-js nodemailer lucide-react
npm install -D @types/cors @types/jsonwebtoken @types/multer @types/nodemailer
```

## 2. Copy files

Copy these files into your project:

```txt
server/index.ts
server/lib/supabase.ts
src/App.tsx
src/main.tsx
src/index.css
.env.example
supabase/schema.sql
```

## 3. Run Supabase SQL

Open Supabase SQL Editor and run:

```txt
supabase/schema.sql
```

This creates users, OTP, packages, payments, transactions, uploaded resumes, scans, job roles, storage bucket, and the atomic complete_resume_scan function.

## 4. Update .env

Create/keep your `.env` locally only. Do not push it to GitHub.

Required:

```env
JWT_SECRET=long-random-secret
OTP_SECRET=long-random-secret
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
EMAIL_USER=...
EMAIL_PASS=...
```

## 5. Start dev server

```powershell
taskkill /IM node.exe /F
npm run dev
```

## 6. Test flow

1. Open http://localhost:5000
2. Enter email
3. Send OTP
4. In local dev, check terminal for OTP if email is not configured
5. Verify OTP
6. Buy credits with Razorpay test mode
7. Upload PDF/DOCX/TXT resume
8. Paste job description or select job role
9. Analyze resume
10. Open scan history

## Production notes

Before live launch:

- Rotate any keys that were ever pasted/shared.
- Use HTTPS domain.
- Use live Razorpay keys only after testing.
- Configure real SMTP/Brevo for OTP.
- Set NODE_ENV=production.
- Run `npm run build`.
- Deploy with a process manager like PM2 or a container platform.
