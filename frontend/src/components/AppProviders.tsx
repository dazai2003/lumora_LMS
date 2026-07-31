"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import ForcePasswordChange from "@/components/ForcePasswordChange";

/**
 * Client-side provider wrapper for Toast notifications and Error Boundaries.
 * Separated from the Server Component root layout.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
        <ForcePasswordChange />
      </ToastProvider>
    </ErrorBoundary>
  );
}
