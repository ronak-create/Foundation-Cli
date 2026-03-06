import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const CHAKRA_PROVIDER_TSX = `"use client";

import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import type { ReactNode } from "react";

const theme = extendTheme({
  fonts: {
    heading: '"Inter", sans-serif',
    body:    '"Inter", sans-serif',
  },
  colors: {
    brand: {
      50:  "#e3f2fd",
      500: "#2196f3",
      900: "#0d47a1",
    },
  },
  config: {
    initialColorMode: "light",
    useSystemColorMode: false,
  },
});

export function ChakraAppProvider({ children }: { children: ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}
`;

export const chakraModule: PluginDefinition = {
  manifest: {
    id: "ui-chakra",
    name: "Chakra UI",
    version: "1.0.0",
    description: "Chakra UI v2 with extended theme and ChakraProvider wrapper",
    category: "ui",
    dependencies: [
      { name: "@chakra-ui/react", version: "^2.8.2", scope: "dependencies" },
      { name: "@emotion/react", version: "^11.11.4", scope: "dependencies" },
      { name: "@emotion/styled", version: "^11.11.5", scope: "dependencies" },
      { name: "framer-motion", version: "^11.2.10", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/components/ChakraProvider.tsx", content: CHAKRA_PROVIDER_TSX },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["ui-tailwind", "ui-shadcn", "ui-mui", "ui-bootstrap"],
    },
  },
};