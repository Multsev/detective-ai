import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Dialog, PlainTextEditor, SelectionModel } from '../ui';
import type { InvestigationEntity } from '../../shared/domain';

interface FindRelationshipsDialogProps {
  open: boolean;
  entities: InvestigationEntity[];
  initialEntityIds: string[];
  runningEntityIds: ReadonlySet<string>;
  onClose: () => void;
  onStart: (entityIds: string[], question: string) => void;
}

const typeLabels: Record<InvestigationEntity['type'], string> = {
  person: 'Персона',
  company: 'Компания',
  document: 'Документ',
  event: 'Событие',
  location: 'Место',
  question: 'Вопрос',
  note: 'Заметка',
};

export function FindRelationshipsDialog({ open, entities, initialEntityIds, runningEntityIds, onClose, onStart }: FindRelationshipsDialogProps) {
  const selection = useMemo(() => new SelectionModel<string>(), []);
  const snapshot = useSyncExternalStore(selection.subscribe, selection.getSnapshot);
  const [question, setQuestion] = useState('');
  const entityIds = useMemo(() => entities.map((entity) => entity.id), [entities]);

  useEffect(() => {
    if (!open) return;
    selection.clear();
    for (const entityId of initialEntityIds) {
      if (entityIds.includes(entityId) && !selection.isSelected(entityId)) selection.select(entityId, entityIds, { toggle: true });
    }
    setQuestion('');
  }, [entityIds, initialEntityIds, open, selection]);

  const selectedIds = [...snapshot.selected];
  const hasRunningSelection = selectedIds.some((entityId) => runningEntityIds.has(entityId));

  return (
    <Dialog open={open} title="Найти связи" onClose={onClose}>
      <div className="find-relationships-dialog">
        <p>Выберите минимум две карточки. Codex проверит прямые и косвенные связи между ними во всех подключённых и открытых источниках.</p>
        <div className="relationship-entity-list" role="group" aria-label="Объекты для поиска связей">
          {entities.map((entity) => {
            const running = runningEntityIds.has(entity.id);
            return <div className={`relationship-entity-option${snapshot.selected.has(entity.id) ? ' is-selected' : ''}`} key={entity.id}>
              <Checkbox
                label={entity.title}
                checked={snapshot.selected.has(entity.id)}
                disabled={running}
                onChange={() => selection.select(entity.id, entityIds, { toggle: true })}
              />
              <span>{typeLabels[entity.type]}{running ? ' · уже исследуется' : entity.subtitle ? ` · ${entity.subtitle}` : ''}</span>
            </div>;
          })}
        </div>
        <label className="relationship-question-field">
          <span>Что именно проверить <small>необязательно</small></span>
          <PlainTextEditor value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Например: совместные проекты, владение, работа в одной организации" />
        </label>
        <div className="relationship-selection-summary">
          Выбрано: <strong>{selectedIds.length}</strong>{hasRunningSelection && <span>Один из объектов уже исследуется</span>}
        </div>
        <div className="custom-dialog-actions">
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button type="button" variant="primary" disabled={selectedIds.length < 2 || hasRunningSelection} onClick={() => onStart(selectedIds, question.trim())}>Найти связи</Button>
        </div>
      </div>
    </Dialog>
  );
}
