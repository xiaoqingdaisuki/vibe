import type { Skill } from './types';

// 技能参考数据列表
export const skillCatalog: Skill[] = [
  {
    id: 'openai-skills-catalog',
    name: 'OpenAI Skills Catalog',
    category: 'Reference',
    description: 'Official OpenAI skills collection with system, curated, and experimental tiers.',
    level: 'intermediate',
    agents: ['Claude Code'],
    notes: `# OpenAI Skills Catalog

Official skills catalog from OpenAI.

## Tiers

- \`.system\` — Auto-loaded skills available in every session
- \`.curated\` — Hand-picked skills for common workflows
- \`.experimental\` — Cutting-edge, may change or be removed

## Usage

Browse the catalog to discover skills that can be installed and used with Codex CLI or other OpenAI tools.

## Note

This is a reference to the official source. Check the repo for the latest skills and installation instructions.
`,
    link: 'https://github.com/openai/skills',
  },
  {
    id: 'anthropic-skills',
    name: 'Anthropic Skills',
    category: 'Reference',
    description:
      'Official Anthropic skills specification and examples for Claude — document, creative, development, and enterprise skills.',
    level: 'intermediate',
    agents: ['Claude'],
    notes: `# Anthropic Skills

Anthropic's public repository of Agent Skills for Claude. Demonstrates the "skills" system — a way to bundle instructions, scripts, and resources into folders that Claude loads dynamically.

## Structure

- \`skills/\` — Skill examples (Creative & Design, Development & Technical, Enterprise & Communication, Document Skills)
- \`spec/\` — The Agent Skills specification
- \`template/\` — Starter template for creating new skills

## Key Skills

- **Document Skills** (\`docx\`, \`pdf\`, \`pptx\`, \`xlsx\`) — Powers Claude's document creation & editing
- **Creative & Design** — Art, music, design tasks
- **Development & Technical** — Testing web apps, MCP server generation
- **Enterprise & Communication** — Communications, branding workflows

## Usage

Install via Claude Code plugin:
\`\`\`bash
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
\`\`\`

Skills are YAML-based with \`name\` and \`description\` frontmatter. Available natively on Claude.ai paid plans and via the Skills API.
`,
    link: 'https://github.com/anthropics/skills',
  },
  {
    id: 'mattpocock-skills',
    name: 'Matt Pocock Skills',
    category: 'Reference',
    description:
      'Collection of AI agent skills for real engineering — TDD, debugging, code review, architecture, and productivity workflows.',
    level: 'advanced',
    agents: ['Claude Code'],
    notes: `# Matt Pocock Skills

A collection of AI agent skills for "real engineering" designed to fix common failure modes when using coding agents like Claude Code.

## Key Skills

**Engineering (User-invoked):**
- \`ask-matt\` — Ask Matt Pocock directly
- \`grill-with-docs\` — Deep-dive into documentation
- \`triage\` — Triage issues and PRs
- \`improve-codebase-architecture\` — Refactor architecture
- \`to-issues\` / \`to-prd\` — Convert discussions to issues or PRDs

**Engineering (Model-invoked):**
- \`prototype\` — Rapid prototyping
- \`diagnosing-bugs\` — Systematic bug diagnosis
- \`research\` — Deep research on topics
- \`tdd\` — Test-driven development workflow
- \`domain-modeling\` — Domain model design
- \`codebase-design\` — Codebase architecture
- \`code-review\` — Automated code review

**Productivity:**
- \`grill-me\` — Self-reflection workflow
- \`handoff\` — Handoff context to another session
- \`teach\` — Teaching mode
- \`writing-great-skills\` — Skill authoring guide

## Philosophy

Addresses four failure modes: misinterpretation, verbosity, non-functional code, and architectural decay. Skills are small, composable, and model-agnostic.
`,
    link: 'https://github.com/mattpocock/skills',
  },
  {
    id: 'composio-codex-skills',
    name: 'Composio Awesome Codex Skills',
    category: 'Reference',
    description:
      'Practical automation-focused skills covering GitHub, Notion, deployment, meetings, and productivity integrations.',
    level: 'intermediate',
    agents: ['Claude Code', 'Cursor'],
    notes: `# Composio Awesome Codex Skills

A curated collection of practical Codex skills focused on automation and integration.

## Coverage

- **GitHub** — PR management, issue tracking, repo automation
- **Notion** — Database operations, page management
- **Deployment** — CI/CD workflows, environment management
- **Meetings** — Scheduling, note-taking, action items
- **Productivity** — Email, calendar, task management

## Why it's useful

One of the most comprehensive automation skill sets. Good reference for building custom workflows and understanding what's possible with agent skills.
`,
    link: 'https://github.com/ComposioHQ/awesome-codex-skills',
  },
];
