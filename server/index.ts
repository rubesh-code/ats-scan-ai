import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import multer from "multer";
import mammoth from "mammoth";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import {
  getSupabaseConfigHint,
  isSupabaseConfigured,
  supabase,
} from "./lib/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buffer: Buffer
) => Promise<{ text: string }>;

const MAX_SCAN_HISTORY_PER_USER = 10;

type AuthUser = {
  id: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    const allowedExtensions = [".pdf", ".docx", ".txt"];

    const isAllowed =
      allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype);

    if (!isAllowed) {
      cb(new Error("Only PDF, DOCX, and TXT resume files are allowed."));
      return;
    }

    cb(null, true);
  },
});

function requireSupabase(res: express.Response) {
  if (!supabase || !isSupabaseConfigured()) {
    res.status(503).json({
      error: "Supabase is not configured.",
      hint: getSupabaseConfigHint(),
    });
    return false;
  }

  return true;
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing in .env`);
  }

  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "Unknown error");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashOtp(email: string, otp: string) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || "dev-secret";

  return crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${otp}:${secret}`)
    .digest("hex");
}

function buildOtpEmailHtml(otp: string) {
  return `
    <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px;">
        <div style="font-size: 14px; font-weight: 700; color: #2563eb; letter-spacing: 0.08em; text-transform: uppercase;">
          ATS Scan AI
        </div>

        <h2 style="margin: 14px 0 8px; color: #0f172a;">Your verification code</h2>

        <p style="margin: 0 0 18px; color: #475569;">
          Use this OTP to sign in to your ATS Scan AI account.
        </p>

        <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px; text-align: center;">
          ${otp}
        </div>

        <p style="margin: 18px 0 0; color: #64748b; font-size: 14px;">
          This code expires in 5 minutes. If you did not request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

async function sendOtpEmail(email: string, otp: string) {
  const smtpHost = process.env.SMTP_HOST || "smtp.sendgrid.net";
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  const smtpUser = process.env.SMTP_USER || "apikey";
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  if (!smtpPass || !emailFrom) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV OTP] ${email}: ${otp}`);
      return;
    }

    throw new Error(
      "Email provider is not configured. Set SMTP_PASS and EMAIL_FROM in production."
    );
  }

  const nodemailer = await import("nodemailer");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: emailFrom,
    to: email,
    subject: "Your ATS Scan AI OTP",
    text: `Your ATS Scan AI verification code is ${otp}. It expires in 5 minutes.`,
    html: buildOtpEmailHtml(otp),
  });
}


function signToken(user: AuthUser) {
  const secret = requireEnv("JWT_SECRET");
  return jwt.sign(user, secret, { expiresIn: "7d" });
}

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({
        error: "Authentication token is required.",
      });
    }

    const decoded = jwt.verify(token, requireEnv("JWT_SECRET")) as AuthUser;

    if (!decoded.id || !decoded.email) {
      return res.status(401).json({
        error: "Invalid authentication token.",
      });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired authentication token.",
    });
  }
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return null;

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function requireRazorpay(res: express.Response) {
  const client = getRazorpay();

  if (!client) {
    res.status(503).json({
      error:
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
    });
    return null;
  }

  return client;
}

function requireGemini(res: express.Response) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(503).json({
      error: "Gemini is not configured. Set GEMINI_API_KEY in .env.",
    });
    return null;
  }

  return new GoogleGenAI({ apiKey });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiErrorText(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function generateWithGeminiRetry(ai: GoogleGenAI, prompt: string) {
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError: unknown = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Gemini] Trying model=${model}, attempt=${attempt}`);

        return await ai.models.generateContent({
          model,
          contents: prompt,
        });
      } catch (error: unknown) {
        lastError = error;

        const message = getGeminiErrorText(error);

        const isTemporary =
          message.includes("503") ||
          message.includes("UNAVAILABLE") ||
          message.toLowerCase().includes("high demand") ||
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED");

        console.warn(
          `[Gemini retry] model=${model}, attempt=${attempt}, temporary=${isTemporary}, error=${message}`
        );

        if (!isTemporary) {
          throw error;
        }

        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed after retries.");
}

function extractJsonFromText(text: string) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Gemini did not return valid JSON.");
  }

  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function limitText(value: unknown, maxLength = 700) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength)}...`;
}

