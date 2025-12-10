import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Effect SQL',
  description: 'Type-safe, composable SQL for Effect',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Effect SQL' }],
    ['meta', { property: 'og:description', content: 'Type-safe, composable SQL for Effect' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/docs/getting-started/introduction' },
      { text: 'Databases', link: '/docs/databases/overview' },
      { text: 'API Reference', link: 'https://effect-ts.github.io/effect/docs/sql' },
      {
        text: 'Effect Ecosystem',
        items: [
          { text: 'Effect', link: 'https://effect.website' },
          { text: 'Effect Schema', link: 'https://effect.website/docs/schema' },
          { text: 'GitHub', link: 'https://github.com/Effect-TS/effect' }
        ]
      }
    ],

    sidebar: {
      '/docs/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/docs/getting-started/introduction' },
            { text: 'Installation', link: '/docs/getting-started/installation' },
            { text: 'Quick Start', link: '/docs/getting-started/quick-start' },
            { text: 'Why Effect SQL?', link: '/docs/getting-started/why-effect-sql' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'SqlClient', link: '/docs/core-concepts/sql-client' },
            { text: 'Statements & Queries', link: '/docs/core-concepts/statements' },
            { text: 'Parameters & Interpolation', link: '/docs/core-concepts/parameters' },
            { text: 'Error Handling', link: '/docs/core-concepts/error-handling' },
            { text: 'Configuration', link: '/docs/core-concepts/configuration' }
          ]
        },
        {
          text: 'Databases',
          items: [
            { text: 'Overview', link: '/docs/databases/overview' },
            { text: 'PostgreSQL', link: '/docs/databases/postgresql' },
            { text: 'SQLite', link: '/docs/databases/sqlite' },
            { text: 'MySQL', link: '/docs/databases/mysql' },
            { text: 'Microsoft SQL Server', link: '/docs/databases/mssql' },
            { text: 'ClickHouse', link: '/docs/databases/clickhouse' },
            { text: 'Cloudflare D1', link: '/docs/databases/d1' },
            { text: 'LibSQL / Turso', link: '/docs/databases/libsql' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Transactions', link: '/docs/advanced/transactions' },
            { text: 'Migrations', link: '/docs/advanced/migrations' },
            { text: 'Models', link: '/docs/advanced/models' },
            { text: 'Data Loaders & Batching', link: '/docs/advanced/data-loaders' },
            { text: 'Streaming Results', link: '/docs/advanced/streaming' },
            { text: 'Testing', link: '/docs/advanced/testing' }
          ]
        },
        {
          text: 'Guides',
          items: [
            { text: 'Building a REST API', link: '/docs/guides/rest-api' },
            { text: 'Repository Pattern', link: '/docs/guides/repository-pattern' },
            { text: 'Query Builders', link: '/docs/guides/query-builders' },
            { text: 'Connection Pooling', link: '/docs/guides/connection-pooling' }
          ]
        },
        {
          text: 'Drizzle Comparison',
          items: [
            { text: 'Effect SQL vs Drizzle', link: '/docs/comparison/drizzle' },
            { text: 'Using Drizzle with Effect', link: '/docs/comparison/drizzle-integration' },
            { text: 'Migration from Drizzle', link: '/docs/comparison/migration-from-drizzle' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Effect-TS/effect' },
      { icon: 'discord', link: 'https://discord.gg/effect-ts' },
      { icon: 'twitter', link: 'https://twitter.com/EffectTS_' }
    ],

    editLink: {
      pattern: 'https://github.com/Effect-TS/effect/edit/main/docs-sites/sql/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Effect Contributors'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  }
})
