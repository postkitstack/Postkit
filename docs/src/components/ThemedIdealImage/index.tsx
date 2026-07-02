import type {ReactNode} from 'react';
import IdealImage from '@theme/IdealImage';
import styles from './styles.module.css';

type Props = {
  lightImg: Parameters<typeof IdealImage>[0]['img'];
  darkImg: Parameters<typeof IdealImage>[0]['img'];
  alt: string;
  className?: string;
};

export default function ThemedIdealImage({lightImg, darkImg, alt, className}: Props): ReactNode {
  return (
    <>
      <IdealImage img={lightImg} alt={alt} className={`${styles.lightImg} ${className ?? ''}`} />
      <IdealImage img={darkImg} alt={alt} className={`${styles.darkImg} ${className ?? ''}`} />
    </>
  );
}
