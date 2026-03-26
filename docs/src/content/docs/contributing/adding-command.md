---
title: Adding a Command
description: How to add a new CLI command to Foundation CLI
---



Add new commands to Foundation CLI.

## Steps

### 1. Create Command File

Create `packages/cli/src/commands/<name>.ts`:

```typescript
import { Command } from 'commander';

export function makeMyCommand(): Command {
  return new Command('my-command')
    .description('Does something useful')
    .argument('[arg]', 'Optional argument')
    .option('--flag', 'A boolean flag')
    .action(async (arg, options) => {
      // Delegate to foundation-core — no business logic here
      // Use chalk for output, ora for spinners
    });
}
```

### 2. Register in bin.ts

```typescript
// packages/cli/src/bin.ts
import { makeMyCommand } from './commands/my-command.js';

program.addCommand(makeMyCommand());
```

## Command Patterns

### Basic Command

```typescript
export function makeHelloCommand(): Command {
  return new Command('hello')
    .description('Print hello')
    .action(() => {
      console.log('Hello, World!');
    });
}
```

### With Arguments

```typescript
export function makeGreetCommand(): Command {
  return new Command('greet')
    .description('Greet someone')
    .argument('<name>', 'Name to greet')
    .action((name) => {
      console.log(`Hello, ${name}!`);
    });
}
```

### With Options

```typescript
export function makeCreateCommand(): Command {
  return new Command('create')
    .description('Create a project')
    .option('-p, --preset <name>', 'Use a preset')
    .action((options) => {
      console.log('Creating with preset:', options.preset);
    });
}
```

## Requirements

- Delegate business logic to `@systemlabs/foundation-core`
- Use `chalk` for colored output
- Use `ora` for spinners
- Handle CI mode gracefully (no interactive prompts)
- Print clean error messages (not stack traces)

## Related

- [Contributing: Setup](/contributing/setup/)
- [CLI: create](/cli/create/) — Example command
