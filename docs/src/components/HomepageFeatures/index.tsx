import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
  link: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Safe Database Migrations',
    Svg: require('@site/static/img/undraw_code-contribution_8k0x.svg').default,
    description: (
      <>
        Clone remote databases locally, develop and test changes safely, then
        deploy with confidence. Your production database is never at risk.
      </>
    ),
    link: '/docs/modules/db/overview',
  },
  {
    title: 'Modular CLI Toolkit',
    Svg: require('@site/static/img/undraw_ai-code-assistant_5xop.svg').default,
    description: (
      <>
        Each feature is a pluggable module. Use only what you need — database
        migrations, auth management, and more coming soon.
      </>
    ),
    link: '/docs/getting-started/quick-start',
  },
  {
    title: 'Secure by Default',
    Svg: require('@site/static/img/undraw_secure-server_lz9x.svg').default,
    description: (
      <>
        Dry-run verification ensures your migrations work before touching
        production. Deploy with confidence knowing everything has been tested.
      </>
    ),
    link: '/docs/modules/db/overview',
  },
];

function Feature({title, Svg, description, link}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <Link to={link}>
        <div className="text--center">
          <Svg className={styles.featureSvg} role="img" />
        </div>
      </Link>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">
          <Link to={link}>{title}</Link>
        </Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          <div className="col col--12 text--center padding-bottom--lg">
            <Heading as="h2">Why PostKit?</Heading>
            <p className="hero__subtitle" style={{fontSize: '1.2rem', marginTop: '1rem'}}>
              Everything you need to manage backend development with confidence
            </p>
          </div>
        </div>
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
