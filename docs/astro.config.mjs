import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: "https://ronak-create.github.io/Foundation-Cli",
  base: "/Foundation-Cli/docs",
  integrations: [
    starlight({
      title: "Foundation CLI",
      description: "A modular project composition engine with a plugin ecosystem",
      pagefind: false,
      sitemap(),
      social: {
        github: "https://github.com/ronak-create/Foundation-Cli",
      },
      sidebar: [
        {
          label: "Getting Started",
          translations: { "zh-CN": "开始使用" },
          items: [
            { label: "Installation", link: "/getting-started/installation/" },
            { label: "Quick Start", link: "/getting-started/quick-start/" },
            { label: "Your First Project", link: "/getting-started/first-project/" },
            { label: "CI Mode", link: "/getting-started/ci-mode/" },
          ],
        },
        {
          label: "Core Concepts",
          translations: { "zh-CN": "核心概念" },
          items: [
            { label: "Architecture", link: "/core-concepts/architecture/" },
            { label: "Module System", link: "/core-concepts/module-system/" },
            { label: "Dependency Resolution", link: "/core-concepts/dependency-resolution/" },
            { label: "Execution Pipeline", link: "/core-concepts/execution-pipeline/" },
            { label: "Hooks", link: "/core-concepts/hooks/" },
          ],
        },
        {
          label: "Modules",
          translations: { "zh-CN": "模块" },
          items: [
            { label: "Overview", link: "/modules/overview/" },
            { label: "Frontend", link: "/modules/frontend/" },
            { label: "Backend", link: "/modules/backend/" },
            { label: "Database", link: "/modules/database/" },
            { label: "ORM", link: "/modules/orm/" },
            { label: "Authentication", link: "/modules/auth/" },
            { label: "UI Libraries", link: "/modules/ui/" },
            { label: "State Management", link: "/modules/state/" },
            { label: "Deployment", link: "/modules/deployment/" },
            { label: "Add-ons", link: "/modules/addons/" },
          ],
        },
        {
          label: "CLI Commands",
          translations: { "zh-CN": "CLI 命令" },
          items: [
            { label: "Overview", link: "/cli/" },
            { label: "create", link: "/cli/create/" },
            { label: "add", link: "/cli/add/" },
            { label: "switch", link: "/cli/switch/" },
            { label: "generate", link: "/cli/generate/" },
            { label: "db", link: "/cli/db/" },
            { label: "info", link: "/cli/info/" },
            { label: "doctor", link: "/cli/doctor/" },
            { label: "validate", link: "/cli/validate/" },
            { label: "dev", link: "/cli/dev/" },
            { label: "search", link: "/cli/search/" },
            { label: "plugins", link: "/cli/plugins/" },
            { label: "eject", link: "/cli/eject/" },
            { label: "upgrade", link: "/cli/upgrade/" },
            { label: "create-plugin", link: "/cli/create-plugin/" },
            { label: "ai", link: "/cli/ai/" },
          ],
        },
        {
          label: "Tutorials",
          translations: { "zh-CN": "教程" },
          items: [
            { label: "SaaS Application", link: "/tutorials/saas-app/" },
            { label: "API Backend", link: "/tutorials/api-backend/" },
            { label: "E-commerce", link: "/tutorials/ecommerce/" },
            { label: "Migration Guide", link: "/tutorials/migration/" },
          ],
        },
        {
          label: "Plugins",
          translations: { "zh-CN": "插件" },
          items: [
            { label: "Overview", link: "/plugins/overview/" },
            { label: "Writing a Plugin", link: "/plugins/writing/" },
            { label: "Manifest Schema", link: "/plugins/manifest/" },
            { label: "Sandbox Security", link: "/plugins/sandbox/" },
          ],
        },
        {
          label: "Advanced",
          translations: { "zh-CN": "高级" },
          items: [
            { label: "Archetypes", link: "/advanced/archetypes/" },
            { label: "Config Merging", link: "/advanced/config-merging/" },
            { label: "ORM Integration", link: "/advanced/orm-integration/" },
            { label: "Code Generation", link: "/advanced/code-generation/" },
          ],
        },
        {
          label: "Reference",
          translations: { "zh-CN": "参考" },
          items: [
            { label: "Module Manifest", link: "/reference/module-manifest/" },
            { label: "Error Codes", link: "/reference/error-codes/" },
            { label: "Troubleshooting", link: "/reference/troubleshooting/" },
          ],
        },
        {
          label: "Contributing",
          translations: { "zh-CN": "贡献指南" },
          items: [
            { label: "Setup", link: "/contributing/setup/" },
            { label: "Adding a Module", link: "/contributing/adding-module/" },
            { label: "Adding a Command", link: "/contributing/adding-command/" },
            { label: "Testing", link: "/contributing/testing/" },
            { label: "Commit Conventions", link: "/contributing/commit-conventions/" },
          ],
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
