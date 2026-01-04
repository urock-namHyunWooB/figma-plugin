import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "20px",
            border: "1px solid #ff6b6b",
            borderRadius: "8px",
            backgroundColor: "#fff5f5",
            color: "#c92a2a",
          }}
        >
          <h3 style={{ margin: "0 0 10px 0" }}>⚠️ 컴포넌트 렌더링 오류</h3>
          <p style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
            컴포넌트를 렌더링하는 중 오류가 발생했습니다.
          </p>
          <details style={{ fontSize: "12px" }}>
            <summary style={{ cursor: "pointer" }}>오류 상세 정보</summary>
            <pre
              style={{
                marginTop: "10px",
                padding: "10px",
                backgroundColor: "#1a1a1a",
                color: "#ff6b6b",
                borderRadius: "4px",
                overflow: "auto",
                maxHeight: "200px",
              }}
            >
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

