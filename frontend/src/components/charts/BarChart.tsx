"use client";

import "@/components/charts/chartSetup";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

interface BarChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
  }[];
  title?: string;
  description?: string;
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
}

const BAR_COLORS = [
  "rgba(129,140,248,0.7)",
  "rgba(52,211,153,0.7)",
  "rgba(244,114,182,0.7)",
  "rgba(251,191,36,0.7)",
  "rgba(96,165,250,0.7)",
];

export default function BarChart({ labels, datasets, title, description, height = 260, horizontal = false, stacked = false }: BarChartProps) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.backgroundColor || BAR_COLORS[i % BAR_COLORS.length],
      borderColor: ds.borderColor || "transparent",
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.65,
    })),
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ("y" as const) : ("x" as const),
    plugins: {
      legend: { display: datasets.length > 1, position: "top" as const, labels: { padding: 16, usePointStyle: true, pointStyle: "rectRounded", color: "#64748b" } },
      title: title ? { display: true, text: title, color: "#0f172a", font: { size: 14, weight: "bold" as const }, padding: { bottom: description ? 4 : 16 } } : { display: false },
      subtitle: description ? { display: true, text: description, color: "#64748b", font: { size: 12, weight: "normal" as const }, padding: { bottom: 16 } } : { display: false },
      tooltip: { backgroundColor: "#ffffff", titleColor: "#0f172a", bodyColor: "#334155", borderColor: "#e2e8f0", borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { size: 13 }, bodyFont: { size: 12 } },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: "#64748b", font: { size: 11 } } },
      y: { stacked, beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { color: "#64748b", font: { size: 11 } } },
    },
  };

  return (
    <div style={{ height, width: "100%" }}>
      <Bar data={data} options={options} />
    </div>
  );
}
