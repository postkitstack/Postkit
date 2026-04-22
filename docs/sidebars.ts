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
            'modules/db/commands/start',
            'modules/db/commands/plan',
            'modules/db/commands/apply',
            'modules/db/commands/commit',
            'modules/db/commands/deploy',
            'modules/db/commands/status',
            'modules/db/commands/abort',
            'modules/db/commands/migration',
            'modules/db/commands/remote',
            'modules/db/commands/infra',
            'modules/db/commands/grants',
            'modules/db/commands/seed',
            'modules/db/commands/import',
          ],
        },
        'modules/db/troubleshooting',
        'modules/db/plan-limitations',
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
      label: 'Reference',
      collapsible: true,
      collapsed: true,
      items: [
        'reference/global-options',
        'reference/project-structure',
        'reference/session-state',
      ],
    },
  ],
};

export default sidebars;
