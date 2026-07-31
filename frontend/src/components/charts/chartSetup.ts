"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

// Register all Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Default styling for all charts
ChartJS.defaults.color = "rgba(255,255,255,0.6)";
ChartJS.defaults.borderColor = "rgba(255,255,255,0.06)";
ChartJS.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";

export { ChartJS };
