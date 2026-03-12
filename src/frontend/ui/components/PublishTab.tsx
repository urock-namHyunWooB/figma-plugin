import React, { useState, useEffect, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { deployComponent, releaseComponent, type DeployStatus } from "../services/deployService";
import { typeCheckCode, type TypeCheckError } from "../services/typeChecker";
import { getStagingCIStatus, type StagingCIStatus } from "../services/GitHubAPI";

interface PublishTabProps {
  componentName: string;
  generatedCode: string | null;
  deployCodes: { emotion: string; tailwind: string } | null;
  figmaNodeId: string | undefined;
}

// ─── Deploy step definitions ───

const DEPLOY_STEPS = [
  { key: "checking-pr", label: "PR 확인" },
  { key: "creating-branch", label: "브랜치 생성" },
  { key: "committing", label: "커밋" },
  { key: "creating-pr", label: "PR 생성" },
  { key: "verifying", label: "검증" },
] as const;

const RELEASE_STEPS = [
  { key: "checking-pr", label: "스테이징 PR 확인" },
  { key: "checking-ci", label: "CI 확인" },
  { key: "merging", label: "머지" },
  { key: "waiting-release", label: "릴리즈 PR 대기" },
  { key: "release-merge", label: "릴리즈 머지" },
] as const;

type FlowType = "deploy" | "release" | null;

function getStepIndex(steps: readonly { key: string }[], currentStep: string): number {
  // "merging" appears twice in release flow — second occurrence is release-merge
  return steps.findIndex((s) => s.key === currentStep);
}

// ─── Styles ───

const sectionStyle = css`
  margin-bottom: 20px;
`;

const sectionTitleStyle = css`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  margin-bottom: 8px;
`;

const targetCardStyle = css`
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
`;

const targetRowStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
  &:not(:last-child) { margin-bottom: 6px; }
`;

const targetLabelStyle = css`
  color: #9ca3af;
  min-width: 56px;
  flex-shrink: 0;
`;

const targetValueStyle = css`
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 11px;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const checklistStyle = css`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const checkItemStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #374151;
`;

const checkIconStyle = (passed: boolean) => css`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  ${passed
    ? "background: #dcfce7; color: #16a34a;"
    : "background: #f3f4f6; color: #9ca3af; border: 1px solid #e5e7eb;"}
`;

const actionsStyle = css`
  display: flex;
  gap: 8px;
`;

const buttonBase = css`
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const deployBtnStyle = css`
  ${buttonBase}
  background: #8b5cf6;
  color: #fff;
  &:hover:not(:disabled) { background: #7c3aed; }
`;

const releaseBtnStyle = css`
  ${buttonBase}
  background: #f97316;
  color: #fff;
  &:hover:not(:disabled) { background: #ea580c; }
`;

const stepperStyle = css`
  display: flex;
  align-items: center;
  gap: 0;
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
      ? "background: #8b5cf6; color: #fff; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);"
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
    ? "color: #8b5cf6; font-weight: 600;"
    : state === "done"
      ? "color: #16a34a;"
      : "color: #9ca3af;"}
`;

const statusMessageStyle = css`
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
`;

const errorListStyle = css`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 10px;
  max-height: 160px;
  overflow-y: auto;
`;

const errorItemStyle = css`
  font-size: 11px;
  font-family: "SF Mono", "Fira Code", monospace;
  color: #dc2626;
  padding: 3px 0;
  &:not(:last-child) {
    border-bottom: 1px solid #fecaca;
    padding-bottom: 6px;
    margin-bottom: 3px;
  }
`;

const errorLocStyle = css`
  color: #9ca3af;
  margin-right: 6px;
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
`;

const prLinkStyle = css`
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 500;
`;

const errorBannerStyle = css`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  color: #dc2626;
`;

const emptyStateStyle = css`
  text-align: center;
  padding: 40px 16px;
  color: #9ca3af;
  font-size: 13px;
`;

// CI status styles

const ciCardStyle = css`
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
`;

const ciHeaderStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const ciPrLinkStyle = css`
  font-size: 11px;
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
`;

const ciRefreshBtnStyle = css`
  padding: 2px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  font-size: 10px;
  color: #6b7280;
  cursor: pointer;
  &:hover { background: #f3f4f6; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ciRunStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  &:not(:last-child) {
    border-bottom: 1px solid #f3f4f6;
    padding-bottom: 6px;
    margin-bottom: 2px;
  }
`;

const ciDotStyle = (status: "success" | "failure" | "pending") => css`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  ${status === "success"
    ? "background: #16a34a;"
    : status === "failure"
      ? "background: #dc2626;"
      : "background: #f59e0b; animation: pulse 1.5s ease-in-out infinite;"}
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

const ciRunNameStyle = css`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
`;

const ciRunStatusStyle = (status: "success" | "failure" | "pending") => css`
  font-size: 10px;
  font-weight: 500;
  flex-shrink: 0;
  ${status === "success"
    ? "color: #16a34a;"
    : status === "failure"
      ? "color: #dc2626;"
      : "color: #f59e0b;"}
`;

const ciEmptyStyle = css`
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  padding: 8px;
`;

const ciOverallStyle = (status: "success" | "failure" | "pending") => css`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  font-weight: 600;
  ${status === "success"
    ? "color: #16a34a;"
    : status === "failure"
      ? "color: #dc2626;"
      : "color: #f59e0b;"}
`;

// ─── Component ───

const BUSY_STEPS = new Set([
  "checking-pr", "creating-branch", "committing", "creating-pr",
  "verifying", "checking-ci", "merging", "waiting-release",
]);

export function PublishTab({ componentName, generatedCode, deployCodes, figmaNodeId }: PublishTabProps) {
  const [status, setStatus] = useState<DeployStatus>({ step: "idle" });
  const [activeFlow, setActiveFlow] = useState<FlowType>(null);
  const [typeErrors, setTypeErrors] = useState<TypeCheckError[]>([]);
  const [typeCheckPassed, setTypeCheckPassed] = useState(false);
  const [ciStatus, setCIStatus] = useState<StagingCIStatus | null>(null);
  const [ciLoading, setCILoading] = useState(false);
  const ciPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBusy = BUSY_STEPS.has(status.step);
  const isDone = status.step === "done";
  const isReleaseDone = status.step === "release-done";
  const isError = status.step === "error";

  // CI status fetch
  const fetchCI = useCallback(async () => {
    setCILoading(true);
    try {
      const result = await getStagingCIStatus();
      setCIStatus(result);
      return result;
    } catch {
      // API 호출 실패 시 무시 (Figma 외부 환경 등)
      return null;
    } finally {
      setCILoading(false);
    }
  }, []);

  // 마운트 시 + Deploy 완료 후 CI 상태 조회
  useEffect(() => {
    fetchCI();
  }, [fetchCI]);

  useEffect(() => {
    if (isDone) {
      fetchCI();
    }
  }, [isDone, fetchCI]);

  // pending 상태일 때 15초 간격 자동 폴링
  useEffect(() => {
    if (ciStatus?.overall === "pending") {
      ciPollRef.current = setInterval(() => { fetchCI(); }, 15000);
    }
    return () => {
      if (ciPollRef.current) {
        clearInterval(ciPollRef.current);
        ciPollRef.current = null;
      }
    };
  }, [ciStatus?.overall, fetchCI]);

  // Checklist
  const hasComponent = Boolean(componentName);
  const hasCode = Boolean(generatedCode);
  const hasNodeId = Boolean(figmaNodeId);

  // Run type check on both codes
  useEffect(() => {
    if (!deployCodes || !componentName) {
      setTypeErrors([]);
      setTypeCheckPassed(false);
      return;
    }
    const emotionResult = typeCheckCode(deployCodes.emotion, `${componentName}.tsx`);
    const tailwindResult = typeCheckCode(deployCodes.tailwind, `${componentName}.tsx`);
    const allErrors = [
      ...emotionResult.errors.map((e) => ({ ...e, message: `[Emotion] ${e.message}` })),
      ...tailwindResult.errors.map((e) => ({ ...e, message: `[Tailwind] ${e.message}` })),
    ];
    setTypeCheckPassed(emotionResult.success && tailwindResult.success);
    setTypeErrors(allErrors);
  }, [deployCodes, componentName]);

  const safeName = componentName.replace(/\s+/g, "");

  const handleDeploy = useCallback(async () => {
    if (!deployCodes || !componentName || !figmaNodeId) return;

    // Pre-check type errors
    if (!typeCheckPassed) {
      setStatus({ step: "error", message: `TS 타입 에러 ${typeErrors.length}건 — 아래 에러를 확인하세요.` });
      return;
    }

    setActiveFlow("deploy");
    await deployComponent(componentName, deployCodes, figmaNodeId, setStatus);
  }, [deployCodes, componentName, figmaNodeId, typeCheckPassed, typeErrors.length]);

  const handleRelease = useCallback(async () => {
    setActiveFlow("release");
    await releaseComponent(setStatus);
  }, []);

  // Pick steps based on active flow
  const steps = activeFlow === "release" ? RELEASE_STEPS : DEPLOY_STEPS;

  const currentStepIndex = (() => {
    if (status.step === "idle" || isDone || isReleaseDone || isError) return -1;
    // Release flow: second "merging" maps to release-merge
    if (activeFlow === "release" && status.step === "merging" && status.message?.includes("릴리즈")) {
      return RELEASE_STEPS.findIndex((s) => s.key === "release-merge");
    }
    return getStepIndex(steps, status.step);
  })();

  if (!hasComponent && !hasCode) {
    return <div css={emptyStateStyle}>Figma에서 컴포넌트를 선택하세요</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Deploy Target */}
      <div css={sectionStyle}>
        <div css={sectionTitleStyle}>배포 대상</div>
        <div css={targetCardStyle}>
          <div css={targetRowStyle}>
            <span css={targetLabelStyle}>컴포넌트</span>
            <span css={targetValueStyle}>{componentName || "—"}</span>
          </div>
          <div css={targetRowStyle}>
            <span css={targetLabelStyle}>Emotion</span>
            <span css={targetValueStyle}>{safeName ? `packages/react/src/components/${safeName}.tsx` : "—"}</span>
          </div>
          <div css={targetRowStyle}>
            <span css={targetLabelStyle}>Tailwind</span>
            <span css={targetValueStyle}>{safeName ? `packages/react-tailwind/src/components/${safeName}.tsx` : "—"}</span>
          </div>
          {figmaNodeId && (
            <div css={targetRowStyle}>
              <span css={targetLabelStyle}>Node ID</span>
              <span css={targetValueStyle}>{figmaNodeId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div css={sectionStyle}>
        <div css={sectionTitleStyle}>체크리스트</div>
        <div css={checklistStyle}>
          <div css={checkItemStyle}>
            <span css={checkIconStyle(hasComponent)}>{hasComponent ? "✓" : ""}</span>
            컴포넌트 선택됨
          </div>
          <div css={checkItemStyle}>
            <span css={checkIconStyle(hasCode)}>{hasCode ? "✓" : ""}</span>
            코드 생성 완료
          </div>
          <div css={checkItemStyle}>
            <span css={checkIconStyle(typeCheckPassed)}>
              {typeCheckPassed ? "✓" : typeErrors.length > 0 ? "!" : ""}
            </span>
            타입 체크 통과
            {typeErrors.length > 0 && (
              <span style={{ color: "#dc2626", fontSize: 11 }}>({typeErrors.length}건 에러)</span>
            )}
          </div>
        </div>
      </div>

      {/* Type Errors */}
      {typeErrors.length > 0 && (
        <div css={sectionStyle}>
          <div css={sectionTitleStyle}>타입 에러</div>
          <div css={errorListStyle}>
            {typeErrors.map((err, i) => (
              <div key={i} css={errorItemStyle}>
                <span css={errorLocStyle}>L{err.line}:{err.column}</span>
                {err.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div css={sectionStyle}>
        <div css={actionsStyle}>
          <button
            css={deployBtnStyle}
            onClick={handleDeploy}
            disabled={!deployCodes || !hasNodeId || isBusy}
          >
            {isBusy && activeFlow === "deploy" ? "Deploying..." : "Deploy"}
          </button>
          <button
            css={releaseBtnStyle}
            onClick={handleRelease}
            disabled={isBusy}
          >
            {isBusy && activeFlow === "release" ? "Releasing..." : "Release"}
          </button>
        </div>
      </div>

      {/* CI Status */}
      {ciStatus && (
        <div css={sectionStyle}>
          <div css={sectionTitleStyle}>CI 빌드 상태</div>
          <div css={ciCardStyle}>
            <div css={ciHeaderStyle}>
              <a
                css={ciPrLinkStyle}
                href={ciStatus.pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open(ciStatus.pr.html_url, "_blank"); }}
              >
                PR #{ciStatus.pr.number}
              </a>
              <button css={ciRefreshBtnStyle} onClick={fetchCI} disabled={ciLoading}>
                {ciLoading ? "..." : "Refresh"}
              </button>
            </div>
            {ciStatus.checks.length === 0 ? (
              <div css={ciEmptyStyle}>체크 런 대기 중...</div>
            ) : (
              <>
                {ciStatus.checks.map((run) => {
                  const runStatus: "success" | "failure" | "pending" =
                    run.status !== "completed" ? "pending"
                    : run.conclusion === "failure" ? "failure"
                    : "success";
                  const label =
                    runStatus === "success" ? "passed"
                    : runStatus === "failure" ? "failed"
                    : run.status === "in_progress" ? "running" : "queued";
                  return (
                    <div key={run.name} css={ciRunStyle}>
                      <div css={ciDotStyle(runStatus)} />
                      <span css={ciRunNameStyle}>{run.name}</span>
                      <span css={ciRunStatusStyle(runStatus)}>{label}</span>
                    </div>
                  );
                })}
                <div css={ciOverallStyle(ciStatus.overall)}>
                  {ciStatus.overall === "success" ? "✓ 모든 체크 통과" :
                   ciStatus.overall === "failure" ? "✗ 빌드 실패" :
                   "● 빌드 진행 중..."}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step Progress */}
      {isBusy && activeFlow && (
        <div css={sectionStyle}>
          <div css={sectionTitleStyle}>진행 상황</div>
          <div css={stepperStyle}>
            {steps.map((step, i) => {
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
            {steps.map((step, i) => {
              const state = i < currentStepIndex ? "done" : i === currentStepIndex ? "active" : "pending";
              return (
                <span key={step.key} css={stepLabelStyle(state)}>{step.label}</span>
              );
            })}
          </div>
          {status.step !== "idle" && "message" in status && (
            <div css={statusMessageStyle}>{status.message}</div>
          )}
        </div>
      )}

      {/* Success */}
      {isDone && "prUrl" in status && (
        <div css={successBannerStyle}>
          <span>✓</span>
          <span>Deploy 완료 —</span>
          <a
            css={prLinkStyle}
            href={status.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open(status.prUrl, "_blank"); }}
          >
            PR 보기
          </a>
        </div>
      )}

      {isReleaseDone && "message" in status && (
        <div css={successBannerStyle}>
          <span>✓</span>
          <span>{status.message}</span>
        </div>
      )}

      {/* Error */}
      {isError && "message" in status && (
        <div css={errorBannerStyle}>{status.message}</div>
      )}
    </div>
  );
}
