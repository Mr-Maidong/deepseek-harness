/** Ink-wash navigation for the Studio left rail. */
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Section } from '../frame/contract.ts'
import css from './Navigation.module.css'

const NAV_ITEMS: ReadonlyArray<{ id: Section; label: string; hint: string }> = [
  { id: 'project', label: '工程', hint: '案台与文件' },
  { id: 'team', label: '团队', hint: '同道与协作' },
  { id: 'knowledge', label: '知识', hint: '卷宗与积累' },
]

function SectionMark({ section }: { section: Section }) {
  return <span className={`${css.atlasMark} ${css[`atlas_${section}`]}`} aria-hidden="true" />
}

export interface NavigationProps {
  active: Section
  collapsed: boolean
  onChange: (section: Section) => void
  onSettings?: () => void
  onCollapse?: () => void
}

/** Quiet by default, with vermilion reserved for the current waymark. */
export function Navigation({ active, collapsed, onChange, onSettings, onCollapse }: NavigationProps): React.ReactElement {
  return <nav className={css.navigation} aria-label="板块导航" data-collapsed={collapsed || undefined}>
    <header className={css.brand}>
      <span className={css.fishHitbox} aria-hidden="true">
        <FishLogo size={34} className={css.brandFish} />
      </span>
      <strong className={css.wordmark}>Hubness</strong>
    </header>
    <div className={css.navList}>
      {NAV_ITEMS.map(item => <button
        key={item.id}
        type="button"
        className={css.navItem}
        data-active={active === item.id || undefined}
        aria-current={active === item.id ? 'page' : undefined}
        onClick={() => { onChange(item.id) }}
      >
        <SectionMark section={item.id} />
        <span className={css.navCopy}>
          <span className={css.navTitle}>{item.label}</span>
          <span className={css.navSubtitle}>{item.hint}</span>
        </span>
      </button>)}
    </div>
    <div className={css.navFooter}>
      <div className={css.footerActions} aria-label="全局操作">
        <button type="button" className={css.footerButton} onClick={onSettings} aria-label="设置" title="设置">
          <span className={css.settingsMark} aria-hidden="true" />
        </button>
        <button type="button" className={css.footerButton} onClick={onCollapse} aria-label={collapsed ? '展开导航栏' : '收起导航栏'} title={collapsed ? '展开导航栏' : '收起导航栏'}>
          <span className={`${css.collapseMark} ${collapsed ? css.expandMark : ''}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  </nav>
}
