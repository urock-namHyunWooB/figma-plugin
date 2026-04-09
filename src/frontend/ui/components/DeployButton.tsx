import React, { useState } from "react";
import { css } from "@emotion/react";
import { deployComponent, releaseComponent, type DeployStatus } from "../services/deployService";
import { typeCheckCode } from "../services/typeChecker";

interface DeployButtonProps {
  componentName: string;
  generatedCode: string | null;
  figmaNodeId: string | undefined;
}

const buttonBase = css`
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

const deployButtonStyle = css`
  ${buttonBase}
  background: #8b5cf6;
  color: #ffffff;
  &:hover:not(:disabled) { background: #7c3aed; }
`;

const releaseButtonStyle = css`
  ${buttonBase}
  background: #f97316;
  color: #ffffff;
  &:hover:not(:disabled) { background: #ea580c; }
`;

const statusStyle = css`
  font-size: 11px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const linkStyle = css`
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
  font-size: 11px;
`;

const BUSY_STEPS = new Set([
  "checking-pr", "creating-branch", "committing", "creating-pr",
  "verifying", "checking-ci", "merging", "waiting-release",
]);

export function DeployButton({ componentName, generatedCode, figmaNodeId }: DeployButtonProps) {
  const [status, setStatus] = useState<DeployStatus>({ step: "idle" });

  const isBusy = BUSY_STEPS.has(status.step);
  const isDone = status.step === "done";
  const isReleaseDone = status.step === "release-done";
  const isError = status.step === "error";

  const handleDeploy = async () => {
    if (!generatedCode || !componentName || !figmaNodeId) return;

    // Deploy 전 타입 체크 — CI 실패 사전 차단
    setStatus({ step: "checking-pr", message: "타입 체크 중..." });
    const checkResult = typeCheckCode(generatedCode, `${componentName}.tsx`);
    if (!checkResult.success) {
      const firstError = checkResult.errors[0];
      const errorMsg = `TS 타입 에러 (${checkResult.errors.length}건): L${firstError.line} — ${firstError.message}`;
      setStatus({ step: "error", message: errorMsg });
      return;
    }

    // FIXME: deployComponent now requires { emotion, tailwind } (strategy-split
    // deployment). DeployButton's single-string `generatedCode` prop has not been
    // migrated. This component appears unused (no import sites). Safe to leave
    // as-is until either the deploy workflow or this component is updated.
    await deployComponent(
      componentName,
      { emotion: generatedCode, tailwind: generatedCode },
      figmaNodeId,
      setStatus,
    );
  };

  const handleRelease = async () => {
    await releaseComponent(setStatus);
  };

  const statusColor =
    isDone || isReleaseDone ? "#7dc728" :
    isError ? "#dc2626" :
    "#6b7280";

  return (
    <>
      <button
        css={deployButtonStyle}
        onClick={handleDeploy}
        disabled={!generatedCode || !figmaNodeId || isBusy}
      >
        {isBusy && !status.step.startsWith("checking-ci") && !status.step.startsWith("merging") && !status.step.startsWith("waiting")
          ? "Deploying..." : "Deploy"}
      </button>

      <button
        css={releaseButtonStyle}
        onClick={handleRelease}
        disabled={isBusy}
      >
        {(status.step === "checking-ci" || status.step === "merging" || status.step === "waiting-release")
          ? "Releasing..." : "Release"}
      </button>

      {isDone && (
        <a
          css={linkStyle}
          href={status.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            window.open(status.prUrl, "_blank");
          }}
        >
          PR 생성 완료
        </a>
      )}

      {isReleaseDone && (
        <span css={statusStyle} style={{ color: statusColor }}>
          {status.message}
        </span>
      )}

      {isBusy && "message" in status && (
        <span css={statusStyle} style={{ color: statusColor }}>
          {status.message}
        </span>
      )}

      {isError && (
        <span css={statusStyle} style={{ color: "#dc2626" }}>
          {status.message}
        </span>
      )}
    </>
  );
}
