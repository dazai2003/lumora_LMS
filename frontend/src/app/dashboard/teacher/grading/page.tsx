"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GradingQueuePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/teacher/al-exams/marking");
  }, [router]);

  return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
      Redirecting to A/L Exam Marking Studio...
    </div>
  );
}
