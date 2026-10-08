"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

// AG Grid Community, registered once for every grid in the app.
ModuleRegistry.registerModules([AllCommunityModule]);

// Grid theme built from the app's CSS variables so it follows light and dark mode.
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--panel)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--bg)",
  headerTextColor: "var(--muted)",
  accentColor: "var(--accent)",
  rowHoverColor: "var(--accent-soft)",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontSize: 12,
  headerFontWeight: 600,
  wrapperBorderRadius: 10,
  spacing: 7,
});
