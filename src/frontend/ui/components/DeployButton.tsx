import React, { useState } from "react";
import { css } from "@emotion/react";
import { deployComponent, type DeployStatus } from "../services/deployService";

interface DeployButtonProps {
  componentName: string;
  generatedCode: string | null;
}

const deployButtonStyle = css`
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: #8b5cf6;
  color: #ffffff;
  transition: all 0.15s ease;

  &:hover {
    background: #7c3aed;
  }

  &:disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

const statusStyle = css`
  font-size: 11px;
  white-space: nowrap;
`;

const linkStyle = css`
  color: #8b5cf6;
  text-decoration: underline;
  cursor: pointer;
  font-size: 11px;
`;

export function DeployButton({ componentName, generatedCode }: DeployButtonProps) {
  const [status, setStatus] = useState<DeployStatus>({ step: "idle" });

  const isDeploying = status.step !== "idle" && status.step !== "done" && status.step !== "error";

  const handleDeploy = async () => {
    if (!generatedCode || !componentName) return;
    await deployComponent(componentName, generatedCode, setStatus);
  };

  const statusColor =
    status.step === "done" ? "#7dc728" :
    status.step === "error" ? "#dc2626" :
    "#6b7280";

  return (
    <>
      <button
        css={deployButtonStyle}
        onClick={handleDeploy}
        disabled={!generatedCode || isDeploying}
      >
        {isDeploying ? "Deploying..." : "Deploy"}
      </button>

      {status.step === "done" && (
        <a
          css={linkStyle}
          href={status.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Figma 플러그인 iframe에서는 window.open 사용
            e.preventDefault();
            window.open(status.prUrl, "_blank");
          }}
        >
          PR 생성 완료
        </a>
      )}

      {(status.step === "creating-branch" || status.step === "committing" || status.step === "creating-pr") && (
        <span css={statusStyle} style={{ color: statusColor }}>
          {status.message}
        </span>
      )}

      {status.step === "error" && (
        <span css={statusStyle} style={{ color: statusColor }}>
          {status.message}
        </span>
      )}
    </>
  );
}
