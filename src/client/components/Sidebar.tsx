import { Building2, CircleHelp, FileText, LayoutDashboard, MapPin, NotebookPen, Settings, UserRound, CalendarDays } from 'lucide-react';
import type { EntityType, InvestigationCase } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';

interface SidebarProps {
  investigationCase: InvestigationCase;
  filter: EntityType | 'all';
  onFilter: (filter: EntityType | 'all') => void;
  page: 'board' | 'settings';
  codexReady: boolean;
  onOpenSettings: () => void;
  onOpenBoard: () => void;
}

const filters: Array<{ type: EntityType | 'all'; label: string; icon: typeof UserRound }> = [
  { type: 'all', label: 'Вся доска', icon: LayoutDashboard },
  { type: 'person', label: 'Люди', icon: UserRound },
  { type: 'company', label: 'Компании', icon: Building2 },
  { type: 'document', label: 'Документы', icon: FileText },
  { type: 'event', label: 'События', icon: CalendarDays },
  { type: 'location', label: 'Места', icon: MapPin },
  { type: 'question', label: 'Вопросы', icon: CircleHelp },
  { type: 'note', label: 'Заметки', icon: NotebookPen },
];

export function Sidebar({ investigationCase, filter, onFilter, page, codexReady, onOpenSettings, onOpenBoard }: SidebarProps) {
  const count = (type: EntityType | 'all') => type === 'all'
    ? investigationCase.entities.length
    : investigationCase.entities.filter((entity) => entity.type === type).length;

  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand__mark">D</span><div><strong>Detective AI</strong><small>Evidence workspace</small></div></div>
      <div className="case-heading">
        <span>Активное расследование</span>
        <h1>{investigationCase.title}</h1>
        <p>{investigationCase.subtitle}</p>
      </div>
      <nav className="filter-list">
        <span className="nav-label">Материалы дела</span>
        {filters.map(({ type, label, icon: Icon }) => (
          <button key={type} className={page === 'board' && filter === type ? 'active' : ''} onClick={() => { onOpenBoard(); onFilter(type); }}>
            <Icon size={16} /><span>{label}</span><b>{count(type)}</b>
          </button>
        ))}
      </nav>
      <div className="evidence-legend">
        <span className="nav-label">Доказательность</span>
        {(['official', 'probable', 'hypothesis', 'user_asserted', 'contradicted'] as const).map((status) => (
          <div key={status}><i style={{ background: evidenceStyles[status].color }} />{evidenceStyles[status].label}</div>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button className={`settings-link ${page === 'settings' ? 'active' : ''}`} onClick={onOpenSettings}><Settings size={15} /><span>Настройки</span><i className={codexReady ? 'ready' : ''} /></button>
        <p className="privacy-note">Только открытые источники. Гипотезы не считаются фактами без проверки.</p>
      </div>
    </aside>
  );
}
