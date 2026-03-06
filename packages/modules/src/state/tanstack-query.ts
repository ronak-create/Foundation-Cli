import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const QUERY_CLIENT_TS = `import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          60 * 1000,        // 1 minute
      gcTime:             5 * 60 * 1000,    // 5 minutes
      retry:              1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
`;

const QUERY_PROVIDER_TSX = `"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/query-client";
import type { ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env["NODE_ENV"] === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
`;

const EXAMPLE_HOOK_TS = `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const QUERY_KEYS = {
  users: ["users"] as const,
  user:  (id: string) => ["users", id] as const,
} as const;

interface User {
  id: string;
  email: string;
}

async function fetchUsers(): Promise<User[]> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json() as Promise<User[]>;
}

export function useUsers() {
  return useQuery({
    queryKey: QUERY_KEYS.users,
    queryFn:  fetchUsers,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<User, "id">) => {
      const res = await fetch("/api/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create user");
      return res.json() as Promise<User>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.users }),
  });
}
`;

export const tanstackQueryModule: PluginDefinition = {
  manifest: {
    id: "state-tanstack-query",
    name: "TanStack Query",
    version: "1.0.0",
    description: "TanStack Query v5 with QueryProvider, devtools, and example hooks",
    category: "state",
    dependencies: [
      { name: "@tanstack/react-query", version: "^5.45.0", scope: "dependencies" },
      { name: "@tanstack/react-query-devtools", version: "^5.45.0", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/lib/query-client.ts", content: QUERY_CLIENT_TS },
      { relativePath: "src/components/QueryProvider.tsx", content: QUERY_PROVIDER_TSX },
      { relativePath: "src/hooks/useUsers.ts", content: EXAMPLE_HOOK_TS },
    ],
    configPatches: [],
    compatibility: {
      conflicts: [],
    },
  },
};