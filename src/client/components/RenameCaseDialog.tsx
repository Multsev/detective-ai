import { useEffect, useState } from 'react';
import { Button, Dialog, TextField } from '../ui';

export function RenameCaseDialog({ open, title, onClose, onRename }: { open: boolean; title: string; onClose: () => void; onRename: (title: string) => void }) {
  const [draft, setDraft] = useState(title);
  useEffect(() => { if (open) setDraft(title); }, [open, title]);
  return <Dialog open={open} title="Переименовать дело" onClose={onClose}><div className="rename-case-dialog"><label><span>Название файла дела</span><TextField value={draft} onChange={(event) => setDraft(event.target.value)} /></label><footer><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!draft.trim()} onClick={() => onRename(draft.trim())}>Переименовать</Button></footer></div></Dialog>;
}
