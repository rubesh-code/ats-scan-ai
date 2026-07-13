import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { load } from "@cashfreepayments/cashfree-js";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CirclePlay,
  CreditCard,
  Database,
  Download,
  FileSearch,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";

const TOKEN_KEY = "ats_token";

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pdfList(items?: string[]) {
  if (!items || items.length === 0) {
    return `<p class="muted">None found.</p>`;
  }

  return `
    <ul>
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function buildPrintableReportHtml(analysis: AtsAnalysis) {
  const history = analysis.history_comparison;

  const historyHtml =
    history && history.has_previous_scans
      ? `
      <section class="box">
        <h2>History Comparison</h2>
        <div class="metrics">
          <div><span>Latest Previous</span><strong>${escapeHtml(history.latest_previous_score ?? "N/A")}</strong></div>
          <div><span>Previous Best</span><strong>${escapeHtml(history.previous_best_score ?? "N/A")}</strong></div>
          <div><span>Change From Latest</span><strong>${escapeHtml(renderScoreChange(history.score_change_from_latest))}</strong></div>
          <div><span>Change From Best</span><strong>${escapeHtml(renderScoreChange(history.score_change_from_best))}</strong></div>
        </div>
        <h3>Progress Summary</h3>
        <p>${escapeHtml(history.progress_summary || "No progress summary available.")}</p>
        <h3>Improved Areas</h3>
        ${pdfList(history.improved_areas)}
        <h3>Repeated Issues</h3>
        ${pdfList(history.repeated_issues)}
        <h3>New Issues</h3>
        ${pdfList(history.new_issues)}
      </section>
    `
      : `
      <section class="box">
        <h2>History Comparison</h2>
        <p class="muted">This is the first scan. Analyze again to compare improvements.</p>
      </section>
    `;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ATS Scan AI Report</title>
  <style>
    body { margin: 0; padding: 32px; font-family: Arial, sans-serif; color: #0f172a; background: #fff; line-height: 1.55; }
    .header { padding: 28px; border-radius: 18px; background: linear-gradient(135deg, #172554, #2563eb); color: white; margin-bottom: 24px; }
    .header h1 { margin: 0 0 8px; font-size: 32px; }
    .header p { margin: 0; color: #dbeafe; }
    .score { padding: 22px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe; margin-bottom: 20px; }
    .score span { display: block; font-weight: 700; color: #1d4ed8; margin-bottom: 6px; }
    .score strong { font-size: 48px; }
    .box { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin: 18px 0; background: #f8fafc; page-break-inside: avoid; }
    h2 { margin: 0 0 14px; font-size: 22px; }
    h3 { margin: 18px 0 8px; font-size: 17px; }
    ul { margin-top: 8px; padding-left: 22px; }
    li { margin-bottom: 6px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .metrics div { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
    .metrics span { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 8px; }
    .metrics strong { font-size: 24px; }
    .muted { color: #64748b; }
    .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ATS Scan AI Report</h1>
    <p>Generated on ${escapeHtml(new Date().toLocaleString())}</p>
  </div>

  <section class="score">
    <span>ATS Score</span>
    <strong>${escapeHtml(analysis.ats_score)}/100</strong>
  </section>

  ${historyHtml}

  <section class="box"><h2>Resume Summary</h2><p>${escapeHtml(analysis.resume_summary)}</p></section>
  <section class="box"><h2>Matched Skills</h2>${pdfList(analysis.matched_skills)}</section>
  <section class="box"><h2>Missing Skills</h2>${pdfList(analysis.missing_skills)}</section>
  <section class="box"><h2>Missing Keywords</h2>${pdfList(analysis.missing_keywords)}</section>
  <section class="box"><h2>Experience Match</h2><p>${escapeHtml(analysis.experience_match)}</p></section>
  <section class="box"><h2>Education Match</h2><p>${escapeHtml(analysis.education_match)}</p></section>
  <section class="box"><h2>Formatting Issues</h2>${pdfList(analysis.formatting_issues)}</section>
  <section class="box"><h2>Improvement Suggestions</h2>${pdfList(analysis.improvement_suggestions)}</section>
  <section class="box"><h2>Better Bullet Points</h2>${pdfList(analysis.better_bullet_points)}</section>
  <section class="box"><h2>Final Recommendation</h2><p>${escapeHtml(analysis.final_recommendation)}</p></section>

  <div class="footer">ATS Scan AI report. Use this report as guidance and review manually before applying.</div>
</body>
</html>
`;
}

