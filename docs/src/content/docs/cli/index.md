---
title: CLI Commands
description: Complete reference for all Foundation CLI commands
---



Foundation CLI provides 16 commands for project creation, module management, code generation, and project inspection.

## Command Overview

| Command | Description |
|---------|-------------|
| [create](/cli/create/) | Interactive project scaffolding |
| [add](/cli/add/) | Add modules/plugins to existing project |
| [switch](/cli/switch/) | Swap module categories |
| [generate](/cli/generate/) | Generate models and CRUD |
| [db](/cli/db/) | Database operations (migrate, seed, etc.) |
| [info](/cli/info/) | Show project stack |
| [doctor](/cli/doctor/) | Health checks |
| [validate](/cli/validate/) | Validate project state |
| [dev](/cli/dev/) | Run dev server |
| [search](/cli/search/) | Search npm for plugins |
| [plugins](/cli/plugins/) | List installed plugins |
| [eject](/cli/eject/) | Eject module files |
| [upgrade](/cli/upgrade/) | Upgrade module versions |
| [create-plugin](/cli/create-plugin/) | Scaffold new plugin |
| [ai](/cli/ai/) | AI-powered scaffolding |

## Quick Reference

### Project Creation
```bash
foundation create my-app              # interactive
foundation create my-app --preset saas  # non-interactive
```

### Module Management
```bash
foundation add orm-prisma             # add module
foundation add stripe                 # add addon
foundation switch orm prisma          # swap category
```

### Code Generation
```bash
foundation generate model User        # create model
foundation generate crud Post        # create full CRUD
```

### Project Inspection
```bash
foundation info                       # show stack
foundation doctor                    # health check
foundation validate                  # validate state
```

## Common Options

| Option | Description |
|--------|-------------|
| `--help` | Show help |
| `--version` | Show version |
| `--ci` | Force CI mode |

## Related

- [Getting Started](/getting-started/quick-start/) — Quick intro
- [Tutorials](/tutorials/saas-app/) — Practical examples
- [Modules](/modules/overview/) — All available modules
