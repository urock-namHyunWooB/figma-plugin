import * as React from "react";

/**
 * 에러 바운더리 컴포넌트
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-600 p-4 bg-red-50 rounded">
          <div className="font-semibold mb-2">런타임 에러 발생</div>
          <pre className="text-sm overflow-auto">
            {this.state.error?.message || "알 수 없는 에러"}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