function downloadReportAsPdf(analysis: AtsAnalysis) {
  const reportWindow = window.open("", "_blank", "width=900,height=700");

  if (!reportWindow) {
    alert("Popup blocked. Please allow popups to download the report.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildPrintableReportHtml(analysis));
  reportWindow.document.close();
  reportWindow.focus();

  setTimeout(() => {
    reportWindow.print();
  }, 500);
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

function Report({ analysis }: { analysis: AtsAnalysis }) {
  return (
    <section className="report-panel" id="reports">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Latest analysis</p>
          <h2>ATS Report</h2>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => downloadReportAsPdf(analysis)}
        >
          <Download size={18} /> Download PDF
        </button>
      </div>

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
          {renderList(analysis.missing_skills)}
        </div>

        <div className="report-card">
          <h3>Missing Keywords</h3>
          {renderList(analysis.missing_keywords)}
        </div>

        <div className="report-card">
          <h3>Formatting Issues</h3>
          {renderList(analysis.formatting_issues)}
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
          {renderList(analysis.improvement_suggestions)}
        </div>

        <div className="report-card wide">
          <h3>Better Bullet Points</h3>
          {renderList(analysis.better_bullet_points)}
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

  const [serverStatus, setServerStatus] = useState("Checking backend...");
  const [supabaseStatus, setSupabaseStatus] = useState("Checking Supabase...");

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

  async function loadScans() {
    if (!token) return;

    const response = await authFetch("/api/scans");

    if (response.ok) {
      setScans(await response.json());
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadUser(), loadScans(), loadPublicData()]);
  }

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setServerStatus(data.message || "API online"))
      .catch(() => setServerStatus("API offline"));

    fetch("/api/supabase/health")
      .then((res) => res.json())
      .then((data) => setSupabaseStatus(data.message || "Supabase online"))
      .catch(() => setSupabaseStatus("Supabase offline"));

    loadPublicData().catch(console.error);
  }, []);

  useEffect(() => {
    if (token) {
      refreshDashboard().catch(console.error);
    }
  }, [token]);

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
      setAuthMessage("OTP sent. Check your email. In local dev, check the terminal log.");
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

      const orderResponse = await authFetch("/api/payment/cashfree/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: selectedPackage.id }),
      });

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(orderData.error || "Could not create Cashfree order.");
      }

      if (!orderData.payment_session_id || !orderData.order_id) {
        throw new Error("Invalid Cashfree order response.");
      }

      const cashfree = await load({
        mode: (orderData.mode || "sandbox") as "sandbox" | "production",
      });

      const checkoutResult = await cashfree.checkout({
        paymentSessionId: orderData.payment_session_id,
        redirectTarget: "_modal",
      });

      if (checkoutResult?.error) {
        throw new Error("Payment was cancelled or failed. Please try again.");
      }

      const verifyResponse = await authFetch("/api/payment/cashfree/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderData.order_id }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || verifyData.message || "Payment verification failed.");
      }

      setPaymentMessage(`Payment successful. ${verifyData.credits_added} credits added.`);
      await refreshDashboard();
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

  function handleAnalyzeEnterKey(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    handleAnalyzeResume();
  }

  const starterPackage = packages[0];

  if (!token) {
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
            <span className="status-chip" title={serverStatus}>
              <span className="status-dot" />
              API Online
            </span>

            <span className="status-chip" title={supabaseStatus}>
              <span className="status-dot" />
              Database
            </span>

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

            <div className="hero-preview">
              <div className="preview-sidebar">
                <Sparkles size={28} />
                <span className="active">Overview</span>
                <span>History</span>
                <span>Reports</span>
                <span>Settings</span>
              </div>

              <div className="preview-main">
                <div>
                  <h3>Resume Analysis</h3>
                  <p>Upload your resume and get an ATS score in seconds.</p>
                </div>

                <div className="preview-upload">
                  <Upload size={36} />
                  <strong>Drag & drop your resume here</strong>
                  <span>PDF or DOCX, max 5MB</span>
                  <button type="button">Upload Resume</button>
                </div>

                <div className="recent-upload">
                  <FileSearch size={22} />
                  <div>
                    <strong>Software_Engineer_Resume.pdf</strong>
                    <span>245 KB</span>
                  </div>
                  <small>Analyzed</small>
                </div>
              </div>

              <div className="preview-score">
                <span>ATS Score</span>
                <div className="preview-ring">
                  <strong>87</strong>
                  <small>/100</small>
                </div>

                <h4>Great Match!</h4>
                <p>Your resume is well-optimized for ATS systems.</p>

                <div className="score-metric">
                  <span>
                    Keyword Match <b>92%</b>
                  </span>
                  <div>
                    <i style={{ width: "92%" }} />
                  </div>
                </div>

                <div className="score-metric">
                  <span>
                    Skills Match <b>84%</b>
                  </span>
                  <div>
                    <i style={{ width: "84%" }} />
                  </div>
                </div>

                <div className="score-metric">
                  <span>
                    Formatting <b>78%</b>
                  </span>
                  <div>
                    <i style={{ width: "78%" }} />
                  </div>
                </div>

                <div className="score-metric">
                  <span>
                    Experience Relevance <b>90%</b>
                  </span>
                  <div>
                    <i style={{ width: "90%" }} />
                  </div>
                </div>
              </div>
            </div>
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

          <section className="landing-lower-grid">
            <div className="steps-card" id="how">
              <p className="eyebrow">Simple process</p>
              <h2>Get ATS-ready in 3 simple steps</h2>

              <div className="step-flow">
                <div>
                  <span>1</span>
                  <h3>Upload Your Resume</h3>
                  <p>Upload your resume in PDF, DOCX, or TXT format.</p>
                </div>

                <div>
                  <span>2</span>
                  <h3>AI Analyzes & Scores</h3>
                  <p>Our AI checks keywords, skills, formatting, and relevance.</p>
                </div>

                <div>
                  <span>3</span>
                  <h3>Improve & Apply</h3>
                  <p>Follow actionable tips, boost your score, and apply confidently.</p>
                </div>
              </div>
            </div>

            <div className="pricing-login-card" id="pricing">
              <div className="pricing-card">
                <p className="eyebrow">Pay as you go</p>
                <h2>Simple, transparent pricing</h2>

                <div className="price-row">
                  <div>
                    <span>10 Credits</span>
                    <strong>â‚¹{starterPackage?.price_inr ?? 29}</strong>
                  </div>

                  <ul>
                    <li>
                      <CheckCircle2 size={16} /> 1 credit = 1 resume analysis
                    </li>
                    <li>
                      <CheckCircle2 size={16} /> ATS score and feedback
                    </li>
                    <li>
                      <CheckCircle2 size={16} /> History comparison
                    </li>
                    <li>
                      <CheckCircle2 size={16} /> Downloadable report
                    </li>
                  </ul>
                </div>
              </div>

              <div className="landing-login-card" id="login">
                <p className="eyebrow">Start scanning</p>
                <h2>Email OTP Login</h2>

                <label>Email address</label>
                <input
                  name="email"
                  value={email}
                  disabled={otpSent || authLoading}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={handleAuthKeyDown}
                  placeholder="you@example.com"
                />

                {otpSent && (
                  <>
                    <label>OTP code</label>
                    <input
                      name="otp"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      onKeyDown={handleAuthKeyDown}
                      placeholder="6 digit code"
                      autoFocus
                    />
                  </>
                )}

                {!otpSent ? (
                  <button type="button" onClick={handleSendOtp} disabled={authLoading}>
                    {authLoading ? "Sending OTP..." : "Send OTP"}
                  </button>
                ) : (
                  <>
                    <div className="otp-action-grid">
                      <button type="button" onClick={handleVerifyOtp} disabled={authLoading}>
                        {authLoading ? "Verifying..." : "Verify OTP"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleResendOtp}
                        disabled={authLoading || resendSeconds > 0}
                      >
                        {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend OTP"}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="text-button"
                      onClick={handleChangeEmail}
                      disabled={authLoading}
                    >
                      Change email address
                    </button>
                  </>
                )}

                {authMessage && <p className="success-text">{authMessage}</p>}
                {authError && <p className="error-text">{authError}</p>}
              </div>
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
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="brand-mark sidebar-brand">
          <Sparkles size={20} />
          <span>ATS Scan AI</span>
        </div>

        <nav className="sidebar-nav">
          <a href="#dashboard" className="active">
            <LayoutDashboard size={18} />
            Dashboard
          </a>
          <a href="#analyze">
            <FileSearch size={18} />
            Analyze
          </a>
          <a href="#reports">
            <BarChart3 size={18} />
            Report
          </a>
          <a href="#history">
            <History size={18} />
            History
          </a>
        </nav>

        <div className="sidebar-user">
          <span>Signed in as</span>
          <strong>{user?.email}</strong>
          <button type="button" className="ghost-button dark" onClick={handleLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="dashboard-main" id="dashboard">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Production dashboard</p>
            <h1>Resume Analyzer</h1>
            <p>Upload resumes, check ATS fit, compare scan history, and download reports.</p>
          </div>

          <div className="health-pills">
            <span title={serverStatus}>
              <ShieldCheck size={16} />
              API Online
            </span>

            <span title={supabaseStatus}>
              <Database size={16} />
              Database
            </span>
          </div>
        </header>

        <section className="stat-grid">
          <div className="stat-card primary">
            <div>
              <span>Available Credits</span>
              <strong>{user?.credits ?? "..."}</strong>
            </div>
            <Wallet size={28} />
          </div>

          <div className="stat-card">
            <div>
              <span>Total Scans</span>
              <strong>{user?.total_scans ?? "..."}</strong>
            </div>
            <FileSearch size={26} />
          </div>

          <div className="stat-card">
            <div>
              <span>Average Score</span>
              <strong>{user?.avg_score ?? "..."}</strong>
            </div>
            <TrendingUp size={26} />
          </div>

          <div className="stat-card buy-card">
            <div>
              <span>Credit Pack</span>
              <strong>{starterPackage ? `â‚¹${starterPackage.price_inr}` : "..."}</strong>
              <small>{starterPackage ? `${starterPackage.credits} credits` : "Loading"}</small>
            </div>

            <button
              type="button"
              onClick={() => starterPackage && handleBuyCredits(starterPackage)}
              disabled={!starterPackage || paymentLoading}
            >
              <CreditCard size={18} />
              {paymentLoading ? "Creating..." : "Buy"}
            </button>
          </div>
        </section>

        {(paymentMessage || paymentError) && (
          <div className="message-row">
            {paymentMessage && <p className="success-text">{paymentMessage}</p>}
            {paymentError && <p className="error-text">{paymentError}</p>}
          </div>
        )}

        <section className="workspace-grid">
          <div className="analyze-panel" id="analyze">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">New scan</p>
                <h2>Analyze Resume</h2>
              </div>
              <Target size={26} />
            </div>

            <div className="upload-dropzone">
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

              <div className="upload-icon">
                <Upload size={28} />
              </div>

              <h3>Upload your resume</h3>
              <p>PDF, DOCX, or TXT. Maximum file size 5 MB.</p>

              <div className="button-row center">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={18} /> Upload Resume
                </button>
              </div>

              <strong className="selected-file">
                {selectedResumeFile ? selectedResumeFile.name : "No file selected yet"}
              </strong>
            </div>

            <label>Job type</label>
            <div className="two-column-form">
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
                  <option key={role.id} value={role.id}>
                    {role.role_name}
                  </option>
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

            <label>Job description</label>
            <textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              rows={7}
              placeholder={DEFAULT_JOB_DESCRIPTION}
            />

            <button
              type="button"
              className="analyze-button"
              onClick={handleAnalyzeResume}
              disabled={analysisLoading}
            >
              <FileSearch size={18} />
              {analysisLoading ? "Analyzing Resume..." : "Analyze Resume"}
            </button>

            {analysisMessage && <p className="success-text">{analysisMessage}</p>}
            {analysisError && <p className="error-text">{analysisError}</p>}
          </div>

          <aside className="history-panel" id="history">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Latest 10</p>
                <h2>Scan History</h2>
              </div>
              <History size={24} />
            </div>

            {scans.length === 0 ? (
              <div className="empty-state">
                <FileSearch size={28} />
                <p>No scans yet. Analyze your first resume to start tracking progress.</p>
              </div>
            ) : (
              <div className="scan-list">
                {scans.map((scan) => (
                  <button
                    type="button"
                    key={scan.id}
                    className="scan-row"
                    onClick={() => scan.result_data && setAnalysis(scan.result_data)}
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
          </aside>
        </section>

        {analysis && <Report analysis={analysis} />}
      </main>
    </div>
  );
}

