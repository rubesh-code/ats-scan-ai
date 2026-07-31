import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Upload,
} from "lucide-react";

type DemoStage = "idle" | "uploading" | "scanning" | "complete";

const DEMO_RESULT = {
  overall: 87,
  keywordMatch: 92,
  skillsMatch: 84,
  formatting: 78,
  experience: 90,
};

export default function LandingScanAnimation() {
  const [stage, setStage] = useState<DemoStage>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState(
    "Software_Engineer_Resume.pdf",
  );
  const [fileSize, setFileSize] = useState("245 KB");
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  function runStage(
    nextStage: DemoStage,
    duration: number,
    onComplete: () => void,
  ) {
    clearTimer();
    setStage(nextStage);
    setProgress(0);

    const interval = 45;
    const step = 100 / (duration / interval);

    timerRef.current = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + step, 100);

        if (next >= 100) {
          clearTimer();

          window.setTimeout(() => {
            onComplete();
          }, 240);
        }

        return next;
      });
    }, interval);
  }

  function startDemo(file?: File) {
    if (file) {
      const lowerName = file.name.toLowerCase();

      const isAllowedFile = [".pdf", ".docx", ".txt"].some(
        (extension) => lowerName.endsWith(extension),
      );

      if (!isAllowedFile) {
        alert("Please choose a PDF, DOCX, or TXT resume.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Maximum file size is 5 MB.");
        return;
      }

      setFileName(file.name);

      setFileSize(
        file.size < 1024 * 1024
          ? `${Math.max(1, Math.round(file.size / 1024))} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      );
    }

    runStage("uploading", 1500, () => {
      runStage("scanning", 2800, () => {
        setStage("complete");
        setProgress(100);
      });
    });
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (file) {
      startDemo(file);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      startDemo(file);
    }
  }

  function resetDemo() {
    clearTimer();
    setStage("idle");
    setProgress(0);
  }

  const activeStep =
    stage === "idle"
      ? 0
      : stage === "uploading"
        ? 1
        : stage === "scanning"
          ? 2
          : 3;

  return (
    <div className="hero-animation-wrap">
      <section
        className="resume-animation"
        aria-label="Resume scan demonstration"
      >
        <div className="scan-step-header">
          <span
            className={activeStep >= 1 ? "active" : ""}
          >
            Upload
          </span>

          <i />

          <span
            className={activeStep >= 2 ? "active" : ""}
          >
            Scan
          </span>

          <i />

          <span
            className={activeStep >= 3 ? "active" : ""}
          >
            Results
          </span>
        </div>

        {stage === "idle" && (
          <div
            className={`upload-drop-zone ${
              dragging ? "dragging" : ""
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              hidden
              onChange={handleFileChange}
            />

            <div className="upload-icon">
              <Upload size={34} />
            </div>

            <h3>
              Drag and drop your resume here
            </h3>

            <p>
              PDF, DOCX, or TXT · Maximum 5 MB
            </p>

            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              Upload Resume
            </button>

            <button
              type="button"
              className="scan-secondary-button"
              onClick={() => {
                startDemo();
              }}
              style={{ marginTop: 12 }}
            >
              Run Demo
              <ArrowRight size={17} />
            </button>
          </div>
        )}

        {stage !== "idle" && (
          <div className="scan-animation-content">
            <div
              className={`document-animation ${
                stage === "scanning"
                  ? "is-scanning"
                  : ""
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

                {stage === "scanning" && (
                  <span className="scanner-line" />
                )}
              </div>

              {stage === "complete" && (
                <div
                  className="result-celebration"
                  aria-hidden="true"
                >
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
                <strong>{fileName}</strong>
                <small>{fileSize}</small>
              </div>

              <span
                className={`file-status ${stage}`}
              >
                {stage === "uploading" &&
                  "Uploading"}

                {stage === "scanning" &&
                  "Scanning"}

                {stage === "complete" &&
                  "Analyzed"}
              </span>
            </div>

            {(stage === "uploading" ||
              stage === "scanning") && (
              <div className="progress-section">
                <div className="progress-heading">
                  <span>
                    {stage === "uploading"
                      ? "Uploading resume..."
                      : "Scanning ATS compatibility..."}
                  </span>

                  <strong>
                    {Math.round(progress)}%
                  </strong>
                </div>

                <div className="progress-track">
                  <span
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>

                <p>
                  {stage === "uploading"
                    ? "Preparing your resume for analysis."
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
                      "--score": `${
                        DEMO_RESULT.overall * 3.6
                      }deg`,
                    } as CSSProperties
                  }
                >
                  <div>
                    <strong>
                      {DEMO_RESULT.overall}
                    </strong>

                    <small>/100</small>
                  </div>
                </div>

                <h3>Great match!</h3>

                <p>
                  Your resume is ready for a
                  detailed ATS report.
                </p>

                <DemoMetric
                  label="Keyword match"
                  value={
                    DEMO_RESULT.keywordMatch
                  }
                />

                <DemoMetric
                  label="Skills match"
                  value={
                    DEMO_RESULT.skillsMatch
                  }
                />

                <DemoMetric
                  label="Formatting"
                  value={
                    DEMO_RESULT.formatting
                  }
                />

                <DemoMetric
                  label="Experience relevance"
                  value={
                    DEMO_RESULT.experience
                  }
                />

                <div className="result-actions">
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById("login")
                        ?.scrollIntoView({
                          behavior: "smooth",
                        });
                    }}
                  >
                    <CheckCircle2 size={17} />
                    Get Full Report
                  </button>

                  <button
                    type="button"
                    className="scan-secondary-button"
                    onClick={resetDemo}
                  >
                    Scan Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
        <span
          style={{
            width: `${value}%`,
          }}
        />
      </div>
    </div>
  );
}