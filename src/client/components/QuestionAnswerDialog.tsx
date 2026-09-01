import { useEffect, useMemo, useState } from 'react';
import type { InvestigationEntity } from '../../shared/domain';
import { Button, Dialog, PlainTextEditor, TextField } from '../ui';

interface Props {
  open: boolean;
  question?: InvestigationEntity;
  entities: InvestigationEntity[];
  onClose: () => void;
  onAnswer: (answer: string, sourceId: string, targetId: string, label: string) => void;
}

export function QuestionAnswerDialog({ open, question, entities, onClose, onAnswer }: Props) {
  const candidates = useMemo(() => entities.filter((entity) => entity.type !== 'question'), [entities]);
  const [answer, setAnswer] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('связан с');
  useEffect(() => {
    if (!open) return;
    const initial = question?.question?.aboutEntityIds.find((id) => candidates.some((entity) => entity.id === id)) ?? candidates[0]?.id ?? '';
    setAnswer(''); setSourceId(initial); setTargetId(candidates.find((entity) => entity.id !== initial)?.id ?? ''); setLabel('связан с');
  }, [candidates, open, question]);
  const canSubmit = answer.trim() && label.trim() && sourceId && targetId && sourceId !== targetId;
  return <Dialog open={open} title="Ответить на вопрос" onClose={onClose}>
    <div className="manual-link-dialog question-answer-dialog">
      <p className="question-answer-dialog__question">{question?.title}</p>
      <label><span>Ответ</span><PlainTextEditor value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <div className="question-answer-dialog__relation">
        <label><span>От карточки</span><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{candidates.map((entity) => <option key={entity.id} value={entity.id}>{entity.title}</option>)}</select></label>
        <label><span>Связь</span><TextField value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <label><span>К карточке</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{candidates.map((entity) => <option key={entity.id} value={entity.id}>{entity.title}</option>)}</select></label>
      </div>
      <p className="question-answer-dialog__hint">Ручной ответ будет отмечен как утверждение пользователя. Источник можно добавить позже в инспекторе связи.</p>
      <footer><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!canSubmit} onClick={() => onAnswer(answer.trim(), sourceId, targetId, label.trim())}>Сохранить ответ</Button></footer>
    </div>
  </Dialog>;
}
