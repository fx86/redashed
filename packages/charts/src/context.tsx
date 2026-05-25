"use client";

import React, { createContext, useContext, useMemo } from "react";
import { ChartRegistry, createRegistry } from "./registry";
import type { ChartDefinition } from "./registry";
import { ThemeRegistry, createThemeRegistry } from "./theme-registry";
import { tufteDark, builtinThemes } from "./theme";
import type { ThemeSpec } from "./theme";

interface ChartContextValue {
  registry: ChartRegistry;
  themeRegistry: ThemeRegistry;
  theme: ThemeSpec;
}

const ChartContext = createContext<ChartContextValue | null>(null);

interface ChartProviderProps {
  /** Base chart registry. Defaults to an empty registry — pass builtinCharts or createRegistry(builtinCharts). */
  registry?: ChartRegistry;
  /** Extra chart definitions registered on top of the provided registry. */
  extraCharts?: ChartDefinition[];
  /** Default theme used when a chart has no themeName. Defaults to tufteDark. */
  theme?: ThemeSpec;
  /** Base theme registry. Defaults to one pre-loaded with builtinThemes. */
  themeRegistry?: ThemeRegistry;
  /** Extra themes registered on top of the provided themeRegistry. */
  extraThemes?: Record<string, ThemeSpec>;
  children: React.ReactNode;
}

export function ChartProvider({
  registry: registryProp,
  extraCharts,
  theme = tufteDark,
  themeRegistry: themeRegistryProp,
  extraThemes,
  children,
}: ChartProviderProps) {
  const registry = useMemo(() => {
    const base = registryProp ?? createRegistry();
    if (extraCharts?.length) base.register(extraCharts);
    return base;
  }, [registryProp, extraCharts]);

  const themeRegistry = useMemo(() => {
    const base = themeRegistryProp ?? createThemeRegistry(builtinThemes);
    if (extraThemes) base.register(extraThemes);
    return base;
  }, [themeRegistryProp, extraThemes]);

  const value = useMemo(
    () => ({ registry, themeRegistry, theme }),
    [registry, themeRegistry, theme],
  );

  return <ChartContext.Provider value={value}>{children}</ChartContext.Provider>;
}

export function useChartContext(): ChartContextValue {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error("useChartContext must be used inside <ChartProvider>");
  return ctx;
}

export function useRegistry(): ChartRegistry {
  return useChartContext().registry;
}

export function useThemeRegistry(): ThemeRegistry {
  return useChartContext().themeRegistry;
}

export function useChartTheme(): ThemeSpec {
  return useChartContext().theme;
}
