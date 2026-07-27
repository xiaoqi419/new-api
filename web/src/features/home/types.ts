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
// ============================================================================
// Home Page Types
// ============================================================================

/**
 * Response from home page content API
 */
export interface HomePageContentResponse {
  success: boolean
  message?: string
  data?: string
}

/**
 * Home page content result from hook
 */
export interface HomePageContentResult {
  content: string
  isLoaded: boolean
  isUrl: boolean
}

// ============================================================================
// Home Page Templates (structured, admin-managed config)
// ============================================================================

/** Toggle for each optional section of the classic landing template. */
export interface SectionToggles {
  stats: boolean
  features: boolean
  howItWorks: boolean
  cta: boolean
}

/** A supported-application chip shown in the hero. */
export interface HeroAppItem {
  name: string
  url: string
  /** Optional logo URL; a letter avatar is shown when omitted or on load error. */
  iconUrl?: string
}

/** Editable copy + lists for the hero section. */
export interface HeroContent {
  badge: string
  title: string
  highlight: string
  subtitle: string
  getStartedLabel: string
  viewPricingLabel: string
  goToDashboardLabel: string
  appsHeading: string
  appsSubheading: string
  moreAppsLabel: string
  apps: HeroAppItem[]
}

/** One of the fixed bento showcase cards (visual is template-owned). */
export interface FeatureBentoItem {
  title: string
  desc: string
}

/** An add/removable feature card (icon name resolved via icon-mapper). */
export interface FeatureCardItem {
  icon: string
  title: string
  desc: string
}

/** Editable copy + lists for the features section. */
export interface FeaturesContent {
  eyebrow: string
  headingLine1: string
  headingLine2: string
  bento: FeatureBentoItem[]
  additional: FeatureCardItem[]
}

/** Full editable content for the classic landing template. */
export interface ClassicLandingContent {
  sections: SectionToggles
  hero: HeroContent
  features: FeaturesContent
}

// --- CLI Quickstart template ---

/** A single code snippet (install command or config file) inside a tool card. */
export interface CliCodeStep {
  /** File path or context label shown as the code header, e.g. "~/.claude/settings.json" or "Terminal". */
  filename: string
  /** Highlight language (shiki), e.g. "bash", "json", "toml", "ini". */
  language: string
  /** Code body; the literal token {{base_url}} is replaced with this instance's URL at render time. */
  code: string
}

/** One CLI tool onboarding card (install + config steps). */
export interface CliToolCard {
  /** Animated brand icon key: 'claude' | 'openai' | 'gemini' | 'generic'. */
  icon?: string
  badge: string
  name: string
  description: string
  tags: string[]
  steps: CliCodeStep[]
}

/** Roadmap item status. */
export type CliRoadmapStatus = 'done' | 'in-progress' | 'planned'

/** A single roadmap entry with a status. */
export interface CliRoadmapItem {
  title: string
  description: string
  status: CliRoadmapStatus
}

/** Editable copy + tool/roadmap lists for the CLI quickstart template. */
export interface CliQuickstartContent {
  hero: {
    badge: string
    title: string
    subtitle: string
    description: string
    ctaLabel: string
  }
  tools: CliToolCard[]
  roadmap: {
    badge: string
    heading: string
    subtitle: string
    items: CliRoadmapItem[]
  }
}

/** Per-template content. Each template owns its own content shape. */
export type TemplateContent = ClassicLandingContent | CliQuickstartContent

/** Stored under the `HomePageConfig` option (JSON). Per-template content is
 * kept opaque here because each template has a distinct shape; consumers narrow
 * it to the type they own. */
export interface HomePageConfig {
  active_template?: string
  templates?: Record<string, unknown>
}

/** Result of the useHomePageConfig hook. */
export interface HomePageConfigResult {
  config: HomePageConfig
  isLoaded: boolean
}