function normalizeAtsAnalysis(raw: any, previousScans: any[]) {
  const latestPreviousScore =
    previousScans.length > 0 ? Number(previousScans[0]?.score || 0) : null;

  const previousScores = previousScans
    .map((scan) => Number(scan.score))
    .filter((score) => !Number.isNaN(score));

  const previousBestScore =
    previousScores.length > 0 ? Math.max(...previousScores) : null;

  const rawScore = Number(raw?.ats_score);

  const safeScore =
    Number.isNaN(rawScore) || rawScore < 0 || rawScore > 100
      ? 0
      : Math.round(rawScore);

  const historyComparison = raw?.history_comparison || {};

  return {
    ats_score: safeScore,
    resume_summary: String(raw?.resume_summary || ""),
    matched_skills: normalizeStringArray(raw?.matched_skills),
    missing_skills: normalizeStringArray(raw?.missing_skills),
    missing_keywords: normalizeStringArray(raw?.missing_keywords),
    experience_match: String(raw?.experience_match || ""),
    education_match: String(raw?.education_match || ""),
    formatting_issues: normalizeStringArray(raw?.formatting_issues),
    improvement_suggestions: normalizeStringArray(raw?.improvement_suggestions),
    better_bullet_points: normalizeStringArray(raw?.better_bullet_points),
    final_recommendation: String(raw?.final_recommendation || ""),
    history_comparison: {
      has_previous_scans: previousScans.length > 0,
      previous_best_score: previousBestScore,
      latest_previous_score: latestPreviousScore,
      score_change_from_latest:
        latestPreviousScore === null ? null : safeScore - latestPreviousScore,
      score_change_from_best:
        previousBestScore === null ? null : safeScore - previousBestScore,
      improved_areas: normalizeStringArray(historyComparison.improved_areas),
      repeated_issues: normalizeStringArray(historyComparison.repeated_issues),
      new_issues: normalizeStringArray(historyComparison.new_issues),
      progress_summary: String(historyComparison.progress_summary || ""),
    },
  };
}

function buildPreviousScanContext(previousScans: any[]) {
  return {
    has_previous_scans: previousScans.length > 0,
    previous_scans_summary: previousScans.slice(0, 5).map((scan) => ({
      scan_id: scan.id,
      date: scan.date,
      filename: scan.filename,
      score: scan.score,
      type: scan.type,
      resume_summary: limitText(scan.result_data?.resume_summary),
      missing_keywords: normalizeStringArray(scan.result_data?.missing_keywords).slice(0, 12),
      missing_skills: normalizeStringArray(scan.result_data?.missing_skills).slice(0, 12),
      formatting_issues: normalizeStringArray(scan.result_data?.formatting_issues).slice(0, 12),
      improvement_suggestions: normalizeStringArray(
        scan.result_data?.improvement_suggestions
      ).slice(0, 12),
      final_recommendation: limitText(scan.result_data?.final_recommendation),
    })),
  };
}

function buildAtsPrompt(params: {
  resumeText: string;
  jobDescriptionOrRole: string;
  analysisType: string;
  previousScanContext: any;
}) {
  const { resumeText, jobDescriptionOrRole, analysisType, previousScanContext } =
    params;

  return `
You are an expert ATS resume reviewer.

Analyze the CURRENT resume against the CURRENT job description or selected job type.

Important rules:
- The ats_score must be based ONLY on the current resume and current job description/job type.
- Previous scans are only for comparison and progress review.
- Do not increase or decrease the current ats_score only because of old scans.
- Use old scans to explain improvement, repeated issues, new issues, and score change.
- Return ONLY valid JSON. No markdown. No backticks. No explanation outside JSON.

Required JSON shape:
{
  "ats_score": number,
  "resume_summary": string,
  "matched_skills": string[],
  "missing_skills": string[],
  "missing_keywords": string[],
  "experience_match": string,
  "education_match": string,
  "formatting_issues": string[],
  "improvement_suggestions": string[],
  "better_bullet_points": string[],
  "final_recommendation": string,
  "history_comparison": {
    "has_previous_scans": boolean,
    "previous_best_score": number | null,
    "latest_previous_score": number | null,
    "score_change_from_latest": number | null,
    "score_change_from_best": number | null,
    "improved_areas": string[],
    "repeated_issues": string[],
    "new_issues": string[],
    "progress_summary": string
  }
}

Scoring rules:
- ats_score must be from 0 to 100.
- Focus on ATS keyword match, role fit, missing skills, missing keywords, formatting, measurable achievements, readability, and clarity.
- Suggestions must be specific and useful.

Analysis type:
${analysisType}

Current job description or job type:
${jobDescriptionOrRole.slice(0, 12000)}

Previous scan history:
${JSON.stringify(previousScanContext, null, 2)}

Current resume:
${resumeText.slice(0, 60000)}
`;
}

