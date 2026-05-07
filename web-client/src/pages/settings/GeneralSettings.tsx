import { useSearchParams } from 'react-router-dom';
import type { SettingsTabProps } from './types';
import { UserSubsection } from './general/UserSubsection';
import { TimeSubsection } from './general/TimeSubsection';
import { ThemeDefinitionEditor } from './general/ThemeDefinitionEditor';
import styles from '../List.module.css';

type GeneralSubtab = 'user' | 'time' | 'theme-definition';

const SUBTABS: { id: GeneralSubtab; label: string }[] = [
  { id: 'user', label: 'User' },
  { id: 'time', label: 'Time' },
  { id: 'theme-definition', label: 'Theme Definition' },
];

const isValidSubtab = (v: string | null): v is GeneralSubtab =>
  v === 'user' || v === 'time' || v === 'theme-definition';

export const GeneralSettings: React.FC<SettingsTabProps> = (props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('subtab');
  const active: GeneralSubtab = isValidSubtab(param) ? param : 'user';

  const setActive = (subtab: GeneralSubtab) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('subtab', subtab);
      return next;
    });
  };

  return (
    <div className={styles.tabContainer}>
      <nav className={styles.tabHeader} role="tablist" aria-label="General settings sections">
        {SUBTABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`${styles.tabButton} ${active === t.id ? styles.activeTab : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabContent}>
        {active === 'user' && <UserSubsection {...props} />}
        {active === 'time' && <TimeSubsection {...props} />}
        {active === 'theme-definition' && <ThemeDefinitionEditor {...props} />}
      </div>
    </div>
  );
};
