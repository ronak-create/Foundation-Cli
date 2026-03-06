import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const BOOTSTRAP_LAYOUT_TSX = `import "bootstrap/dist/css/bootstrap.min.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
          <div className="container">
            <a className="navbar-brand" href="/">
              <%= projectName %>
            </a>
          </div>
        </nav>
        <main className="container py-4">{children}</main>
      </body>
    </html>
  );
}
`;

const CUSTOM_SCSS = `// Custom Bootstrap overrides
// Import this file instead of bootstrap/dist/css/bootstrap.min.css
// when you need to customise Bootstrap variables.

// Override variables before the import
$primary: #0d6efd;
$border-radius: 0.5rem;
$font-family-sans-serif: "Inter", system-ui, sans-serif;

@import "bootstrap/scss/bootstrap";
`;

export const bootstrapModule: PluginDefinition = {
  manifest: {
    id: "ui-bootstrap",
    name: "Bootstrap",
    version: "1.0.0",
    description: "Bootstrap 5 with React-Bootstrap and optional SCSS customisation",
    category: "ui",
    dependencies: [
      { name: "bootstrap", version: "^5.3.3", scope: "dependencies" },
      { name: "react-bootstrap", version: "^2.10.4", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/app/layout.tsx", content: BOOTSTRAP_LAYOUT_TSX },
      { relativePath: "src/styles/custom.scss", content: CUSTOM_SCSS },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["ui-tailwind", "ui-shadcn", "ui-mui", "ui-chakra"],
    },
  },
};