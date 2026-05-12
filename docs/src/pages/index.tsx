import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import ThemedIdealImage from '@site/src/components/ThemedIdealImage';

import lightHeroImg from '../img/postkit-hero-light.png';
import darkHeroImg from '../img/postkit-hero-dark.png';

import styles from './index.module.css';

function HomepageHero() {
  return (
    <section className={styles.heroBanner}>
      <div className={styles.heroImageWrapper}>
        <ThemedIdealImage
          lightImg={lightHeroImg}
          darkImg={darkHeroImg}
          alt="PostKit — SQL schema management for modern teams"
          className={styles.heroCover}
        />
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started/installation">
            Get Started
          </Link>
          <Link
            className="button button--outline button--lg"
            to="https://github.com/appritechnologies/postkit"
            target="_blank">
            GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Developer Toolkit`}
      description="PostKit - A framework for backend development with database migrations, auth management, and more.">
      <main>
        <HomepageHero />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
