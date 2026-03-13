import React, { useState, useEffect, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { releaseComponent, type DeployStatus } from "../services/deployService";
import {
  getAllComponentCIStatus,
  type ComponentCIStatus,
  type CheckStatus,
} from "../services/GitHubAPI";

// ─── Release step definitions ───

const RELEASE_STEPS = [
  { key: "checking-pr", label: "PR 확인" },
  { key: "checking-ci", label: "CI 확인" },
  { key: "merging", label: "컴포넌트 머지" },
  { key: "waiting-ci", label: "릴리즈 CI" },
  { key: "waiting-release", label: "릴리즈 PR" },
  { key: "release-merge", label: "릴리즈 머지" },
] as const;

const BUSY_STEPS = new Set([
  "checking-pr", "checking-ci", "merging", "waiting-ci", "waiting-release",
]);

// ─── Styles ───

const containerStyle = css`
  padding: 16px;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const headerLeftStyle = css`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const titleStyle = css`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
`;

const refreshBtnStyle = css`
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover { background: #f3f4f6; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const summaryBarStyle = css`
  display: flex;
  gap: 6px;
`;

const summaryBadgeStyle = (status: CheckStatus) => css`
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 12px;
  ${status === "success"
    ? "background: #dcfce7; color: #16a34a;"
    : status === "failure"
      ? "background: #fef2f2; color: #dc2626;"
      : "background: #fef9c3; color: #a16207;"}
`;

const componentCardStyle = css`
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
`;

const componentRowStyle = css`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  font-size: 12px;
  transition: background 0.1s ease;
  &:hover { background: #f3f4f6; }
  &:not(:last-child) {
    border-bottom: 1px solid #f3f4f6;
  }
`;

const statusDotStyle = (status: CheckStatus) => css`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  ${status === "success"
    ? "background: #16a34a;"
    : status === "failure"
      ? "background: #dc2626;"
      : "background: #f59e0b; animation: releasePulse 1.5s ease-in-out infinite;"}
  @keyframes releasePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

const componentNameStyle = css`
  flex: 1;
  font-weight: 500;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const statusLabelStyle = (status: CheckStatus) => css`
  font-size: 10px;
  font-weight: 500;
  flex-shrink: 0;
  ${status === "success"
    ? "color: #16a34a;"
    : status === "failure"
      ? "color: #dc2626;"
      : "color: #f59e0b;"}
`;

const prLinkStyle = css`
  font-size: 10px;
  color: #8b5cf6;
  text-decoration: none;
  flex-shrink: 0;
  font-weight: 500;
  &:hover { text-decoration: underline; }
`;

const releaseBtnStyle = css`
  width: 100%;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #f97316;
  color: #fff;
  &:hover:not(:disabled) { background: #ea580c; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const emptyContainerStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 8px;
`;

const emptyIconStyle = css`
  font-size: 32px;
  opacity: 0.3;
  margin-bottom: 4px;
`;

const emptyTitleStyle = css`
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
`;

const emptyDescStyle = css`
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
`;

const stepperStyle = css`
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 16px;
`;

const stepDotStyle = (state: "done" | "active" | "pending") => css`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  transition: all 0.2s ease;
  ${state === "done"
    ? "background: #dcfce7; color: #16a34a;"
    : state === "active"
      ? "background: #f97316; color: #fff; box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.2);"
      : "background: #f3f4f6; color: #9ca3af;"}
`;

const stepLineStyle = (done: boolean) => css`
  flex: 1;
  height: 2px;
  min-width: 8px;
  transition: background 0.2s ease;
  ${done ? "background: #16a34a;" : "background: #e5e7eb;"}
`;

const stepLabelsStyle = css`
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
`;

const stepLabelStyle = (state: "done" | "active" | "pending") => css`
  font-size: 10px;
  text-align: center;
  flex: 1;
  ${state === "active"
    ? "color: #f97316; font-weight: 600;"
    : state === "done"
      ? "color: #16a34a;"
      : "color: #9ca3af;"}
`;

const statusMessageStyle = css`
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
`;

const successBannerStyle = css`
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #16a34a;
  margin-top: 16px;
`;

const errorBannerStyle = css`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  color: #dc2626;
  margin-top: 16px;
`;

// ─── Component ───

export function ReleaseSection() {
  const [components, setComponents] = useState<ComponentCIStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<DeployStatus>({ step: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = await getAllComponentCIStatus();
      setComponents(statuses);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  // pending 상태면 15초 자동 폴링
  const hasPending = components.some((c) => c.overall === "pending");
  useEffect(() => {
    if (hasPending) {
      pollRef.current = setInterval(fetchComponents, 15000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasPending, fetchComponents]);

  const isBusy = BUSY_STEPS.has(status.step);
  const isReleaseDone = status.step === "release-done";
  const isError = status.step === "error";

  const passed = components.filter((c) => c.overall === "success").length;
  const failed = components.filter((c) => c.overall === "failure").length;
  const pending = components.filter((c) => c.overall === "pending").length;

  const handleRelease = useCallback(async () => {
    setStatus({ step: "idle" });
    await releaseComponent(setStatus);
    fetchComponents();
  }, [fetchComponents]);

  // Step progress
  const currentStepIndex = (() => {
    if (status.step === "idle" || isReleaseDone || isError) return -1;
    if (status.step === "merging" && "message" in status && status.message?.includes("릴리즈")) {
      return RELEASE_STEPS.findIndex((s) => s.key === "release-merge");
    }
    return RELEASE_STEPS.findIndex((s) => s.key === status.step);
  })();

  return (
    <div css={containerStyle}>
      {/* Header */}
      <div css={headerStyle}>
        <div css={headerLeftStyle}>
          <span css={titleStyle}>Release</span>
          <button css={refreshBtnStyle} onClick={fetchComponents} disabled={loading || isBusy}>
            {loading ? "..." : "Refresh"}
          </button>
        </div>
        {components.length > 0 && (
          <div css={summaryBarStyle}>
            {passed > 0 && <span css={summaryBadgeStyle("success")}>{passed} passed</span>}
            {pending > 0 && <span css={summaryBadgeStyle("pending")}>{pending} pending</span>}
            {failed > 0 && <span css={summaryBadgeStyle("failure")}>{failed} failed</span>}
          </div>
        )}
      </div>

      {/* Empty State */}
      {components.length === 0 && !loading ? (
        <div css={emptyContainerStyle}>
          <div css={emptyIconStyle}>&#x1F4E6;</div>
          <div css={emptyTitleStyle}>배포된 컴포넌트가 없습니다</div>
          <div css={emptyDescStyle}>
            Publish 탭에서 컴포넌트를 배포하면<br />
            여기서 릴리즈할 수 있습니다.
          </div>
        </div>
      ) : (
        <>
          {/* Component List */}
          <div css={componentCardStyle}>
            {components.map((comp) => (
              <div key={comp.componentName} css={componentRowStyle}>
                <div css={statusDotStyle(comp.overall)} />
                <span css={componentNameStyle}>{comp.componentName}</span>
                <span css={statusLabelStyle(comp.overall)}>
                  {comp.overall === "success" ? "CI 통과" : comp.overall === "failure" ? "CI 실패" : "대기중"}
                </span>
                <a
                  css={prLinkStyle}
                  href={comp.pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); window.open(comp.pr.html_url, "_blank"); }}
                >
                  #{comp.pr.number}
                </a>
              </div>
            ))}
          </div>

          {/* Release Button */}
          <button css={releaseBtnStyle} onClick={handleRelease} disabled={passed === 0 || isBusy}>
            {isBusy ? "Releasing..." : `Release${passed > 0 ? ` (${passed})` : ""}`}
          </button>
        </>
      )}

      {/* Step Progress */}
      {isBusy && (
        <div>
          <div css={stepperStyle}>
            {RELEASE_STEPS.map((step, i) => {
              const state = i < currentStepIndex ? "done" : i === currentStepIndex ? "active" : "pending";
              return (
                <React.Fragment key={step.key}>
                  {i > 0 && <div css={stepLineStyle(i <= currentStepIndex)} />}
                  <div css={stepDotStyle(state)}>
                    {state === "done" ? "✓" : i + 1}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div css={stepLabelsStyle}>
            {RELEASE_STEPS.map((step, i) => {
              const state = i < currentStepIndex ? "done" : i === currentStepIndex ? "active" : "pending";
              return <span key={step.key} css={stepLabelStyle(state)}>{step.label}</span>;
            })}
          </div>
          {"message" in status && (
            <div css={statusMessageStyle}>{status.message}</div>
          )}
        </div>
      )}

      {/* Success */}
      {isReleaseDone && "message" in status && (
        <div css={successBannerStyle}>
          <span>✓</span>
          <span>{status.message}</span>
        </div>
      )}

      {/* Error */}
      {isError && "message" in status && (
        <div css={errorBannerStyle}>
          {status.message.split("\n").map((line, i) =>
            line.startsWith("http") ? (
              <a
                key={i}
                href={line}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open(line, "_blank"); }}
                style={{ color: "#8b5cf6", textDecoration: "underline", display: "block", marginTop: 4 }}
              >
                Actions 로그 보기
              </a>
            ) : (
              <span key={i}>{line}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
