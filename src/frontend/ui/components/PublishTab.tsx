import React, { useState, useEffect, useCallback, useRef } from "react";
import { css } from "@emotion/react";
import { deployComponent, type DeployStatus } from "../services/deployService";
import { typeCheckCode, type TypeCheckError } from "../services/typeChecker";
import { findComponentPR, getComponentCIStatus, type ComponentCIStatus } from "../services/GitHubAPI";
import { requestDesignTokens, generateTokensCSS } from "../services/tokenService";

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
  { key: "waiting-ci", label: "CI 빌드" },
] as const;

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
  "checking-pr", "creating-branch", "committing", "creating-pr", "waiting-ci",
]);

export function PublishTab({ componentName, generatedCode, deployCodes, figmaNodeId }: PublishTabProps) {
  const [status, setStatus] = useState<DeployStatus>({ step: "idle" });
  const [typeErrors, setTypeErrors] = useState<TypeCheckError[]>([]);
  const [typeCheckPassed, setTypeCheckPassed] = useState(false);
  const [ciStatus, setCIStatus] = useState<ComponentCIStatus | null>(null);
  const [ciLoading, setCILoading] = useState(false);
  const ciPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 컴포넌트 전환 시 기존 PR 상태 확인
  useEffect(() => {
    setStatus({ step: "idle" });
    setCIStatus(null);

    if (!componentName) return;

    const safeName = componentName.replace(/\s+/g, "");
    findComponentPR(safeName).then((pr) => {
      if (pr) {
        setStatus({ step: "done", prUrl: pr.html_url });
      }
    }).catch(() => {});
  }, [componentName, figmaNodeId]);

  const isBusy = BUSY_STEPS.has(status.step);
  const isDone = status.step === "done";
  const isError = status.step === "error";

  // CI status fetch — 현재 컴포넌트 PR만 조회
  const fetchCI = useCallback(async () => {
    if (!componentName) return null;
    setCILoading(true);
    try {
      const result = await getComponentCIStatus(componentName.replace(/\s+/g, ""));
      setCIStatus(result);
      return result;
    } catch {
      return null;
    } finally {
      setCILoading(false);
    }
  }, [componentName]);

  // 마운트 시 + Deploy 완료 후 CI 상태 조회
  useEffect(() => {
    fetchCI();
  }, [fetchCI]);

  useEffect(() => {
    if (isDone) {
      fetchCI();
    }
  }, [isDone, fetchCI]);

  // pending 상태면 15초 간격 자동 폴링
  const hasPending = ciStatus?.overall === "pending";
  useEffect(() => {
    if (hasPending) {
      ciPollRef.current = setInterval(() => { fetchCI(); }, 15000);
    }
    return () => {
      if (ciPollRef.current) {
        clearInterval(ciPollRef.current);
        ciPollRef.current = null;
      }
    };
  }, [hasPending, fetchCI]);

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

    // 디자인 토큰 추출 → tokens.css 생성
    let tokensCss: string | undefined;
    try {
      setStatus({ step: "committing", message: "디자인 토큰 추출 중..." });
      const tokens = await requestDesignTokens();
      if (tokens.length > 0) {
        tokensCss = generateTokensCSS(tokens);
      }
    } catch (e) {
      console.warn("디자인 토큰 추출 실패, tokens.css 없이 진행:", e);
    }

    await deployComponent(componentName, deployCodes, figmaNodeId, setStatus, tokensCss);
  }, [deployCodes, componentName, figmaNodeId, typeCheckPassed, typeErrors.length]);

  const currentStepIndex = (status.step === "idle" || isDone || isError)
    ? -1
    : DEPLOY_STEPS.findIndex((s) => s.key === status.step);

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
            {isBusy ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </div>

      {/* CI Status */}
      {ciStatus && (
        <div css={sectionStyle}>
          <div css={sectionTitleStyle}>
            CI 빌드 상태
            <button css={ciRefreshBtnStyle} onClick={fetchCI} disabled={ciLoading} style={{ marginLeft: 8 }}>
              {ciLoading ? "..." : "Refresh"}
            </button>
          </div>
          <div css={ciCardStyle}>
            <div css={ciHeaderStyle}>
              <a
                css={ciPrLinkStyle}
                href={ciStatus.pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { e.preventDefault(); window.open(ciStatus.pr.html_url, "_blank"); }}
              >
                {ciStatus.componentName} — PR #{ciStatus.pr.number}
              </a>
              <span css={ciRunStatusStyle(ciStatus.overall)}>
                {ciStatus.overall === "success" ? "passed" : ciStatus.overall === "failure" ? "failed" : "pending"}
              </span>
            </div>
            {ciStatus.checks.length === 0 ? (
              <div css={ciEmptyStyle}>체크 런 대기 중...</div>
            ) : (
              ciStatus.checks.map((run) => {
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
              })
            )}
          </div>
        </div>
      )}

      {/* Step Progress */}
      {isBusy && (
        <div css={sectionStyle}>
          <div css={sectionTitleStyle}>진행 상황</div>
          <div css={stepperStyle}>
            {DEPLOY_STEPS.map((step, i) => {
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
            {DEPLOY_STEPS.map((step, i) => {
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
          <span>{"message" in status && status.message ? status.message : "Deploy 완료"}{status.prUrl ? " —" : ""}</span>
          {status.prUrl && (
            <a
              css={prLinkStyle}
              href={status.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.preventDefault(); window.open(status.prUrl, "_blank"); }}
            >
              PR 보기
            </a>
          )}
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
