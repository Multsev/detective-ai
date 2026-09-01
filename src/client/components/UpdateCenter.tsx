import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Link2, RefreshCw } from 'lucide-react';
import type { CaseChange, InvestigationEntity } from '../../shared/domain';
import { Button, IconButton, Panel } from '../ui';

const changeLabels: Record<CaseChange['kind'], string> = {
  entity_added: 'Новая карточка', entity_updated: 'Карточка обновлена', question_updated: 'Вопрос обновлён',
  relation_added: 'Новая связь', relation_updated: 'Связь обновлена', source_added: 'Новый источник',
  source_rechecked: 'Источник проверен', source_updated: 'Источник обновлён',
  research_completed: 'Исследование завершено', research_failed: 'Ошибка исследования',
};

export function UpdateCenter({ changes, entities, onOpenEntity, onMarkRead, onMarkAllRead }: {
  changes: CaseChange[];
  entities: InvestigationEntity[];
  onOpenEntity: (entityId: string) => void;
  onMarkRead: (changeId: string) => void;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = changes.filter((change) => !change.readAt);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <div className="update-center">
    <button className={`update-center__trigger${unread.length ? ' has-unread' : ''}`} onClick={() => setOpen((value) => !value)} aria-label={unread.length ? `Непрочитанных обновлений: ${unread.length}` : 'Центр обновлений'} aria-expanded={open} title="Что нового"><Bell size={14} />{unread.length > 0 && <span>{unread.length > 99 ? '99+' : unread.length}</span>}</button>
    {open && <Panel className="update-center__panel" title="Что нового" toolbar={<IconButton icon="error" label="Закрыть центр обновлений" onClick={() => setOpen(false)} />}>
      <div className="update-center__toolbar"><span>{unread.length ? `Непрочитанных: ${unread.length}` : 'Всё просмотрено'}</span>{unread.length > 0 && <Button onClick={onMarkAllRead}><CheckCheck size={12} />Прочитать всё</Button>}</div>
      <div className="update-center__list">{changes.slice(0, 30).map((change) => {
        const entity = change.entityIds.map((id) => entities.find((item) => item.id === id)).find(Boolean);
        return <article className={`update-center__item${change.readAt ? ' is-read' : ' is-unread'}`} key={change.id}>
          <span>{change.kind.startsWith('relation') ? <Link2 size={12} /> : change.kind.startsWith('source') ? <RefreshCw size={12} /> : <Bell size={12} />}</span>
          <button className="update-center__body" onClick={() => { if (entity) onOpenEntity(entity.id); onMarkRead(change.id); setOpen(false); }}><small>{changeLabels[change.kind]} · {new Date(change.detectedAt).toLocaleString('ru-RU')}</small><strong>{change.title}</strong><p>{change.summary}</p></button>
          {!change.readAt && <button className="update-center__read" aria-label={`Отметить «${change.title}» прочитанным`} onClick={() => onMarkRead(change.id)}>✓</button>}
        </article>;
      })}{changes.length === 0 && <p className="muted-copy">Обновлений пока нет. Они появятся после следующего исследования.</p>}</div>
    </Panel>}
  </div>;
}
