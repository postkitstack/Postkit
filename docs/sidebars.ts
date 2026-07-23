import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',

    {
      type: 'category',
      label: 'Getting Started',
      collapsible: true,
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/configuration',
        'getting-started/quick-start',
        'getting-started/migrating-existing-database',
      ],
    },

    {
      type: 'category',
      label: 'DB Module',
      collapsible: true,
      collapsed: false,
      items: [
        'modules/db/overview',
        {
          type: 'category',
          label: 'Commands',
          collapsible: true,
          collapsed: false,
          items: [
            {
              type: 'category',
              label: 'Session',
              collapsible: true,
              collapsed: false,
              items: [
                'modules/db/commands/start',
                'modules/db/commands/status',
                'modules/db/commands/abort',
              ],
            },
            {
              type: 'category',
              label: 'Schema Workflow',
              collapsible: true,
              collapsed: false,
              items: [
                'modules/db/commands/plan',
                'modules/db/commands/apply',
                'modules/db/commands/commit',
                'modules/db/commands/deploy',
              ],
            },
            {
              type: 'category',
              label: 'Infrastructure & Data',
              collapsible: true,
              collapsed: false,
              items: [
                'modules/db/commands/infra',
                'modules/db/commands/seed',
                'modules/db/commands/migration',
                'modules/db/commands/schema',
                'modules/db/commands/import',
              ],
            },
            {
              type: 'category',
              label: 'Remotes',
              collapsible: true,
              collapsed: false,
              items: [
                'modules/db/commands/remote',
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          collapsible: true,
          collapsed: false,
          items: [
            'modules/db/cross-schema-migrations',
            'modules/db/plan-limitations',
          ],
        },
        'modules/db/troubleshooting',
      ],
    },

    {
      type: 'category',
      label: 'Auth Module',
      collapsible: true,
      collapsed: false,
      items: [
        'modules/auth/overview',
        {
          type: 'category',
          label: 'Commands',
          collapsible: true,
          collapsed: false,
          items: [
            'modules/auth/commands/export',
            'modules/auth/commands/import',
            'modules/auth/commands/sync',
          ],
        },
        'modules/auth/configuration',
      ],
    },

    {
      type: 'category',
      label: 'Stack Module',
      collapsible: true,
      collapsed: false,
      items: [
        'modules/stack/overview',
        {
          type: 'category',
          label: 'Commands',
          collapsible: true,
          collapsed: false,
          items: [
            'modules/stack/commands/up',
            'modules/stack/commands/down',
            'modules/stack/commands/status',
            'modules/stack/commands/logs',
            'modules/stack/commands/restart',
            'modules/stack/commands/keys',
            'modules/stack/commands/realm',
          ],
        },
      ],
    },

    {
      type: 'category',
      label: 'Reference',
      collapsible: true,
      collapsed: true,
      items: [
        'reference/init',
        'reference/global-options',
        'reference/project-structure',
        'reference/session-state',
        'agent-skills/overview',
      ],
    },
  ],
};

export default sidebars;
