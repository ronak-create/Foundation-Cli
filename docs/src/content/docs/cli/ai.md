---
title: foundation ai
description: AI-powered scaffolding via natural language
---



AI-powered scaffolding using natural language.

## Syntax

```bash
foundation ai "<prompt>"
```

## Requirements

Set one of:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

## Example

```bash
foundation ai "create a blog with posts, comments, and JWT auth"
```

The AI will:
1. Select appropriate modules
2. Generate models (Post, Comment, User)
3. Generate CRUD endpoints

## What It Does

1. Builds system prompt with module catalog
2. Calls Claude (claude-opus-4-5) or OpenAI (gpt-4o-mini)
3. Parses JSON response: `{ modules[], models[], generate[] }`
4. Runs `foundation add` + `foundation generate` automatically

## Related

- [CLI Overview](/cli/) — All commands
- [Environment Variables](/reference/module-manifest/) — API key setup
