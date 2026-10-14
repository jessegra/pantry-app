import { Link, useParams } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Placeholder, ScreenBody } from '../ui/Screen';
import styles from './ItemDetailScreen.module.css';

export function ItemDetailScreen() {
  const { id } = useParams();
  return (
    <>
      <header className={styles.topBar}>
        <Link to="/" className={styles.back}>
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
          Inventory
        </Link>
      </header>
      <ScreenBody>
        <Placeholder milestone="Milestone 4">Item detail for {id}.</Placeholder>
      </ScreenBody>
    </>
  );
}