function limitList(value: unknown, maxItems: number, maxLength = 400) {
  return normalizeStringArray(value)
    .map((item) => limitText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function limitLine(value: unknown, maxLength = 160) {
  return limitText(value, maxLength);
}

function normalizeRewrittenResume(raw: any) {
  const experience = Array.isArray(raw?.experience) ? raw.experience : [];
  const projects = Array.isArray(raw?.projects) ? raw.projects : [];
  const education = Array.isArray(raw?.education) ? raw.education : [];
  const skillGroups = Array.isArray(raw?.skill_groups) ? raw.skill_groups : [];

  return {
    full_name: limitLine(raw?.full_name, 90),
    headline: limitLine(raw?.headline, 110),
    location: limitLine(raw?.location, 90),
    email: limitLine(raw?.email, 120),
    phone: limitLine(raw?.phone, 40),
    links: limitList(raw?.links, 5, 160),
    summary: limitText(raw?.summary, 900),
    skill_groups: skillGroups.slice(0, 6).map((group: any) => ({
      label: limitLine(group?.label, 60),
      items: limitList(group?.items, 24, 60),
    })),
    experience: experience.slice(0, 8).map((role: any) => ({
      role: limitLine(role?.role, 110),
      company: limitLine(role?.company, 110),
      location: limitLine(role?.location, 80),
      period: limitLine(role?.period, 60),
      bullets: limitList(role?.bullets, 6, 320),
    })),
    projects: projects.slice(0, 6).map((project: any) => ({
      name: limitLine(project?.name, 110),
      period: limitLine(project?.period, 60),
      bullets: limitList(project?.bullets, 4, 320),
    })),
    education: education.slice(0, 5).map((entry: any) => ({
      degree: limitLine(entry?.degree, 120),
      institution: limitLine(entry?.institution, 120),
      location: limitLine(entry?.location, 80),
      period: limitLine(entry?.period, 60),
    })),
    certifications: limitList(raw?.certifications, 10, 160),
    achievements: limitList(raw?.achievements, 8, 240),
    todo_notes: limitList(raw?.todo_notes, 8, 220),
  };
}

function buildResumeRewritePrompt(params: {
  resumeText: string;
  jobDescriptionOrRole: string;
  analysis: any;
  selectedSuggestions: string[];
}) {
  const { resumeText, jobDescriptionOrRole, analysis } = params;

  const gaps = {
    missing_skills: normalizeStringArray(analysis?.missing_skills).slice(0, 20),
    missing_keywords: normalizeStringArray(analysis?.missing_keywords).slice(0, 20),
    formatting_issues: normalizeStringArray(analysis?.formatting_issues).slice(0, 12),
    improvement_suggestions: normalizeStringArray(
      analysis?.improvement_suggestions
    ).slice(0, 12),
  };

  return `
You are an expert resume writer who rewrites resumes so they parse cleanly in
applicant tracking systems.

Rewrite the CURRENT resume below into a structured, ATS-friendly resume aimed at
the target role.

Absolute rules:
- Use ONLY facts that appear in the original resume.
- Never invent or alter employers, job titles, dates, degrees, certifications,
  locations, or numbers. If the original has no metric, do not create one.
- You may reorder, regroup, retitle sections, tighten wording, and use stronger
  action verbs.
- Add a keyword from the target role ONLY when the original resume already shows
  that experience. Otherwise put it in todo_notes for the candidate to consider.
- If a field is not present in the original, return an empty string or empty array.
- Plain text only. No markdown, no bullet characters, no emojis, no backticks.
- Write bullets as complete achievement statements, at most 6 per role.
- Return ONLY valid JSON. No explanation outside the JSON.

Required JSON shape:
{
  "full_name": string,
  "headline": string,
  "location": string,
  "email": string,
  "phone": string,
  "links": string[],
  "summary": string,
  "skill_groups": [{ "label": string, "items": string[] }],
  "experience": [{ "role": string, "company": string, "location": string, "period": string, "bullets": string[] }],
  "projects": [{ "name": string, "period": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "location": string, "period": string }],
  "certifications": string[],
  "achievements": string[],
  "todo_notes": string[]
}

Notes on specific fields:
- headline: the target job title, matching the posting wording, only if the
  candidate's experience supports it.
- summary: 2 to 4 sentences, written in third person without pronouns.
- skill_groups: group related skills, for example Languages, Frameworks, Tools.
- todo_notes: short instructions to the candidate about what only they can add,
  such as a missing metric or a genuinely missing skill.

Target job description or job type:
${jobDescriptionOrRole.slice(0, 12000)}

Gaps found in the previous ATS analysis:
${JSON.stringify(gaps, null, 2)}

${
  params.selectedSuggestions.length > 0
    ? `The candidate explicitly asked you to apply these suggestions. Work each one
into the rewrite wherever their existing experience supports it. If one cannot be
applied truthfully, leave it out of the resume and explain why in todo_notes:
${JSON.stringify(params.selectedSuggestions, null, 2)}`
    : `The candidate did not pick specific suggestions. Apply your own judgement,
staying inside the rules above.`
}

Current resume:
${resumeText.slice(0, 60000)}
`;
}

async function parsePdf(buffer: Buffer) {
  const result = await pdfParse(buffer);
  return result.text || "";
}

async function extractResumeTextFromFile(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".txt" || file.mimetype === "text/plain") {
    return file.buffer.toString("utf8");
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }

  if (ext === ".pdf") {
    return parsePdf(file.buffer);
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT.");
}

function getSafeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function uploadResumeToStorage(params: {
  userId: string;
  file: Express.Multer.File;
  extractedText: string;
}) {
  const { userId, file, extractedText } = params;
  const db = supabase! as any;

  const safeName = getSafeFileName(file.originalname);
  const filePath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await db.storage
    .from("resumes")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      `Resume storage upload failed: ${uploadError.message}. Make sure the Supabase storage bucket named "resumes" exists.`
    );
  }

  const { data: resume, error: resumeError } = await db
    .from("uploaded_resumes")
    .insert([
      {
        user_id: userId,
        file_url: filePath,
        file_name: safeName,
        file_type: file.mimetype,
        extracted_text: extractedText,
      },
    ])
    .select()
    .single();

  if (resumeError) throw resumeError;

  return resume;
}

