/**
 * @file layout.tsx
 * @description Root application layout for Lumora LMS.
 * Configures global styles, application metadata, and mounts core client providers
 * (AuthContext for JWT session state and AppProviders for global UI toasts/dialogs).
 */
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "Lumora - Learning Analytics Platform",
  description: "Advanced learning analytics and course management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AppProviders>{children}</AppProviders>
        </AuthProvider>
      </body>
    </html>
  );
}
