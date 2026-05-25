"use client";

import { ChartProvider, createRegistry, builtinCharts, tufteDark } from "@bi-tool/charts";
import type { ChartDefinition, ThemeSpec } from "@bi-tool/charts";
import { AuthProvider } from "@/lib/auth";

const defaultRegistry = createRegistry(builtinCharts);

interface ProvidersProps {
  children: React.ReactNode;
  extraCharts?: ChartDefinition[];
  theme?: ThemeSpec;
}

export default function Providers({ children, extraCharts, theme = tufteDark }: ProvidersProps) {
  return (
    <ChartProvider registry={defaultRegistry} extraCharts={extraCharts} theme={theme}>
      <AuthProvider>{children}</AuthProvider>
    </ChartProvider>
  );
}
