# ATS Scan AI - Production MVP

This is a production-oriented MVP for an ATS scoring and resume analyzer SaaS.

## Features

- Email OTP login with JWT session
- Razorpay credit purchase flow
- Rs. 29 = 10 credits
- 1 resume analysis = 1 credit
- PDF/DOCX/TXT resume upload
- Supabase Storage resume saving
- Resume text extraction
- Gemini ATS scoring and detailed feedback
- Scan history and previous scan comparison
- Protected backend APIs

## Setup

1. Copy `.env.example` to `.env` and add fresh credentials.
2. Run the SQL in `supabase/schema.sql` inside Supabase SQL Editor.
3. Install dependencies:

```bash
npm install
```

4. Run locally:

```bash
npm run dev
```

Open `http://localhost:5000`.

## Production notes

Before launch, rotate all credentials that were ever pasted into chat or screenshots, use live Razorpay keys, use a real SMTP provider such as Brevo/SendGrid, configure a custom domain with HTTPS, and keep `.env` out of Git.