function looksLikeResumeDocument(text: string) {
  const normalized = text.toLowerCase();

  const obviousNonResumeSignals = [
    "===== ram memory =====",
    "===== disk space =====",
    "===== biggest ram using processes =====",
    "===== biggest cpu using processes =====",
    "===== running services =====",
    "===== enabled services at boot =====",
    "filesystem",
    "mounted on",
    "ps aux",
    "systemctl list-units",
    "systemctl list-unit-files",
    "ubuntu@",
    "/var/www/",
    "php artisan",
    "nginx.service",
    "redis-server.service",
    "amazon-cloudwatch-agent",
    "codedeploy-agent",
    "tmpfs",
    "swap:",
    "mem:",
  ];

  if (obviousNonResumeSignals.some((signal) => normalized.includes(signal))) {
    return false;
  }

  const resumeSignals = [
    "resume",
    "curriculum vitae",
    "professional summary",
    "career objective",
    "work experience",
    "professional experience",
    "employment history",
    "experience",
    "education",
    "skills",
    "technical skills",
    "projects",
    "certifications",
    "achievements",
    "responsibilities",
    "frontend",
    "backend",
    "developer",
    "engineer",
    "manager",
    "intern",
  ];

  let signalCount = 0;

  for (const signal of resumeSignals) {
    if (normalized.includes(signal)) {
      signalCount += 1;
    }
  }

  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const hasPhone = /(\+?\d[\d\s().-]{8,}\d)/.test(text);
  const hasYear = /\b(19|20)\d{2}\b/.test(text);

  if (signalCount >= 2) return true;
  if (signalCount >= 1 && (hasEmail || hasPhone || hasYear)) return true;

  return false;
}

