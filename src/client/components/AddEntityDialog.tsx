import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { entityTypes, type EntityType } from '../../shared/domain';

const labels: Record<EntityType, string> = {
  person: 'Человек', company: 'Компания', document: 'Документ', event: 'Событие',
  location: 'Место', question: 'Вопрос', note: 'Заметка',
};

interface AddEntityDialogProps {
  onClose: () => void;
  onAdd: (input: { type: EntityType; title: string; subtitle: string; summary: string }) => void;
}

export function AddEntityDialog({ onClose, onAdd }: AddEntityDialogProps) {
  const [type, setType] = useState<EntityType>('person');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [summary, setSummary] = useState('');

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="entity-dialog" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onAdd({ type, title: title.trim(), subtitle: subtitle.trim(), summary: summary.trim() });
      }}>
        <header><div><span className="inspector__eyebrow">Материал расследования</span><h2>Новая карточка</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></header>
        <label>Тип<select value={type} onChange={(event) => setType(event.target.value as EntityType)}>{entityTypes.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
        <label>Название<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Имя человека или название компании" /></label>
        <label>Подзаголовок<input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Роль, должность или краткий контекст" /></label>
        <label>Что уже известно<textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Нейтральное описание без неподтверждённых выводов" /></label>
        <footer><button type="button" className="ghost-button" onClick={onClose}>Отмена</button><button className="primary-button"><Plus size={16} />Создать карточку</button></footer>
      </form>
    </div>
  );
}
