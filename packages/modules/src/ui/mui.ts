import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const THEME_TS = `import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#9c27b0",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
});
`;

const THEME_PROVIDER_TSX = `"use client";

import { ThemeProvider, CssBaseline } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { theme } from "@/lib/theme";
import type { ReactNode } from "react";

export function MuiProvider({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
`;

export const muiModule: PluginDefinition = {
  manifest: {
    id: "ui-mui",
    name: "Material UI",
    version: "1.0.0",
    description: "Material UI v5 with custom theme, CssBaseline, and Next.js App Router support",
    category: "ui",
    dependencies: [
      { name: "@mui/material", version: "^5.15.20", scope: "dependencies" },
      { name: "@mui/icons-material", version: "^5.15.20", scope: "dependencies" },
      { name: "@mui/material-nextjs", version: "^5.15.20", scope: "dependencies" },
      { name: "@emotion/react", version: "^11.11.4", scope: "dependencies" },
      { name: "@emotion/styled", version: "^11.11.5", scope: "dependencies" },
      { name: "@emotion/cache", version: "^11.11.0", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/lib/theme.ts", content: THEME_TS },
      { relativePath: "src/components/MuiProvider.tsx", content: THEME_PROVIDER_TSX },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["ui-tailwind", "ui-shadcn", "ui-chakra", "ui-bootstrap"],
    },
  },
};