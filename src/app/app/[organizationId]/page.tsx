"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function BusinessDashboard() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/" + organizationId + "/pos");
  }, [organizationId, router]);

  return <main style={{ maxWidth: 520, margin: "12vh auto", padding: 24, textAlign: "center" }}>
    <strong style={{ fontSize: 24 }}>Fiskalo</strong>
    <p>Po hapet arka fiskale…</p>
  </main>;
}
