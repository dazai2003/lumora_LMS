"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BrowseRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/student/billing?tab=browse");
  }, [router]);

  return (
    <div className="page-loader" style={{ minHeight: "60vh" }}>
      <div className="spinner" />
    </div>
  );
}
