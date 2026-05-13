import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  img: string;
  description: ReactNode;
  link: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Safe DB Migrations',
    img: '/img/cards/card-safe-db-migrations.webp',
    description: (
      <>
        Clone → Plan → Apply → Deploy. Session-based workflow with dry-run
        safety before every production deploy. Your database is never at risk.
      </>
    ),
    link: '/docs/modules/db/overview',
  },
  {
    title: 'Realms in Sync',
    img: '/img/cards/card-realms-in-sync.webp',
    description: (
      <>
        Export, clean, and sync Keycloak realm configs between environments.
        Auth configuration as code — version-controlled and team-shareable.
      </>
    ),
    link: '/docs/modules/auth/overview',
  },
  {
    title: 'AI-Ready Workflows',
    img: '/img/cards/card-ai-ready-workflows.webp',
    description: (
      <>
        Agent skills for Claude Code, Cursor, and more. Your AI assistant
        knows exactly how to plan, apply, and deploy with PostKit.
      </>
    ),
    link: '/docs/agent-skills/overview',
  },
];

function Feature({title, img, description, link}: FeatureItem) {
  return (
    <Link to={link} className={styles.featureCardLink}>
      <div className={styles.featureCard}>
        <div className={styles.featureImgWrapper}>
          <img src={img} alt={title} className={styles.featureImg} />
        </div>
        <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
        <p className={styles.featureDesc}>{description}</p>
      </div>
    </Link>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <Heading as="h2" className={styles.sectionTitle}>Why PostKit?</Heading>
          <p className={styles.sectionSubtitle}>
            Everything you need to manage backend development with confidence
          </p>
        </div>
        <div className={styles.featureGrid}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
