/**
 * questions.ts — backward-compatibility re-exports.
 *
 * The old flat `QUESTIONS` object is superseded by the PromptGraph in
 * graph-definition.ts. This shim keeps any code that imports from
 * `./questions` compiling without changes.
 *
 * Phase 4 Stage 2 (full PromptGraph migration) will remove this file.
 *
 * @deprecated Use graph-definition.ts directly.
 */

export interface ChoiceItem {
  readonly name: string;
  readonly value: string;
}

export interface QuestionSet {
  readonly projectType: ReadonlyArray<ChoiceItem>;
  readonly frontend: ReadonlyArray<ChoiceItem>;
  readonly backend: ReadonlyArray<ChoiceItem>;
  readonly database: ReadonlyArray<ChoiceItem>;
  readonly auth: ReadonlyArray<ChoiceItem>;
  readonly ui: ReadonlyArray<ChoiceItem>;
  readonly stateManagement: ReadonlyArray<ChoiceItem>;
  readonly deployment: ReadonlyArray<ChoiceItem>;
}

export const QUESTIONS: QuestionSet = {
  projectType: [
    { name: "SaaS Application",     value: "saas"          },
    { name: "AI App",               value: "ai-app"        },
    { name: "CRM",                  value: "crm"           },
    { name: "E-commerce",           value: "ecommerce"     },
    { name: "API Backend",          value: "api-backend"   },
    { name: "Full-stack Dashboard", value: "dashboard"     },
    { name: "Internal Tool",        value: "internal-tool" },
    { name: "Custom",               value: "custom"        },
  ],
  frontend: [
    { name: "Next.js",      value: "nextjs"     },
    { name: "React (Vite)", value: "react-vite" },
    { name: "Vue",          value: "vue"        },
    { name: "Svelte",       value: "svelte"     },
    { name: "None",         value: "none"       },
  ],
  backend: [
    { name: "Express",          value: "express" },
    { name: "NestJS",           value: "nestjs"  },
    { name: "FastAPI (Python)", value: "fastapi" },
    { name: "Django (Python)",  value: "django"  },
    { name: "None",             value: "none"    },
  ],
  database: [
    { name: "PostgreSQL", value: "postgresql" },
    { name: "MySQL",      value: "mysql"      },
    { name: "MongoDB",    value: "mongodb"    },
    { name: "SQLite",     value: "sqlite"     },
    { name: "Supabase",   value: "supabase"   },
    { name: "None",       value: "none"       },
  ],
  auth: [
    { name: "JWT",                     value: "jwt"     },
    { name: "OAuth (Google + GitHub)", value: "oauth"   },
    { name: "Session-based",           value: "session" },
    { name: "Clerk",                   value: "clerk"   },
    { name: "Auth0",                   value: "auth0"   },
    { name: "None",                    value: "none"    },
  ],
  ui: [
    { name: "Tailwind CSS", value: "tailwind"  },
    { name: "ShadCN/UI",   value: "shadcn"    },
    { name: "Material UI", value: "mui"       },
    { name: "Chakra UI",   value: "chakra"    },
    { name: "Bootstrap",   value: "bootstrap" },
    { name: "None",        value: "none"      },
  ],
  stateManagement: [
    { name: "Zustand",        value: "zustand"        },
    { name: "Redux Toolkit",  value: "redux"          },
    { name: "TanStack Query", value: "tanstack-query" },
    { name: "None",           value: "none"           },
  ],
  deployment: [
    { name: "Docker", value: "docker" },
    { name: "Vercel", value: "vercel" },
    { name: "Render", value: "render" },
    { name: "AWS",    value: "aws"    },
    { name: "None",   value: "none"   },
  ],
};
