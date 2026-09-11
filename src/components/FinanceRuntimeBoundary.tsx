"use client";

import Link from "next/link";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default class FinanceRuntimeBoundary extends Component<
  { children: ReactNode; area?: "finance" | "payroll" },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SukuuNova finance workspace render error", {
      area: this.props.area ?? "finance",
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private retry = () => {
    this.setState({ failed: false });
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;

    const payroll = this.props.area === "payroll";
    return (
      <div className="fin-shell">
        <section className="fin-state error">
          <TriangleAlert size={26} />
          <strong>{payroll ? "Payroll needs to be reloaded." : "Finance needs to be reloaded."}</strong>
          <span>
            SukuuNova stopped this workspace from taking down the whole school portal. Reload the latest finance bundle and try again.
          </span>
          <div className="fin-inline-actions">
            <button type="button" className="fin-primary" onClick={this.retry}>
              <RefreshCw size={14} /> Reload workspace
            </button>
            <Link className="fin-secondary" href="/school/fees">
              Finance overview
            </Link>
          </div>
        </section>
      </div>
    );
  }
}
