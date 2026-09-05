import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  CirclePlay,
  Check,
  CloudUpload,
  CreditCard,
  Download,
  FileDown,
  FileSearch,
  Plus,
  Gem,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Bell,
  Crown,
  FileText,
  X,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import LandingScanAnimation from "./LandingScanAnimation";

const TOKEN_KEY = "ats_token";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type User = {
  id: string;
  name: string;
  email: string;
  credits: number;
  total_scans: number;
  avg_score: number;
};

type CreditPackage = {
  id: string;
  name: string;
  price_inr: number;
  credits: number;
  status: string;
};

type JobRole = {
  id: string;
  role_name: string;
  required_skills: string[];
  keywords: string[];
  description: string;
};

type AtsHistoryComparison = {
  has_previous_scans: boolean;
  previous_best_score: number | null;
  latest_previous_score: number | null;
  score_change_from_latest: number | null;
  score_change_from_best: number | null;
  improved_areas: string[];
  repeated_issues: string[];
  new_issues: string[];
  progress_summary: string;
};

type AtsAnalysis = {
  ats_score: number;
  resume_summary: string;
  matched_skills: string[];
  missing_skills: string[];
  missing_keywords: string[];
  experience_match: string;
  education_match: string;
  formatting_issues: string[];
  improvement_suggestions: string[];
  better_bullet_points: string[];
  final_recommendation: string;
  history_comparison?: AtsHistoryComparison;
};

type Scan = {
  id: string;
  filename: string;
  score: number;
  status: string;
  type: string;
  date: string;
  result_data?: AtsAnalysis;
};

const DEFAULT_JOB_DESCRIPTION = `We are hiring a React Developer with strong experience in React, TypeScript, REST API integration, Tailwind CSS, Git, frontend performance optimization, reusable components, and responsive UI development.`;

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function renderList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p className="muted">None found.</p>;
  }

  return (
    <ul className="report-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function renderScoreChange(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  if (value > 0) return `+${value}`;
  return String(value);
}