async function cleanupOldScanHistory(db: any, userId: string) {
  try {
    const { data: userScans, error: userScansError } = await db
      .from("scans")
      .select("id, resume_id")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (userScansError) {
      console.warn("[Scan cleanup] Could not load scans:", userScansError);
      return;
    }

    const oldScans = (userScans || []).slice(MAX_SCAN_HISTORY_PER_USER);

    if (oldScans.length === 0) {
      return;
    }

    const oldScanIds = oldScans
      .map((scan: { id?: string }) => scan.id)
      .filter(Boolean);

    const oldResumeIds = oldScans
      .map((scan: { resume_id?: string | null }) => scan.resume_id)
      .filter(Boolean);

    if (oldScanIds.length > 0) {
      const { error: deleteScansError } = await db
        .from("scans")
        .delete()
        .eq("user_id", userId)
        .in("id", oldScanIds);

      if (deleteScansError) {
        console.warn("[Scan cleanup] Could not delete old scans:", deleteScansError);
      }
    }

    if (oldResumeIds.length > 0) {
      const { data: oldResumes, error: oldResumesError } = await db
        .from("uploaded_resumes")
        .select("id, file_url")
        .eq("user_id", userId)
        .in("id", oldResumeIds);

      if (!oldResumesError && oldResumes && oldResumes.length > 0) {
        const filePaths = oldResumes
          .map((resume: { file_url?: string }) => resume.file_url)
          .filter(Boolean);

        if (filePaths.length > 0) {
          const { error: storageDeleteError } = await db.storage
            .from("resumes")
            .remove(filePaths);

          if (storageDeleteError) {
            console.warn(
              "[Scan cleanup] Could not delete old resume files:",
              storageDeleteError
            );
          }
        }

        const { error: deleteResumesError } = await db
          .from("uploaded_resumes")
          .delete()
          .eq("user_id", userId)
          .in("id", oldResumeIds);

        if (deleteResumesError) {
          console.warn(
            "[Scan cleanup] Could not delete old uploaded resume rows:",
            deleteResumesError
          );
        }
      }
    }
  } catch (error) {
    console.warn("[Scan cleanup] Failed:", error);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 5000;
  const distDir = path.join(rootDir, "dist");

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin:
        (process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN)
          ?.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean) || true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "ATS Scan AI Server is running",
    });
  });

  app.get("/api/supabase/health", async (_req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    const { error } = await db
      .from("users")
      .select("id", { head: true, count: "exact" });

    if (error) {
      return res.status(503).json({
        status: "error",
        message: "Supabase connection failed",
        detail: error.message,
        hint: "Run supabase/schema.sql first.",
      });
    }

    return res.json({
      status: "ok",
      message: "Supabase connected",
      config: getSupabaseConfigHint(),
    });
  });

  app.post("/api/auth/send-otp", authLimiter, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;
    const email = normalizeEmail(String(req.body.email || ""));

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Valid email is required.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    try {
      const { error } = await db.from("otp_codes").insert([
        {
          email,
          otp_hash: hashOtp(email, otp),
          expires_at: expiresAt,
          verified: false,
          attempts: 0,
        },
      ]);

      if (error) throw error;

      await sendOtpEmail(email, otp);

      return res.json({
        status: "ok",
        message: "OTP sent successfully.",
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.post("/api/auth/verify-otp", authLimiter, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;
    const email = normalizeEmail(String(req.body.email || ""));
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP are required.",
      });
    }

    try {
      const { data: otpRow, error: otpError } = await db
        .from("otp_codes")
        .select("*")
        .eq("email", email)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError) throw otpError;

      if (!otpRow) {
        return res.status(400).json({
          error: "OTP expired or not found.",
        });
      }

      if (otpRow.attempts >= 5) {
        return res.status(429).json({
          error: "Too many OTP attempts. Please request a new OTP.",
        });
      }

      const valid = otpRow.otp_hash === hashOtp(email, otp);

      if (!valid) {
        await db
          .from("otp_codes")
          .update({
            attempts: Number(otpRow.attempts || 0) + 1,
          })
          .eq("id", otpRow.id);

        return res.status(400).json({
          error: "Invalid OTP.",
        });
      }

      await db.from("otp_codes").update({ verified: true }).eq("id", otpRow.id);

      const { data: existingUser, error: userFetchError } = await db
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (userFetchError) throw userFetchError;

      let user = existingUser;

      if (!user) {
        const { data: newUser, error: insertError } = await db
          .from("users")
          .insert([
            {
              email,
              name: email.split("@")[0],
              credits: 0,
            },
          ])
          .select()
          .single();

        if (insertError) throw insertError;

        user = newUser;
      }

      const token = signToken({
        id: user.id,
        email: user.email,
      });

      return res.json({
        status: "ok",
        message: "Login successful.",
        token,
        user,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/user/profile", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    try {
      const { data: user, error } = await db
        .from("users")
        .select("id, name, email, credits, total_scans, avg_score, created_at, updated_at")
        .eq("id", req.user!.id)
        .single();

      if (error || !user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      return res.json(user);
    } catch (error: unknown) {
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/credits/balance", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    const { data: user, error } = await db
      .from("users")
      .select("credits, total_scans, avg_score")
      .eq("id", req.user!.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    return res.json({
      available_credits: user.credits,
      used_credits: user.total_scans,
      total_scans: user.total_scans,
      avg_score: user.avg_score,
    });
  });

  app.get("/api/credit-packages", async (_req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    try {
      const { data, error } = await db
        .from("credit_packages")
        .select("*")
        .eq("status", "active")
        .order("price_inr", { ascending: true });

      if (error) throw error;

      return res.json(data || []);
    } catch (error: unknown) {
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/job-roles", async (_req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    try {
      const { data, error } = await db
        .from("job_roles")
        .select("*")
        .eq("status", "active")
        .order("role_name", { ascending: true });

      if (error) throw error;

      return res.json(data || []);
    } catch (error: unknown) {
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.post("/api/payment/create-order", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const razorpay = requireRazorpay(res);
    if (!razorpay) return;

    const db = supabase! as any;
    const { package_id } = req.body;

    if (!package_id) {
      return res.status(400).json({
        error: "package_id is required.",
      });
    }

    try {
      const { data: creditPackage, error: packageError } = await db
        .from("credit_packages")
        .select("*")
        .eq("id", package_id)
        .eq("status", "active")
        .single();

      if (packageError || !creditPackage) {
        return res.status(404).json({
          error: "Credit package not found.",
        });
      }

      const order = await razorpay.orders.create({
        amount: creditPackage.price_inr * 100,
        currency: "INR",
        receipt: `credits_${Date.now()}`,
        notes: {
          user_id: req.user!.id,
          package_id,
          email: req.user!.email,
        },
      });

      const { data: payment, error: paymentError } = await db
        .from("payments")
        .insert([
          {
            user_id: req.user!.id,
            package_id,
            razorpay_order_id: order.id,
            amount_inr: creditPackage.price_inr,
            credits: creditPackage.credits,
            status: "created",
          },
        ])
        .select()
        .single();

      if (paymentError) throw paymentError;

      return res.json({
        status: "ok",
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
        package: creditPackage,
        payment,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.post("/api/payment/verify", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error:
          "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
      });
    }

    try {
      const { data: payment, error: paymentFetchError } = await db
        .from("payments")
        .select("*")
        .eq("razorpay_order_id", razorpay_order_id)
        .eq("user_id", req.user!.id)
        .single();

      if (paymentFetchError || !payment) {
        return res.status(404).json({
          error: "Payment record not found.",
        });
      }

      if (payment.status === "paid") {
        return res.json({
          status: "ok",
          message: "Payment already verified.",
          credits_added: 0,
        });
      }

      const body = `${razorpay_order_id}|${razorpay_payment_id}`;

      const expectedSignature = crypto
        .createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        await db
          .from("payments")
          .update({
            status: "failed",
            razorpay_payment_id,
            razorpay_signature,
          })
          .eq("id", payment.id);

        return res.status(400).json({
          status: "error",
          message: "Invalid payment signature.",
        });
      }

      const { data: existingTransaction } = await db
        .from("credit_transactions")
        .select("id")
        .eq("payment_id", payment.id)
        .eq("type", "purchase")
        .maybeSingle();

      if (existingTransaction) {
        return res.json({
          status: "ok",
          message: "Credits already added.",
          credits_added: 0,
        });
      }

      const { data: user, error: userError } = await db
        .from("users")
        .select("credits")
        .eq("id", req.user!.id)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      const { error: transactionError } = await db
        .from("credit_transactions")
        .insert([
          {
            user_id: req.user!.id,
            payment_id: payment.id,
            type: "purchase",
            credits: payment.credits,
            description: `Purchased ${payment.credits} credits`,
          },
        ]);

      if (transactionError) throw transactionError;

      const { error: userUpdateError } = await db
        .from("users")
        .update({
          credits: Number(user.credits || 0) + payment.credits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.user!.id);

      if (userUpdateError) throw userUpdateError;

      const { error: paymentUpdateError } = await db
        .from("payments")
        .update({
          status: "paid",
          razorpay_payment_id,
          razorpay_signature,
          verified_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (paymentUpdateError) throw paymentUpdateError;

      return res.json({
        status: "ok",
        message: "Payment verified and credits added.",
        credits_added: payment.credits,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.post(
    "/api/ats/analyze",
    authMiddleware,
    (req, res, next) => {
      upload.single("resume")(req, res, (error) => {
        if (error) {
          return res.status(400).json({
            error: getErrorMessage(error),
          });
        }

        next();
      });
    },
    async (req, res) => {
      if (!requireSupabase(res)) return;

      const ai = requireGemini(res);
      if (!ai) return;

      const db = supabase! as any;

      try {
        const jobDescription = String(req.body.job_description || "").trim();
        const jobRoleId = req.body.job_role_id
          ? String(req.body.job_role_id)
          : null;
        const customJobRole = String(req.body.job_role || "").trim();

        if (!req.file) {
          return res.status(400).json({
            error: "Resume file is required.",
          });
        }

        if (!jobDescription && !jobRoleId && !customJobRole) {
          return res.status(400).json({
            error: "Job description, job type dropdown, or custom job type is required.",
          });
        }

        const { data: user, error: userError } = await db
          .from("users")
          .select("credits")
          .eq("id", req.user!.id)
          .single();

        if (userError || !user) {
          return res.status(404).json({
            error: "User not found.",
          });
        }

        if (Number(user.credits || 0) <= 0) {
          return res.status(400).json({
            error: "Insufficient credits.",
          });
        }

        const resumeText = (await extractResumeTextFromFile(req.file)).trim();

        if (resumeText.length < 100) {
          return res.status(400).json({
            error:
              "Could not extract enough text from this resume. Upload a readable PDF/DOCX/TXT file.",
          });
        }

        if (!looksLikeResumeDocument(resumeText)) {
          return res.status(400).json({
            error:
              "This file does not look like a resume. Please upload a valid resume with skills, experience, education, projects, or contact details.",
          });
        }

        const uploadedResume = await uploadResumeToStorage({
          userId: req.user!.id,
          file: req.file,
          extractedText: resumeText,
        });

        let selectedJobRoleText = "";

        if (jobRoleId) {
          const { data: role, error: roleError } = await db
            .from("job_roles")
            .select("*")
            .eq("id", jobRoleId)
            .eq("status", "active")
            .maybeSingle();

          if (roleError) throw roleError;

          if (role) {
            selectedJobRoleText = `${role.role_name}
Required skills: ${(role.required_skills || []).join(", ")}
Keywords: ${(role.keywords || []).join(", ")}
Description: ${role.description || ""}`;
          }
        }

        const targetTextParts = [];

        if (jobDescription) {
          targetTextParts.push(`Job description:\n${jobDescription}`);
        }

        if (selectedJobRoleText) {
          targetTextParts.push(`Selected job type:\n${selectedJobRoleText}`);
        }

        if (customJobRole) {
          targetTextParts.push(`Custom job type:\n${customJobRole}`);
        }

        const targetText = targetTextParts.join("\n\n");
        const analysisType = jobDescription ? "job_description" : "job_role";

        const { data: previousScans, error: previousScansError } = await db
          .from("scans")
          .select("id, filename, score, type, result_data, date")
          .eq("user_id", req.user!.id)
          .order("date", { ascending: false })
          .limit(5);

        if (previousScansError) throw previousScansError;

        const prompt = buildAtsPrompt({
          resumeText,
          jobDescriptionOrRole: targetText,
          analysisType,
          previousScanContext: buildPreviousScanContext(previousScans || []),
        });

        const geminiResponse = await generateWithGeminiRetry(ai, prompt);
        const rawAnalysis = extractJsonFromText(geminiResponse.text || "");
        const analysisResult = normalizeAtsAnalysis(rawAnalysis, previousScans || []);
        const atsScore = Number(analysisResult.ats_score);

        if (Number.isNaN(atsScore) || atsScore < 0 || atsScore > 100) {
          return res.status(500).json({
            error: "Gemini returned an invalid ATS score.",
          });
        }

        const savedJobDescription =
          jobDescription ||
          (customJobRole ? `Job type: ${customJobRole}` : null) ||
          (selectedJobRoleText ? selectedJobRoleText : null);

        const { data: scanId, error: rpcError } = await db.rpc(
          "complete_resume_scan",
          {
            p_user_id: req.user!.id,
            p_resume_id: uploadedResume.id,
            p_filename: req.file.originalname,
            p_score: atsScore,
            p_type: analysisType,
            p_job_description: savedJobDescription,
            p_job_role_id: jobRoleId,
            p_result_data: analysisResult,
          }
        );

        if (rpcError) throw rpcError;

        const { data: scan, error: scanFetchError } = await db
          .from("scans")
          .select("*")
          .eq("id", scanId)
          .eq("user_id", req.user!.id)
          .single();

        if (scanFetchError) throw scanFetchError;

        const { data: updatedUser } = await db
          .from("users")
          .select("credits")
          .eq("id", req.user!.id)
          .single();

        await cleanupOldScanHistory(db, req.user!.id);

        return res.json({
          status: "ok",
          message: "Resume analyzed successfully.",
          scan,
          resume: {
            id: uploadedResume.id,
            file_name: uploadedResume.file_name,
            file_url: uploadedResume.file_url,
          },
          credits_used: 1,
          remaining_credits: updatedUser?.credits ?? null,
          analysis: analysisResult,
        });
      } catch (error: unknown) {
        console.error(error);
        return res.status(500).json({
          error: getErrorMessage(error),
        });
      }
    }
  );

  app.post("/api/resume/rewrite", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const ai = requireGemini(res);
    if (!ai) return;

    const db = supabase! as any;

    try {
      const scanId = String(req.body.scan_id || "").trim();

      const selectedSuggestions = normalizeStringArray(req.body.apply_suggestions)
        .map((item) => limitText(item, 320))
        .filter(Boolean)
        .slice(0, 30);

      if (!scanId) {
        return res.status(400).json({
          error: "scan_id is required.",
        });
      }

      const { data: scan, error: scanError } = await db
        .from("scans")
        .select("id, resume_id, filename, job_description, job_role_id, result_data")
        .eq("id", scanId)
        .eq("user_id", req.user!.id)
        .single();

      if (scanError || !scan) {
        return res.status(404).json({
          error: "Scan not found.",
        });
      }

      if (!scan.resume_id) {
        return res.status(400).json({
          error:
            "The resume file for this scan is no longer available. Run a new scan to generate an improved resume.",
        });
      }

      const { data: uploadedResume, error: resumeError } = await db
        .from("uploaded_resumes")
        .select("id, file_name, extracted_text")
        .eq("id", scan.resume_id)
        .eq("user_id", req.user!.id)
        .maybeSingle();

      if (resumeError) throw resumeError;

      const resumeText = String(uploadedResume?.extracted_text || "").trim();

      if (resumeText.length < 100) {
        return res.status(400).json({
          error:
            "The stored text for this resume is too short to rewrite. Run a new scan and try again.",
        });
      }

      const { data: user, error: userError } = await db
        .from("users")
        .select("credits")
        .eq("id", req.user!.id)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      if (Number(user.credits || 0) <= 0) {
        return res.status(400).json({
          error: "Insufficient credits.",
        });
      }

      let targetText = String(scan.job_description || "").trim();

      if (scan.job_role_id) {
        const { data: role } = await db
          .from("job_roles")
          .select("role_name, required_skills, keywords, description")
          .eq("id", scan.job_role_id)
          .maybeSingle();

        if (role) {
          targetText = `${targetText}

Selected job type: ${role.role_name}
Required skills: ${(role.required_skills || []).join(", ")}
Keywords: ${(role.keywords || []).join(", ")}
Description: ${role.description || ""}`.trim();
        }
      }

      const prompt = buildResumeRewritePrompt({
        resumeText,
        jobDescriptionOrRole: targetText,
        analysis: scan.result_data || {},
        selectedSuggestions,
      });

      const geminiResponse = await generateWithGeminiRetry(ai, prompt);
      const rewritten = normalizeRewrittenResume(
        extractJsonFromText(geminiResponse.text || "")
      );

      if (
        rewritten.experience.length === 0 &&
        rewritten.education.length === 0 &&
        rewritten.skill_groups.length === 0
      ) {
        return res.status(502).json({
          error: "Could not rebuild this resume. Please try again.",
        });
      }

      // Charge only once the rewrite actually succeeded.
      const { data: remainingCredits, error: spendError } = await db.rpc(
        "spend_credit_for_resume_rewrite",
        {
          p_user_id: req.user!.id,
          p_scan_id: scan.id,
        }
      );

      if (spendError) {
        const message = getErrorMessage(spendError);

        if (message.includes("Insufficient credits")) {
          return res.status(400).json({
            error: "Insufficient credits.",
          });
        }

        throw spendError;
      }

      return res.json({
        status: "ok",
        message: "Improved resume generated. 1 credit used.",
        source_file_name: uploadedResume?.file_name || scan.filename,
        applied_suggestions: selectedSuggestions,
        credits_used: 1,
        remaining_credits: remainingCredits ?? null,
        resume: rewritten,
      });
    } catch (error: unknown) {
      console.error(error);
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/scans", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    try {
      const { data, error } = await db
        .from("scans")
        .select("id, filename, score, status, type, date, created_at, result_data")
        .eq("user_id", req.user!.id)
        .order("date", { ascending: false })
        .limit(MAX_SCAN_HISTORY_PER_USER);

      if (error) throw error;

      return res.json(data || []);
    } catch (error: unknown) {
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  app.get("/api/scans/:id", authMiddleware, async (req, res) => {
    if (!requireSupabase(res)) return;

    const db = supabase! as any;

    try {
      const { data, error } = await db
        .from("scans")
        .select("*")
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id)
        .single();

      if (error) throw error;

      return res.json(data);
    } catch (error: unknown) {
      return res.status(500).json({
        error: getErrorMessage(error),
      });
    }
  });

  const publicSiteUrl = (process.env.APP_URL || "https://atsscanai.com").replace(
    /\/+$/,
    ""
  );

  app.get("/robots.txt", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${publicSiteUrl}/sitemap.xml
`);
  });

  app.get("/sitemap.xml", (_req, res) => {
    res
      .status(200)
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${publicSiteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: path.join(rootDir, "vite.config.ts"),
      root: rootDir,
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
