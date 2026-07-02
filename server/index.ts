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
      origin: process.env.CLIENT_ORIGIN?.split(",") || true,
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

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const nodemailer = await import("nodemailer");

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: `"ATS Scan AI" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: "Your ATS Scan AI OTP",
          text: `Your verification code is ${otp}. It expires in 5 minutes.`,
          html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>ATS Scan AI</h2><p>Your verification code is:</p><h1>${otp}</h1><p>This code expires in 5 minutes.</p></div>`,
        });
      } else if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV OTP] ${email}: ${otp}`);
      }

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