import { Building2, CalendarDays, CircleHelp, FileText, MapPin, NotebookPen, UserRound } from 'lucide-react';
import { Button, IconButton } from '@operator-ui/framework';
import type { EntityType, InvestigationCase } from '../../shared/domain';

const layers: Array<{ type: EntityType; label: string; icon: typeof UserRound }> = [
  { type: 'person', label: 'Люди', icon: UserRound },
  { type: 'company', label: 'Компании', icon: Building2 },
  { type: 'document', label: 'Документы', icon: FileText },
  { type: 'event', label: 'События', icon: CalendarDays },
  { type: 'location', label: 'Места', icon: MapPin },
  { type: 'question', label: 'Вопросы', icon: CircleHelp },
  { type: 'note', label: 'Заметки', icon: NotebookPen },
];

interface LayerControlProps {
  investigationCase: InvestigationCase;
  visibleTypes: ReadonlySet<EntityType>;
  onToggle: (type: EntityType) => void;
  onShowAll: () => void;
}

export function LayerControl({ investigationCase, visibleTypes, onToggle, onShowAll }: LayerControlProps) {
  return (
    <div className="layer-control" role="toolbar" aria-label="Слои доски">
      <IconButton icon="filter" label="Показать все слои" onClick={onShowAll} className="layer-control__master" />
      <span className="layer-control__divider" />
      {layers.map(({ type, label, icon: Icon }) => {
        const count = investigationCase.entities.filter((entity) => entity.type === type).length;
        const active = visibleTypes.has(type);
        return (
          <Button key={type} className={`layer-button ${active ? 'is-active' : ''}`} title={`${label}: ${count}`} aria-label={`${active ? 'Скрыть' : 'Показать'} слой «${label}»`} aria-pressed={active} onClick={() => onToggle(type)}>
            <Icon size={14} /><small>{count}</small>
          </Button>
        );
      })}
    </div>
  );
}
