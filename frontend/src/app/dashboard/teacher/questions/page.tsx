"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherQuestionsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/teacher/qa");
  }, [router]);

  return (
    <div className="page-loader" style={{ minHeight: "60vh" }}>
      <div className="spinner" />
    </div>
  );
}
