import type { ThemeSpec } from "./theme";

export class ThemeRegistry {
  private readonly themes = new Map<string, ThemeSpec>();

  register(key: string, theme: ThemeSpec): this;
  register(themes: Record<string, ThemeSpec>): this;
  register(keyOrThemes: string | Record<string, ThemeSpec>, theme?: ThemeSpec): this {
    if (typeof keyOrThemes === "string") {
      this.themes.set(keyOrThemes, theme!);
    } else {
      for (const [k, t] of Object.entries(keyOrThemes)) {
        this.themes.set(k, t);
      }
    }
    return this;
  }

  get(key: string): ThemeSpec | undefined {
    return this.themes.get(key);
  }

  all(): Array<{ key: string; theme: ThemeSpec }> {
    return Array.from(this.themes.entries()).map(([key, theme]) => ({ key, theme }));
  }

  has(key: string): boolean {
    return this.themes.has(key);
  }
}

export function createThemeRegistry(
  themes: Record<string, ThemeSpec> = {},
): ThemeRegistry {
  return new ThemeRegistry().register(themes);
}
