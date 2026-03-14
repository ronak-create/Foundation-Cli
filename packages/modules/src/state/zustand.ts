import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const STORE_TS = `import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface AppState {
  // ── UI ──────────────────────────────────────────────────────────────────────
  theme: "light" | "dark";
  toggleTheme: () => void;

  // ── User ─────────────────────────────────────────────────────────────────────
  user: { id: string; email: string } | null;
  setUser: (user: AppState["user"]) => void;
  clearUser: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // UI
        theme: "light",
        toggleTheme: () =>
          set((s) => ({ theme: s.theme === "light" ? "dark" : "light" }), false, "toggleTheme"),

        // User
        user: null,
        setUser:  (user)  => set({ user },  false, "setUser"),
        clearUser: ()      => set({ user: null }, false, "clearUser"),
      }),
      { name: "<%= projectName %>-store" },
    ),
    { name: "<%= projectName %>" },
  ),
);
`;

export const zustandModule: PluginDefinition = {
  manifest: {
    id: "state-zustand",
    name: "Zustand",
    version: "1.0.0",
    description: "Zustand global store with devtools and localStorage persistence",
    category: "state",
    dependencies: [
      { name: "zustand", version: "^4.5.4", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/store/index.ts", content: STORE_TS },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["state-redux", "state-tanstack-query"],
    },
  },
};
