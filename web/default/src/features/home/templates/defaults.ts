/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'

import type { ClassicLandingContent, CliQuickstartContent } from '../types'

/**
 * Built-in defaults for the classic landing template. Mirrors the hardcoded
 * copy/lists in the section components so the admin editor can pre-fill the
 * current content, and unset fields fall back to these values at render time.
 */
export function getDefaultClassicContent(t: TFunction): ClassicLandingContent {
  return {
    sections: { stats: true, features: true, howItWorks: true, cta: true },
    hero: {
      badge: t('AI Application Infrastructure Foundation'),
      title: t('Unified API Gateway for'),
      highlight: t('Vast Range of AI Models'),
      subtitle: t(
        'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
      ),
      getStartedLabel: t('Get Started'),
      viewPricingLabel: t('View Pricing'),
      goToDashboardLabel: t('Go to Dashboard'),
      appsHeading: t('Supported Applications'),
      appsSubheading: t(
        'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
      ),
      moreAppsLabel: t('More Apps'),
      apps: [
        { name: 'Cherry Studio', url: 'https://cherry-ai.com' },
        {
          name: 'CC Switch',
          url: 'https://ccswitch.io',
          iconUrl: 'https://ccswitch.io/favicon.png',
        },
      ],
    },
    features: {
      eyebrow: t('Core Features'),
      headingLine1: t('Built for developers,'),
      headingLine2: t('designed for scale'),
      bento: [
        {
          title: t('Lightning Fast'),
          desc: t(
            'Optimized network architecture ensures millisecond response times'
          ),
        },
        {
          title: t('Secure & Reliable'),
          desc: t(
            'Enterprise-grade security with comprehensive permission management'
          ),
        },
        {
          title: t('Global Coverage'),
          desc: t('Multi-region deployment for stable global access'),
        },
        {
          title: t('Developer Friendly'),
          desc: t('Compatible API routes for common AI application workflows'),
        },
      ],
      additional: [
        {
          icon: 'Gauge',
          title: t('High Performance'),
          desc: t('Support for high concurrency with automatic load balancing'),
        },
        {
          icon: 'DollarSign',
          title: t('Transparent Billing'),
          desc: t('Pay-as-you-go with real-time usage monitoring'),
        },
        {
          icon: 'Users',
          title: t('Team Collaboration'),
          desc: t('Multi-user management with flexible permission allocation'),
        },
        {
          icon: 'HeartHandshake',
          title: t('Open Source'),
          desc: t('Community driven, self-hosted, and extensible'),
        },
      ],
    },
  }
}

/** Merge stored classic overrides over defaults (lists replaced when present). */
export function mergeClassicContent(
  d: ClassicLandingContent,
  p?: Partial<ClassicLandingContent>
): ClassicLandingContent {
  if (!p) return d
  return {
    sections: { ...d.sections, ...p.sections },
    hero: { ...d.hero, ...p.hero, apps: p.hero?.apps ?? d.hero.apps },
    features: {
      ...d.features,
      ...p.features,
      bento: p.features?.bento ?? d.features.bento,
      additional: p.features?.additional ?? d.features.additional,
    },
  }
}

/**
 * Built-in defaults for the CLI quickstart template: a developer onboarding
 * page with terminal install + config snippets for the major AI coding CLIs.
 * The literal token {{base_url}} in each snippet is replaced with this
 * instance's URL at render time.
 */
export function getDefaultCliContent(t: TFunction): CliQuickstartContent {
  return {
    hero: {
      badge: t('AI Development Tools Gateway'),
      title: t('Welcome to'),
      subtitle: t('Unified access platform for AI development tools'),
      description: t(
        'Integrate Claude Code, Codex CLI, Gemini CLI and more AI coding assistants'
      ),
      ctaLabel: t('Get Started'),
    },
    tools: [
      {
        icon: 'claude',
        badge: t('IDE Integration'),
        name: 'Claude Code',
        description: t(
          "Unleash Claude's raw power directly in your terminal. Search million-line codebases instantly and turn hours-long workflows into a single command."
        ),
        tags: ['Mac / Linux', 'Terminal'],
        steps: [
          {
            filename: 'Terminal',
            language: 'bash',
            code: 'curl -fsSL https://claude.ai/install.sh | bash',
          },
          {
            filename: '~/.claude/settings.json',
            language: 'json',
            code: `{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_BASE_URL": "{{base_url}}"
  }
}`,
          },
        ],
      },
      {
        icon: 'openai',
        badge: t('Command Line Tool'),
        name: 'Codex CLI',
        description: t(
          'Codex CLI is a coding assistant that runs in your local terminal, reading, modifying and executing code in the directories you specify.'
        ),
        tags: ['Node.js', 'npm'],
        steps: [
          {
            filename: 'npm',
            language: 'bash',
            code: 'npm install -g @openai/codex',
          },
          {
            filename: '~/.codex/config.toml',
            language: 'toml',
            code: `model_provider = "aether"
model = "latest-model-name"
model_reasoning_effort = "high"
network_access = "enabled"
disable_response_storage = true

[model_providers.aether]
name = "OpenAI"
base_url = "{{base_url}}/v1"
wire_api = "responses"
requires_openai_auth = true`,
          },
          {
            filename: '~/.codex/auth.json',
            language: 'json',
            code: `{
  "OPENAI_API_KEY": "your-api-key"
}`,
          },
        ],
      },
      {
        icon: 'gemini',
        badge: t('Multimodal AI'),
        name: 'Gemini CLI',
        description: t(
          'Gemini CLI is an open-source AI agent that brings Gemini directly into your terminal, giving you the most direct path from prompt to model.'
        ),
        tags: ['Node.js', 'npm'],
        steps: [
          {
            filename: 'npm',
            language: 'bash',
            code: 'npm install -g @google/gemini-cli',
          },
          {
            filename: '~/.gemini/.env',
            language: 'ini',
            code: `GOOGLE_GEMINI_BASE_URL={{base_url}}
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=latest-model-name`,
          },
          {
            filename: '~/.gemini/settings.json',
            language: 'json',
            code: `{
  "ide": {
    "enabled": true
  },
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    }
  }
}`,
          },
        ],
      },
    ],
    roadmap: {
      badge: t('Project Progress'),
      heading: t('Feature Development Progress'),
      subtitle: t(
        'Core API proxy features are complete; more features are loading'
      ),
      items: [
        {
          title: t('Claude / OpenAI / Gemini'),
          description: t(
            'Full standard-API access to the three major AI coding assistants'
          ),
          status: 'done',
        },
        {
          title: t('Format Conversion'),
          description: t(
            'Toggle API format interconversion and custom request headers'
          ),
          status: 'done',
        },
        {
          title: t('Collaborative Development'),
          description: t(
            'Remote development, Skill sharing, Playground and more coming soon'
          ),
          status: 'in-progress',
        },
      ],
    },
  }
}

/** Merge stored CLI overrides over defaults (lists replaced when present). */
export function mergeCliContent(
  d: CliQuickstartContent,
  p?: Partial<CliQuickstartContent>
): CliQuickstartContent {
  if (!p) return d
  return {
    hero: { ...d.hero, ...p.hero },
    tools: p.tools ?? d.tools,
    roadmap: {
      ...d.roadmap,
      ...p.roadmap,
      items: p.roadmap?.items ?? d.roadmap.items,
    },
  }
}
