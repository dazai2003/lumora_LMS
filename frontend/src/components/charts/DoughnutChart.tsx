"use client";

import "@/components/charts/chartSetup";
import { Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

interface DoughnutChartProps {
  labels: string[];
  data: number[];
  colors?: string[];
  title?: string;
  description?: string;
  height?: number;
  centerLabel?: string;
}

const DOUGHNUT_COLORS = [
  "rgba(129,140,248,0.85)",
  "rgba(52,211,153,0.85)",
  "rgba(244,114,182,0.85)",
  "rgba(251,191,36,0.85)",
  "rgba(96,165,250,0.85)",
  "rgba(167,139,250,0.85)",
];

export default function DoughnutChart({ labels, data: chartData, colors, title, description, height = 240, centerLabel }: DoughnutChartProps) {
  const data = {
    labels,
    datasets: [
      {
        data: chartData,
        backgroundColor: colors || DOUGHNUT_COLORS.slice(0, chartData.length),
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: { display: true, position: "bottom" as const, labels: { padding: 16, usePointStyle: true, pointStyle: "circle", color: "#64748b", font: { size: 12 } } },
      title: title ? { display: true, text: title, color: "#0f172a", font: { size: 14, weight: "bold" as const }, padding: { bottom: description ? 4 : 8 } } : { display: false },
      subtitle: description ? { display: true, text: description, color: "#64748b", font: { size: 12, weight: "normal" as const }, padding: { bottom: 16 } } : { display: false },
      tooltip: { backgroundColor: "#ffffff", titleColor: "#0f172a", bodyColor: "#334155", borderColor: "#e2e8f0", borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { size: 13 }, bodyFont: { size: 12 } },
    },
  };

  return (
    <div style={{ height, width: "100%", position: "relative" }}>
      <Doughnut data={data} options={options} />
      {centerLabel && (
        <div style={{
          position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)",
          color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600, textAlign: "center", pointerEvents: "none",
        }}>
          {centerLabel}
        </div>
      )}
    </div>
  );
}