function getScoreChangeClass(value: number | null | undefined) {
  if (value === null || value === undefined) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

type RewrittenResume = {
  full_name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  links: string[];
  summary: string;
  skill_groups: { label: string; items: string[] }[];
  experience: {
    role: string;
    company: string;
    location: string;
    period: string;
    bullets: string[];
  }[];
  projects: { name: string; period: string; bullets: string[] }[];
  education: {
    degree: string;
    institution: string;
    location: string;
    period: string;
  }[];
  certifications: string[];
  achievements: string[];
  todo_notes: string[];
};

type GeneratedResume = {
  id: string;
  scan_id: string | null;
  file_name: string;
  source_file_name: string | null;
  applied_suggestions: string[];
  created_at: string;
};

const RESUME_BUILD_STEPS = [
  "Reading the fixes you added",
  "Rewriting your resume with AI",
  "Formatting an ATS-ready PDF",
];

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type });
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked late so the browser has finished reading the stream.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function ResumeBuildOverlay({ step }: { step: number }) {
  return (
    <div className="build-overlay" role="status" aria-live="polite">
      <div className="build-card">
        <div className="build-spinner" aria-hidden="true">
          <span />
        </div>

        <h3>Building your improved resume</h3>
        <p>This takes a few seconds. Please keep this tab open.</p>

        <ol className="build-steps">
          {RESUME_BUILD_STEPS.map((label, index) => {
            const state =
              index < step ? "is-done" : index === step ? "is-active" : "";

            return (
              <li key={label} className={state}>
                <span className="build-step-marker" aria-hidden="true">
                  {index < step ? <Check size={13} /> : index + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score}%` } as CSSProperties}>
      <div>
        <strong>{score}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

function HistoryComparison({ history }: { history?: AtsHistoryComparison }) {
  if (!history) return null;

  if (!history.has_previous_scans) {
    return (
      <div className="history-box">
        <h3>History Comparison</h3>
        <p className="muted">This is the first scan. Analyze again to compare improvements.</p>
      </div>
    );
  }

  return (
    <div className="history-box">
      <h3>History Comparison</h3>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Latest Previous</span>
          <strong>{history.latest_previous_score ?? "N/A"}</strong>
        </div>

        <div className="metric-card">
          <span>Previous Best</span>
          <strong>{history.previous_best_score ?? "N/A"}</strong>
        </div>

        <div className="metric-card">
          <span>Change From Latest</span>
          <strong className={getScoreChangeClass(history.score_change_from_latest)}>
            {renderScoreChange(history.score_change_from_latest)}
          </strong>
        </div>

        <div className="metric-card">
          <span>Change From Best</span>
          <strong className={getScoreChangeClass(history.score_change_from_best)}>
            {renderScoreChange(history.score_change_from_best)}
          </strong>
        </div>
      </div>

      <h4>Progress Summary</h4>
      <p>{history.progress_summary || "No progress summary available."}</p>

      <h4>Improved Areas</h4>
      {renderList(history.improved_areas)}

      <h4>Repeated Issues</h4>
      {renderList(history.repeated_issues)}

      <h4>New Issues</h4>
      {renderList(history.new_issues)}
    </div>
  );
}

type SuggestionListProps = {
  items?: string[];
  selected: string[];
  onToggle: (item: string) => void;
};

/* Each fix is a switch: picked items are handed to the resume rewriter. */
function SuggestionList({ items, selected, onToggle }: SuggestionListProps) {
  if (!items || items.length === 0) {
    return <p className="muted">None found.</p>;
  }

  return (
    <ul className="report-list selectable-list">
      {items.map((item, index) => {
        const isSelected = selected.includes(item);

        return (
          <li key={`${item}-${index}`}>
            <span>{item}</span>

            <button
              type="button"
              className={`suggestion-toggle ${isSelected ? "is-added" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onToggle(item)}
            >
              {isSelected ? <Check size={14} /> : <Plus size={14} />}
              {isSelected ? "Added" : "Add"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type ReportProps = {
  analysis: AtsAnalysis;
  selectedSuggestions: string[];
  onToggleSuggestion: (item: string) => void;
  onClearSuggestions: () => void;
  onGenerateResume: () => void;
  resumeLoading: boolean;
  resumeMessage: string | null;
  resumeError: string | null;
  resumeNotes: string[];
  canGenerateResume: boolean;
  availableCredits: number;
  generatedCount: number;
};

function Report({
  analysis,
  selectedSuggestions,
  onToggleSuggestion,
  onClearSuggestions,
  onGenerateResume,
  resumeLoading,
  resumeMessage,
  resumeError,
  resumeNotes,
  canGenerateResume,
  availableCredits,
  generatedCount,
}: ReportProps) {
  const selectedCount = selectedSuggestions.length;
  const outOfCredits = availableCredits <= 0;

  return (
    <section className="report-panel" id="reports">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Latest analysis</p>
          <h2>ATS Report</h2>
        </div>

        <button
          type="button"
          onClick={onGenerateResume}
          disabled={resumeLoading || !canGenerateResume || outOfCredits}
          title={
            outOfCredits
              ? "You need at least 1 credit to build an improved resume."
              : undefined
          }
        >
          <FileDown size={18} />
          {resumeLoading
            ? "Building resume..."
            : generatedCount > 0
              ? "Rebuild resume · 1 credit"
              : "Download improved resume · 1 credit"}
        </button>
      </div>

      <div className={`rewrite-bar ${outOfCredits ? "is-blocked" : ""}`}>
        <div className="rewrite-bar-copy">
          <strong>
            {selectedCount > 0
              ? `${selectedCount} ${selectedCount === 1 ? "fix" : "fixes"} selected`
              : "Pick the fixes to apply"}
          </strong>

          <span>
            Add any suggestion below, then download a rewritten, ATS-ready copy of
            your resume. Each resume costs 1 credit on top of the scan, and every
            rebuild costs 1 more.
          </span>
        </div>

        <div className="rewrite-bar-side">
          <span className="rewrite-credit-pill">
            {availableCredits} {availableCredits === 1 ? "credit" : "credits"} left
          </span>

          {selectedCount > 0 && (
            <button type="button" className="text-button" onClick={onClearSuggestions}>
              Clear selection
            </button>
          )}
        </div>
      </div>

      {resumeMessage && <p className="success-text">{resumeMessage}</p>}
      {resumeError && <p className="error-text">{resumeError}</p>}

      {resumeNotes.length > 0 && (
        <div className="rewrite-notes">
          <h3>Only you can add these</h3>
          <ul className="report-list">
            {resumeNotes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="report-hero">
        <ScoreBadge score={analysis.ats_score} />
        <div>
          <h3>Resume Summary</h3>
          <p>{analysis.resume_summary}</p>
        </div>
      </div>

      <HistoryComparison history={analysis.history_comparison} />

      <div className="report-grid">
        <div className="report-card">
          <h3>Matched Skills</h3>
          {renderList(analysis.matched_skills)}
        </div>

        <div className="report-card">
          <h3>Missing Skills</h3>
          <SuggestionList
            items={analysis.missing_skills}
            selected={selectedSuggestions}
            onToggle={onToggleSuggestion}
          />
        </div>

        <div className="report-card">
          <h3>Missing Keywords</h3>
          <SuggestionList
            items={analysis.missing_keywords}
            selected={selectedSuggestions}
            onToggle={onToggleSuggestion}
          />
        </div>

        <div className="report-card">
          <h3>Formatting Issues</h3>
          <SuggestionList
            items={analysis.formatting_issues}
            selected={selectedSuggestions}
            onToggle={onToggleSuggestion}
          />
        </div>

        <div className="report-card">
          <h3>Experience Match</h3>
          <p>{analysis.experience_match}</p>
        </div>

        <div className="report-card">
          <h3>Education Match</h3>
          <p>{analysis.education_match}</p>
        </div>

        <div className="report-card wide">
          <h3>Improvement Suggestions</h3>
          <SuggestionList
            items={analysis.improvement_suggestions}
            selected={selectedSuggestions}
            onToggle={onToggleSuggestion}
          />
        </div>

        <div className="report-card wide">
          <h3>Better Bullet Points</h3>
          <SuggestionList
            items={analysis.better_bullet_points}
            selected={selectedSuggestions}
            onToggle={onToggleSuggestion}
          />
        </div>

        <div className="report-card wide">
          <h3>Final Recommendation</h3>
          <p>{analysis.final_recommendation}</p>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [jobTypeId, setJobTypeId] = useState("");
  const [customJobType, setCustomJobType] = useState("");

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AtsAnalysis | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);

  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeNotes, setResumeNotes] = useState<string[]>([]);
  const [resumeGeneratedCount, setResumeGeneratedCount] = useState(0);
  const [resumeStep, setResumeStep] = useState(0);
  const [generatedResumes, setGeneratedResumes] = useState<GeneratedResume[]>([]);
  const [downloadingResumeId, setDownloadingResumeId] = useState<string | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...options,
      headers,
    });
  }

  async function loadPublicData() {
    const [packagesResponse, rolesResponse] = await Promise.all([
      fetch("/api/credit-packages"),
      fetch("/api/job-roles"),
    ]);

    if (packagesResponse.ok) setPackages(await packagesResponse.json());
    if (rolesResponse.ok) setJobRoles(await rolesResponse.json());
  }

  async function loadUser() {
    if (!token) return;

    const response = await authFetch("/api/user/profile");

    if (!response.ok) {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setUser(null);
      return;
    }

    setUser(await response.json());
  }

  async function loadGeneratedResumes() {
    if (!token) return;

    const response = await authFetch("/api/resume/generated");

    if (response.ok) {
      setGeneratedResumes(await response.json());
    }
  }

  async function loadScans() {
    if (!token) return;

    const response = await authFetch("/api/scans");

    if (response.ok) {
      setScans(await response.json());
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadUser(), loadScans(), loadPublicData(), loadGeneratedResumes()]);
  }

  useEffect(() => {
    loadPublicData().catch(console.error);
  }, []);

  useEffect(() => {
    if (token) {
      refreshDashboard().catch(console.error);
    }
  }, [token]);

  /*
   * The report only lives in state, and the rewrite button only lives in the
   * report. Without this, a refresh or a fresh login leaves a user with scans
   * but no visible way back to them. Open the newest one by default; a fresh
   * analysis or a history click has already set `analysis`, so this stays out
   * of the way.
   */
  useEffect(() => {
    if (analysis || scans.length === 0) return;

    const latest = scans.find((scan) => scan.result_data);

    if (latest?.result_data) {
      showAnalysis(latest.result_data, latest.id);
    }
  }, [scans, analysis]);

  useEffect(() => {
    if (resendSeconds <= 0) return;

    const timerId = window.setTimeout(() => {
      setResendSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [resendSeconds]);

  async function handleSendOtp() {
    try {
      const cleanEmail = email.trim();

      if (!cleanEmail) {
        throw new Error("Please enter your email address.");
      }

      setAuthLoading(true);
      setAuthError(null);
      setAuthMessage(null);

      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send OTP.");
      }

      setEmail(cleanEmail);
      setOtp("");
      setOtpSent(true);
      setResendSeconds(30);
      setAuthMessage("OTP sent. Check your email.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not send OTP.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp() {
    try {
      const cleanEmail = email.trim();
      const cleanOtp = otp.trim();

      if (!cleanEmail) {
        throw new Error("Please enter your email address.");
      }

      if (!cleanOtp) {
        throw new Error("Please enter the OTP code.");
      }

      setAuthLoading(true);
      setAuthError(null);
      setAuthMessage(null);

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, otp: cleanOtp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "OTP verification failed.");
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthMessage("Login successful.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "OTP verification failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleResendOtp() {
    if (authLoading || resendSeconds > 0) return;
    handleSendOtp();
  }

  function handleChangeEmail() {
    setOtpSent(false);
    setOtp("");
    setResendSeconds(0);
    setAuthMessage(null);
    setAuthError(null);
  }

  function handleAuthKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();

    if (event.currentTarget.name === "email" && !otpSent) {
      handleSendOtp();
      return;
    }

    if (event.currentTarget.name === "otp" && otpSent) {
      handleVerifyOtp();
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setScans([]);
    setAnalysis(null);
    setPaymentMessage(null);
    setPaymentError(null);
    setOtpSent(false);
    setOtp("");
    setResendSeconds(0);
  }

  async function handleBuyCredits(selectedPackage: CreditPackage) {
    try {
      setPaymentLoading(true);
      setPaymentError(null);
      setPaymentMessage(null);

      if (!user) {
        throw new Error("Login required.");
      }

      const razorpayLoaded = await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error("Razorpay checkout could not be loaded.");
      }

      const orderResponse = await authFetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: selectedPackage.id }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Could not create order.");
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "ATS Scan AI",
        description: `${selectedPackage.name} - ${selectedPackage.credits} credits`,
        order_id: orderData.order_id,
        prefill: {
          name: user.name,
          email: user.email,
        },
        theme: { color: "#2563eb" },
        handler: async function (response: any) {
          try {
            const verifyResponse = await authFetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok) {
              throw new Error(verifyData.error || verifyData.message);
            }

            setPaymentMessage(`Payment successful. ${verifyData.credits_added} credits added.`);
            await refreshDashboard();
          } catch (error) {
            setPaymentError(error instanceof Error ? error.message : "Payment verification failed.");
          }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Payment failed.");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleAnalyzeResume() {
    try {
      setAnalysisLoading(true);
      setAnalysisError(null);
      setAnalysisMessage(null);
      setAnalysis(null);

      if (!user) {
        throw new Error("Login required.");
      }

      if (user.credits <= 0) {
        throw new Error("Insufficient credits. Buy credits first.");
      }

      if (!selectedResumeFile) {
        throw new Error("Please upload a PDF, DOCX, or TXT resume first.");
      }

      const finalJobDescription = jobDescription.trim();
      const finalCustomJobType = customJobType.trim();

      if (!finalJobDescription && !jobTypeId && !finalCustomJobType) {
        throw new Error("Paste a job description, select a job type, or enter a custom job type.");
      }

      const lowerName = selectedResumeFile.name.toLowerCase();

      if (![".pdf", ".docx", ".txt"].some((ext) => lowerName.endsWith(ext))) {
        throw new Error("Only PDF, DOCX, and TXT files are allowed.");
      }

      if (selectedResumeFile.size > 5 * 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 5 MB.");
      }

      const formData = new FormData();
      formData.append("resume", selectedResumeFile);

      if (finalJobDescription) {
        formData.append("job_description", finalJobDescription);
      }

      if (finalCustomJobType) {
        formData.append("job_role", finalCustomJobType);

        if (!finalJobDescription) {
          formData.append(
            "job_description",
            `Analyze this resume for the job type: ${finalCustomJobType}.`
          );
        }
      } else if (jobTypeId) {
        formData.append("job_role_id", jobTypeId);
      }

      const response = await fetch("/api/ats/analyze", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Resume analysis failed.");
      }

      setAnalysis(data.analysis);
      setAnalysisMessage(`Resume analyzed. 1 credit used. Remaining credits: ${data.remaining_credits}`);
      await refreshDashboard();
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Resume analysis failed.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  function showAnalysis(nextAnalysis: AtsAnalysis | null, scanId: string | null) {
    setAnalysis(nextAnalysis);
    setActiveScanId(scanId);
    setSelectedSuggestions([]);
    setResumeMessage(null);
    setResumeError(null);
    setResumeNotes([]);
  }

  function handleToggleSuggestion(item: string) {
    setSelectedSuggestions((current) =>
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item]
    );
  }

  async function handleGenerateResume() {
    if (!activeScanId) {
      setResumeError("Open a scan from your history first.");
      return;
    }

    if ((user?.credits ?? 0) <= 0) {
      setResumeError("Insufficient credits. Buy credits to build an improved resume.");
      return;
    }

    // A rebuild spends another credit, so make the second one deliberate.
    if (resumeGeneratedCount > 0) {
      const confirmed = window.confirm(
        "Rebuilding uses 1 more credit. Generate the resume again?"
      );

      if (!confirmed) return;
    }

    try {
      setResumeLoading(true);
      setResumeStep(0);
      setResumeError(null);
      setResumeMessage(null);
      setResumeNotes([]);

      setResumeStep(1);

      const response = await authFetch("/api/resume/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: activeScanId,
          apply_suggestions: selectedSuggestions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not build the improved resume.");
      }

      setResumeStep(2);

      if (!data.pdf_base64) {
        throw new Error("The resume was built but the PDF was empty. Please try again.");
      }

      const fileName = data.file_name || "Improved_ATS_Resume.pdf";

      saveBlob(base64ToBlob(data.pdf_base64, "application/pdf"), fileName);

      setResumeStep(3);
      setResumeNotes(data.resume?.todo_notes || []);
      setResumeGeneratedCount((count) => count + 1);
      setResumeMessage(
        `Downloaded ${fileName}. 1 credit used. Remaining credits: ${data.remaining_credits}`
      );

      await Promise.all([refreshDashboard(), loadGeneratedResumes()]);
    } catch (error) {
      setResumeError(
        error instanceof Error ? error.message : "Could not build the improved resume."
      );
    } finally {
      setResumeLoading(false);
      setResumeStep(0);
    }
  }

  async function handleDownloadGenerated(generated: GeneratedResume) {
    try {
      setResumeError(null);
      setDownloadingResumeId(generated.id);

      const response = await authFetch(
        `/api/resume/generated/${generated.id}/pdf`
      );

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Could not download that resume.");
      }

      saveBlob(await response.blob(), generated.file_name);
    } catch (error) {
      setResumeError(
        error instanceof Error ? error.message : "Could not download that resume."
      );
    } finally {
      setDownloadingResumeId(null);
    }
  }

  function handleAnalyzeEnterKey(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    handleAnalyzeResume();
  }

  const starterPackage = packages[0];

  const PREVIEW = typeof window !== "undefined" && window.location.search.includes("preview");

  if (!token && !PREVIEW) {
    return (
      <div className="marketing-page">
        <nav className="marketing-nav">
          <a href="#top" className="nav-brand">
            <Sparkles size={24} />
            <span>ATS Scan AI</span>
          </a>

          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it Works</a>
            <a href="#pricing">Pricing</a>
            <a href="#login">Login</a>
          </div>

          <div className="nav-actions">
            <button type="button" onClick={() => scrollToSection("login")}>
              Get Started <ArrowRight size={18} />
            </button>
          </div>
        </nav>

        <main id="top">
          <section className="marketing-hero">
            <div className="hero-copy">
              <div className="hero-badge">
                <Sparkles size={16} />
                AI-powered ATS optimization
              </div>

              <h1>
                AI-Powered Resume Scoring to Get{" "}
                <span className="gradient-word">More Interviews</span>
              </h1>

              <p>
                Get an instant ATS score, personalized feedback, and actionable improvements
                to optimize your resume and land more interviews.
              </p>

              <div className="hero-actions">
                <button type="button" onClick={() => scrollToSection("login")}>
                  Get Started <ArrowRight size={18} />
                </button>

                <button type="button" className="demo-button" onClick={() => scrollToSection("features")}>
                  <CirclePlay size={18} /> See Demo
                </button>
              </div>

              <div className="trust-points">
                <span>
                  <Sparkles size={15} /> AI-Powered Analysis
                </span>
                <span>
                  <LockKeyhole size={15} /> Secure & Private
                </span>
                <span>
                  <Star size={15} /> Trusted by Job Seekers
                </span>
              </div>
            </div>

            <LandingScanAnimation />
          </section>

          <section className="feature-strip" id="features">
            <div>
              <Upload size={28} />
              <h3>Resume Upload</h3>
              <p>Upload your resume in PDF or DOCX format securely.</p>
            </div>

            <div>
              <Sparkles size={28} />
              <h3>ATS Analysis</h3>
              <p>AI scans and analyzes your resume against ATS best practices.</p>
            </div>

            <div>
              <BarChart3 size={28} />
              <h3>History Comparison</h3>
              <p>Compare scores over time and track your improvements.</p>
            </div>

            <div>
              <Download size={28} />
              <h3>Download Reports</h3>
              <p>Get detailed reports and actionable tips to improve your resume.</p>
            </div>
          </section>

          <section className="landing-lower-grid premium-lower-grid">
            <div
              className="steps-card premium-steps-card horizontal-steps-card"
              id="how"
            >
              <div className="horizontal-steps-heading">
                <div>
                  <p className="eyebrow">How it works</p>
                  <h2>Get ATS-ready in 3 simple steps</h2>
                  <p className="horizontal-steps-intro">
                    From resume upload to clear improvements, ATS Scan AI helps
                    you understand what recruiters and tracking systems may notice.
                  </p>
                </div>

                <div className="horizontal-value-badge">
                  <Zap size={18} />
                  <span>Fast, focused and actionable</span>
                </div>
              </div>

              <div className="horizontal-progress-line" aria-hidden="true">
                <span className="horizontal-progress-fill" />
                <i className="horizontal-progress-dot dot-one" />
                <i className="horizontal-progress-dot dot-two" />
              </div>

              <div className="horizontal-step-grid">
                <article className="horizontal-step-card step-upload-card">
                  <span className="horizontal-step-number">1</span>

                  <div className="horizontal-step-icon">
                    <span className="horizontal-icon-pulse" aria-hidden="true" />
                    <CloudUpload size={44} />
                  </div>

                  <h3>Upload Resume</h3>

                  <p>
                    Securely upload your resume in PDF, DOCX, or TXT format in
                    seconds.
                  </p>

                  <div className="horizontal-step-benefit">
                    <ShieldCheck size={19} />
                    <span>Secure document handling</span>
                  </div>
                </article>

                <article className="horizontal-step-card step-analysis-card">
                  <span className="horizontal-step-number">2</span>

                  <div className="horizontal-step-icon">
                    <span className="horizontal-scan-ring" aria-hidden="true" />
                    <BrainCircuit size={44} />
                  </div>

                  <h3>AI ATS Analysis</h3>

                  <p>
                    We check keywords, skills, formatting, role alignment, and
                    possible ATS gaps.
                  </p>

                  <div className="horizontal-step-benefit">
                    <BarChart3 size={19} />
                    <span>Instant scoring insights</span>
                  </div>
                </article>

                <article className="horizontal-step-card step-improve-card">
                  <span className="horizontal-step-number">3</span>

                  <div className="horizontal-step-icon">
                    <span className="horizontal-success-ring" aria-hidden="true" />
                    <TrendingUp size={44} />
                  </div>

                  <h3>Improve &amp; Apply</h3>

                  <p>
                    Use clear suggestions to strengthen your resume and apply
                    with more confidence.
                  </p>

                  <div className="horizontal-step-benefit">
                    <CheckCircle2 size={19} />
                    <span>Actionable recommendations</span>
                  </div>
                </article>
              </div>
            </div>

            <div className="premium-pricing-login" id="pricing">
              <section className="premium-pricing-card">
                <div className="premium-plan-label">Premium plan</div>

                <div className="premium-pricing-heading">
                  <div>
                    <h2>Simple, transparent pricing</h2>
                    <p>Pay once. Get real insights. No hidden fees.</p>
                  </div>

                  <div className="premium-gem" aria-hidden="true">
                    <Gem size={46} />
                  </div>
                </div>

                <div className="premium-price-box">
                  <div className="premium-price-value">
                    <span>{starterPackage?.credits ?? 10} Credits</span>
                    <strong>₹{starterPackage?.price_inr ?? 99}</strong>
                  </div>

                  <ul>
                    <li>
                      <CheckCircle2 size={18} />
                      1 credit = 1 resume analysis
                    </li>
                    <li>
                      <CheckCircle2 size={18} />
                      ATS score and feedback
                    </li>
                    <li>
                      <CheckCircle2 size={18} />
                      History comparison
                    </li>
                    <li>
                      <CheckCircle2 size={18} />
                      Downloadable report
                    </li>
                  </ul>
                </div>
              </section>

              <section className="premium-login-card" id="login">
                <div className="premium-login-heading">
                  <div className="premium-login-icon">
                    <ShieldCheck size={25} />
                  </div>

                  <div>
                    <p className="eyebrow">Secure login</p>
                    <h2>Email OTP Login</h2>
                    <span>
                      Enter your email and we’ll send a one-time password.
                    </span>
                  </div>
                </div>

                <label className="premium-input-label">
                  <Mail size={18} />
                  <input
                    name="email"
                    value={email}
                    disabled={otpSent || authLoading}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={handleAuthKeyDown}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                  />
                </label>

                {otpSent && (
                  <label className="premium-input-label">
                    <LockKeyhole size={18} />
                    <input
                      name="otp"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      onKeyDown={handleAuthKeyDown}
                      placeholder="6 digit code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </label>
                )}

                {!otpSent ? (
                  <button
                    type="button"
                    className="premium-login-button"
                    onClick={handleSendOtp}
                    disabled={authLoading}
                  >
                    <span>{authLoading ? "Sending OTP..." : "Send OTP"}</span>
                    <Send size={19} />
                  </button>
                ) : (
                  <>
                    <div className="otp-action-grid premium-otp-actions">
                      <button
                        type="button"
                        className="premium-login-button"
                        onClick={handleVerifyOtp}
                        disabled={authLoading}
                      >
                        <span>
                          {authLoading ? "Verifying..." : "Verify OTP"}
                        </span>
                        <ArrowRight size={19} />
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleResendOtp}
                        disabled={authLoading || resendSeconds > 0}
                      >
                        {resendSeconds > 0
                          ? `Resend in ${resendSeconds}s`
                          : "Resend OTP"}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="text-button premium-change-email"
                      onClick={handleChangeEmail}
                      disabled={authLoading}
                    >
                      Change email address
                    </button>
                  </>
                )}

                <div className="premium-login-note">
                  <LockKeyhole size={14} />
                  <span>We never share your email.</span>
                  <i aria-hidden="true" />
                  <span>OTP is sent to your inbox.</span>
                </div>

                {authMessage && <p className="success-text">{authMessage}</p>}
                {authError && <p className="error-text">{authError}</p>}
              </section>
            </div>
          </section>

          <section className="landing-trust-bar">
            <div>
              <ShieldCheck size={26} />
              <span>Trusted by</span>
              <strong>Job Seekers Worldwide</strong>
            </div>

            <div>
              <TrendingUp size={26} />
              <span>Boost Your Chances</span>
              <strong>Get More Interviews</strong>
            </div>

            <div>
              <LockKeyhole size={26} />
              <span>100% Secure</span>
              <strong>Your Data is Safe</strong>
            </div>

            <div>
              <Sparkles size={26} />
              <span>AI-Powered</span>
              <strong>Smart. Fast. Accurate.</strong>
            </div>
          </section>
        </main>

        <footer className="marketing-footer">
          <div className="marketing-footer-inner">
            <span>© {new Date().getFullYear()} ATS Scan AI</span>

            <div className="marketing-footer-links">
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#login">Login</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="dashboard-layout modern-dashboard-layout">
      <aside className={`sidebar modern-sidebar ${mobileSidebarOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="modern-sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <X size={22} />
        </button>

        <div className="modern-sidebar-brand">
          <div className="modern-brand-icon">
            <FileSearch size={27} />
          </div>
          <div>
            <strong>ATS Scan AI</strong>
            <span>Resume Analyzer</span>
          </div>
        </div>

        <nav className="sidebar-nav modern-sidebar-nav">
          <a href="#dashboard" className="active" onClick={() => setMobileSidebarOpen(false)}><LayoutDashboard size={19} />Dashboard</a>
          <a href="#analyze" onClick={() => setMobileSidebarOpen(false)}><FileSearch size={19} />Analyze</a>
          <a href="#reports" onClick={() => setMobileSidebarOpen(false)}><BarChart3 size={19} />Reports</a>
          <a href="#history" onClick={() => setMobileSidebarOpen(false)}><History size={19} />History</a>
          <a href="#credits" onClick={() => setMobileSidebarOpen(false)}><Crown size={19} />Pricing</a>
        </nav>

        <div className="modern-credit-card" id="credits">
          <div className="modern-credit-card-top">
            <div>
              <span>Credits</span>
              <strong>{user?.credits ?? 0}</strong>
              <small>available</small>
            </div>
            <div className="modern-credit-icon"><Wallet size={22} /></div>
          </div>
          <button
            type="button"
            onClick={() => starterPackage && handleBuyCredits(starterPackage)}
            disabled={!starterPackage || paymentLoading}
          >
            <CreditCard size={18} />
            {paymentLoading ? "Opening..." : "Buy Credits"}
          </button>
        </div>

        <div className="modern-sidebar-user">
          <div className="modern-user-avatar">
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="modern-user-copy">
            <strong>{user?.name || "ATS User"}</strong>
            <span>{user?.email}</span>
          </div>
        </div>

        <button type="button" className="modern-logout-button" onClick={handleLogout}>
          <LogOut size={18} />Logout
        </button>
      </aside>

      {mobileSidebarOpen && (
        <button
          type="button"
          className="modern-sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <main className="dashboard-main modern-dashboard-main" id="dashboard">
        <header className="modern-topbar">
          <div className="modern-topbar-left">
            <button
              type="button"
              className="modern-menu-button"
              aria-label="Open navigation"
              aria-expanded={mobileSidebarOpen}
              onClick={() => {
                setMobileSidebarOpen(true);
                setNotificationsOpen(false);
                setProfileMenuOpen(false);
              }}
            >
              <Menu size={24} />
            </button>
            <div>
              <h1>Hello, {user?.name?.split(" ")[0] || "there"} <span aria-hidden="true">👋</span></h1>
              <p>Welcome back! Analyze your resumes and boost your job chances.</p>
            </div>
          </div>

          <div className="modern-topbar-actions">
            <div className="modern-action-menu">
              <button
                type="button"
                className="modern-icon-button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setProfileMenuOpen(false);
                }}
              >
                <Bell size={21} />
                <span className="modern-notification-dot" aria-hidden="true" />
              </button>

              {notificationsOpen && (
                <div className="modern-dropdown modern-notification-menu">
                  <strong>Notifications</strong>
                  <p>No new notifications.</p>
                </div>
              )}
            </div>

            <div className="modern-action-menu">
              <button
                type="button"
                className="modern-top-avatar"
                aria-label="Open profile menu"
                aria-expanded={profileMenuOpen}
                onClick={() => {
                  setProfileMenuOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                <span aria-hidden="true" />
              </button>

              {profileMenuOpen && (
                <div className="modern-dropdown modern-profile-menu">
                  <div>
                    <strong>{user?.name || "ATS User"}</strong>
                    <span>{user?.email}</span>
                  </div>
                  <button type="button" onClick={handleLogout}>
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="stat-grid modern-stat-grid">
          <article className="stat-card modern-stat-card stat-blue">
            <div className="modern-stat-icon"><FileSearch size={25} /></div>
            <div className="modern-stat-copy">
              <span>Total Scans</span>
              <strong>{user?.total_scans ?? 0}</strong>
              <small>All time scans</small>
            </div>
            <TrendingUp className="modern-stat-trend" size={28} />
          </article>

          <article className="stat-card modern-stat-card stat-green">
            <div className="modern-stat-icon"><TrendingUp size={25} /></div>
            <div className="modern-stat-copy">
              <span>Average Score</span>
              <strong>{user?.avg_score ?? 0}%</strong>
              <small>Across all scans</small>
            </div>
            <TrendingUp className="modern-stat-trend" size={28} />
          </article>

          <article className="stat-card modern-stat-card stat-purple">
            <div className="modern-stat-icon"><FileText size={25} /></div>
            <div className="modern-stat-copy">
              <span>Available Credits</span>
              <strong>{user?.credits ?? 0}</strong>
              <small>Remaining credits</small>
            </div>
            <TrendingUp className="modern-stat-trend" size={28} />
          </article>

          <article className="stat-card modern-stat-card stat-gold modern-credit-pack-card">
            <div className="modern-stat-icon"><Crown size={25} /></div>
            <div className="modern-stat-copy">
              <span>Credit Pack</span>
              <strong>{starterPackage ? `₹${starterPackage.price_inr}` : "..."}</strong>
              <small>{starterPackage ? `${starterPackage.credits} credits` : "Loading"}</small>
            </div>
            <button
              type="button"
              onClick={() => starterPackage && handleBuyCredits(starterPackage)}
              disabled={!starterPackage || paymentLoading}
            >
              {paymentLoading ? "Opening..." : "Buy Now"}
            </button>
          </article>
        </section>

        {(paymentMessage || paymentError) && (
          <div className="message-row">
            {paymentMessage && <p className="success-text">{paymentMessage}</p>}
            {paymentError && <p className="error-text">{paymentError}</p>}
          </div>
        )}

        <section className="workspace-grid modern-workspace-grid">
          <div className="analyze-panel modern-analyze-panel" id="analyze">
            <div className="modern-panel-heading">
              <div className="modern-panel-title">
                <div className="modern-panel-icon"><FileSearch size={23} /></div>
                <div>
                  <h2>Analyze Resume</h2>
                  <p>Upload your resume and get an ATS score in seconds.</p>
                </div>
              </div>
            </div>

            <div className="upload-dropzone modern-upload-dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: "none" }}
                onChange={(event) => {
                  setSelectedResumeFile(event.target.files?.[0] || null);
                  setAnalysisError(null);
                  setAnalysisMessage(null);
                }}
              />
              <div className="modern-upload-icon"><CloudUpload size={52} /></div>
              <h3>Drag &amp; drop your resume here</h3>
              <div className="modern-upload-divider"><span /><small>or</small><span /></div>
              <button
                type="button"
                className="modern-choose-file-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={19} />Choose File
              </button>
              <p>PDF, DOCX, or TXT. Maximum file size 5 MB.</p>
            </div>

            {selectedResumeFile && (
              <div className="modern-selected-file">
                <div className="modern-file-type-icon"><FileText size={23} /></div>
                <div className="modern-selected-file-copy">
                  <strong>{selectedResumeFile.name}</strong>
                  <span>{(selectedResumeFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
                <CheckCircle2 className="modern-file-success" size={23} />
                <button
                  type="button"
                  className="modern-remove-file"
                  aria-label="Remove selected file"
                  onClick={() => {
                    setSelectedResumeFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            )}

            <label className="modern-field-label">Job Type <span>(Optional)</span></label>
            <div className="two-column-form modern-two-column-form">
              <select
                value={jobTypeId}
                onKeyDown={handleAnalyzeEnterKey}
                onChange={(event) => {
                  setJobTypeId(event.target.value);
                  if (event.target.value) setCustomJobType("");
                }}
              >
                <option value="">Select job type</option>
                {jobRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.role_name}</option>
                ))}
              </select>

              <input
                value={customJobType}
                onKeyDown={handleAnalyzeEnterKey}
                onChange={(event) => {
                  setCustomJobType(event.target.value);
                  if (event.target.value.trim()) setJobTypeId("");
                }}
                placeholder="Or enter custom job type"
              />
            </div>

            <label className="modern-field-label">Job Description</label>
            <textarea
              className="modern-job-description"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              rows={5}
              placeholder="Paste the full job description here to get a more accurate ATS score and feedback..."
            />

            <div className="modern-analyze-footer">
              <button
                type="button"
                className="analyze-button modern-analyze-button"
                onClick={handleAnalyzeResume}
                disabled={analysisLoading}
              >
                <Sparkles size={19} />
                {analysisLoading ? "Analyzing Resume..." : "Analyze Resume"}
              </button>

              <div className="modern-security-note">
                <ShieldCheck size={17} />
                <span>We never store your resume. Your data is 100% secure.</span>
              </div>
            </div>

            {analysisMessage && <p className="success-text">{analysisMessage}</p>}
            {analysisError && <p className="error-text">{analysisError}</p>}
          </div>

          <aside className="history-panel modern-history-panel" id="history">
            <div className="modern-panel-heading">
              <div className="modern-panel-title">
                <div className="modern-panel-icon"><History size={23} /></div>
                <div><h2>Scan History</h2></div>
              </div>
              <a href="#history" className="modern-view-all">View All</a>
            </div>

            {scans.length === 0 ? (
              <div className="empty-state modern-history-empty">
                <div className="modern-empty-illustration"><FileSearch size={66} /></div>
                <h3>No scans yet</h3>
                <p>Analyze your first resume to start tracking your progress.</p>
                <button
                  type="button"
                  className="secondary-button modern-empty-button"
                  onClick={() => scrollToSection("analyze")}
                >
                  Analyze Now <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <div className="scan-list">
                {scans.map((scan) => (
                  <button
                    type="button"
                    key={scan.id}
                    className={`scan-row ${scan.id === activeScanId ? "is-active" : ""}`}
                    title="Open this report"
                    onClick={() => scan.result_data && showAnalysis(scan.result_data, scan.id)}
                  >
                    <div className="scan-file">
                      <span>{scan.filename}</span>
                      <small>{new Date(scan.date).toLocaleString()}</small>
                    </div>
                    <strong className="scan-score">{scan.score}/100</strong>
                  </button>
                ))}
              </div>
            )}

            {generatedResumes.length > 0 && (
              <div className="generated-list">
                <h3>Improved resumes</h3>

                {generatedResumes.map((generated) => (
                  <div className="generated-row" key={generated.id}>
                    <div className="generated-copy">
                      <strong>{generated.file_name}</strong>
                      <small>
                        {new Date(generated.created_at).toLocaleString()}
                        {generated.applied_suggestions?.length
                          ? ` · ${generated.applied_suggestions.length} fixes applied`
                          : ""}
                      </small>
                    </div>

                    <button
                      type="button"
                      className="secondary-button generated-download"
                      onClick={() => handleDownloadGenerated(generated)}
                      disabled={downloadingResumeId === generated.id}
                      title="Download again — no credit"
                    >
                      <FileDown size={15} />
                      {downloadingResumeId === generated.id ? "..." : "PDF"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>

        {resumeLoading && <ResumeBuildOverlay step={resumeStep} />}

        {analysis && (
          <Report
            analysis={analysis}
            selectedSuggestions={selectedSuggestions}
            onToggleSuggestion={handleToggleSuggestion}
            onClearSuggestions={() => setSelectedSuggestions([])}
            onGenerateResume={handleGenerateResume}
            resumeLoading={resumeLoading}
            resumeMessage={resumeMessage}
            resumeError={resumeError}
            resumeNotes={resumeNotes}
            canGenerateResume={Boolean(activeScanId)}
            availableCredits={user?.credits ?? 0}
            generatedCount={resumeGeneratedCount}
          />
        )}

        <footer className="modern-dashboard-footer">
          © {new Date().getFullYear()} ATS Scan AI. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
