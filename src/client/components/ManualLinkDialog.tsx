import { useEffect, useState } from 'react';
import { Button, Dialog, PlainTextEditor, TextField } from '../ui';
import type { InvestigationEntity } from '../../shared/domain';

export function ManualLinkDialog({ open, source, targets, onClose, onCreate }: { open: boolean; source?: InvestigationEntity; targets: InvestigationEntity[]; onClose: () => void; onCreate: (label: string, explanation: string) => void }) {
  const [label, setLabel] = useState('связан с');
  const [explanation, setExplanation] = useState('Связь добавлена пользователем и требует проверки источниками.');
  useEffect(() => { if (open) { setLabel('связан с'); setExplanation('Связь добавлена пользователем и требует проверки источниками.'); } }, [open]);
  return <Dialog open={open} title="Создать ручную связь" onClose={onClose}><div className="manual-link-dialog"><p><strong>{source?.title}</strong> → {targets.map((target) => target.title).join(', ')}</p><label><span>Название связи</span><TextField value={label} onChange={(event) => setLabel(event.target.value)} /></label><label><span>Описание</span><PlainTextEditor value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label><footer><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!source || targets.length === 0 || !label.trim()} onClick={() => onCreate(label.trim(), explanation.trim())}>Создать {targets.length > 1 ? `${targets.length} связи` : 'связь'}</Button></footer></div></Dialog>;
}
