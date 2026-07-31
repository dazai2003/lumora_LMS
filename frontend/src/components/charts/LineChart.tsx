"use client";

import "@/components/charts/chartSetup";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

interface LineChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
  title?: string;
  description?: string;
  height?: number;
}

const GRADIENT_COLORS = [
  { border: "#818cf8", bg: "rgba(129,140,248,0.15)" },
  { border: "#34d399", bg: "rgba(52,211,153,0.15)" },
  { border: "#f472b6", bg: "rgba(244,114,182,0.15)" },
  { border: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
];

export default function LineChart({ labels, datasets, title, description, height = 260 }: LineChartProps) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.borderColor || GRADIENT_COLORS[i % GRADIENT_COLORS.length].border,
      backgroundColor: ds.backgroundColor || GRADIENT_COLORS[i % GRADIENT_COLORS.length].bg,
      borderWidth: 2.5,
      tension: 0.4,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: ds.borderColor || GRADIENT_COLORS[i % GRADIENT_COLORS.length].border,
    })),
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: datasets.length > 1, position: "top" as const, labels: { padding: 16, usePointStyle: true, pointStyle: "circle", color: "#64748b" } },
      title: title ? { display: true, text: title, color: "#0f172a", font: { size: 14, weight: "bold" as const }, padding: { bottom: description ? 4 : 16 } } : { display: false },
      subtitle: description ? { display: true, text: description, color: "#64748b", font: { size: 12, weight: "normal" as const }, padding: { bottom: 16 } } : { display: false },
      tooltip: { backgroundColor: "#ffffff", titleColor: "#0f172a", bodyColor: "#334155", borderColor: "#e2e8f0", borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { size: 13 }, bodyFont: { size: 12 } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#64748b", font: { size: 11 }, maxRotation: 45 } },
      y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { color: "#64748b", font: { size: 11 } } },
    },
  };

  return (
    <div style={{ height, width: "100%" }}>
      <Line data={data} options={options} />
    </div>
  );
}
