import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { CheckCircle2, FileSearch, Upload } from "lucide-react";

type DemoStage = "uploading" | "scanning" | "complete";

const DEMO_RESULT = {
  overall: 87,
  keywordMatch: 92,
  skillsMatch: 84,
  formatting: 78,
  experience: 90,
};

const DEMO_FILE_NAME = "Software_Engineer_Resume.pdf";
const DEMO_FILE_SIZE = "245 KB";

export default function LandingScanAnimation() {
  const [stage, setStage] = useState<DemoStage>("uploading");
  const [progress, setProgress] = useState(0);

  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  function clearTimers() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function scrollToLogin() {
    document.getElementById("login")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    scrollToLogin();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    scrollToLogin();
  }

  function schedule(callback: () => void, delay: number) {
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;

      if (mountedRef.current) callback();
    }, delay);
  }

  function animateProgress(
    nextStage: DemoStage,
    duration: number,
    onComplete: () => void,
  ) {
    clearTimers();

    if (!mountedRef.current) return;

    setStage(nextStage);
    setProgress(0);

    const intervalDuration = 45;
    const progressPerStep = 100 / (duration / intervalDuration);

    intervalRef.current = window.setInterval(() => {
      setProgress((currentProgress) => {
        const nextProgress = Math.min(
          currentProgress + progressPerStep,
          100,
        );

        if (nextProgress >= 100) {
          if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          schedule(onComplete, 300);
        }

        return nextProgress;
      });
    }, intervalDuration);
  }

  function startAnimationCycle() {
    animateProgress("uploading", 1700, () => {
      animateProgress("scanning", 3000, () => {
        if (!mountedRef.current) return;

        setStage("complete");
        setProgress(100);

        schedule(startAnimationCycle, 3200);
      });
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    startAnimationCycle();

    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, []);

  const activeStep =
    stage === "uploading" ? 1 : stage === "scanning" ? 2 : 3;

  return (
    <div className="hero-animation-wrap">
      <section
        className="resume-animation"
        role="button"
        tabIndex={0}
        aria-label="Automatic ATS resume analysis demonstration. Select to get started."
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
      >
        <div className="scan-step-header" aria-hidden="true">
          <span className={activeStep >= 1 ? "active" : ""}>Upload</span>
          <i />
          <span className={activeStep >= 2 ? "active" : ""}>Scan</span>
          <i />
          <span className={activeStep >= 3 ? "active" : ""}>Results</span>
        </div>

        <div className="scan-animation-content">
          <div
            className={`document-animation ${
              stage === "scanning" ? "is-scanning" : ""
            }`}
          >
            <div className="document-sheet">
              <span className="document-fold" />

              <div className="document-lines">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>

              {stage === "uploading" && (
                <div className="demo-upload-symbol" aria-hidden="true">
                  <Upload size={26} />
                </div>
              )}

              {stage === "scanning" && (
                <span className="scanner-line" />
              )}
            </div>

            {stage === "complete" && (
              <div className="result-celebration" aria-hidden="true">
                <span>✦</span>
                <span>✦</span>
                <span>✦</span>
              </div>
            )}
          </div>

          <div className="uploaded-file-row">
            <div className="file-type-icon">
              <FileSearch size={18} />
            </div>

            <div className="file-information">
              <strong>{DEMO_FILE_NAME}</strong>
              <small>{DEMO_FILE_SIZE}</small>
            </div>

            <span className={`file-status ${stage}`}>
              {stage === "uploading" && "Uploading"}
              {stage === "scanning" && "Scanning"}
              {stage === "complete" && "Analyzed"}
            </span>
          </div>

          {(stage === "uploading" || stage === "scanning") && (
            <div className="progress-section">
              <div className="progress-heading">
                <span>
                  {stage === "uploading"
                    ? "Uploading resume..."
                    : "Scanning ATS compatibility..."}
                </span>

                <strong>{Math.round(progress)}%</strong>
              </div>

              <div className="progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>

              <p>
                {stage === "uploading"
                  ? "Preparing the document for analysis."
                  : "Checking keywords, skills, formatting, and experience."}
              </p>
            </div>
          )}

          {stage === "complete" && (
            <div className="scan-result-panel">
              <div
                className="ats-score-ring"
                style={
                  {
                    "--score": `${DEMO_RESULT.overall * 3.6}deg`,
                  } as CSSProperties
                }
              >
                <div>
                  <strong>{DEMO_RESULT.overall}</strong>
                  <small>/100</small>
                </div>
              </div>

              <h3>Great match!</h3>
              <p>Example ATS analysis completed successfully.</p>

              <DemoMetric label="Keyword match" value={DEMO_RESULT.keywordMatch} />
              <DemoMetric label="Skills match" value={DEMO_RESULT.skillsMatch} />
              <DemoMetric label="Formatting" value={DEMO_RESULT.formatting} />
              <DemoMetric
                label="Experience relevance"
                value={DEMO_RESULT.experience}
              />

              <div className="demo-click-hint">
                <CheckCircle2 size={16} />
                Click this animation to start your own scan
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DemoMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="score-bar">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>

      <div className="score-bar-track">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}