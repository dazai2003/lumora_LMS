"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    // Redirect to role-specific dashboard
    switch (user.role) {
      case "admin":
        router.replace("/dashboard/admin");
        break;
      case "teacher":
        router.replace("/dashboard/teacher");
        break;
      case "student":
        router.replace("/dashboard/student");
        break;
      default:
        router.replace("/login");
    }
  }, [user, loading, router]);

  return (
    <div className="page-loader">
      <div className="spinner" />
    </div>
  );
}
