import { useEffect, useRef, useState } from 'react';
import { FileText, FileUp, Globe2 } from 'lucide-react';
import { Button, Dialog, Select } from '@operator-ui/framework';
import type { InvestigationEntity } from '../../shared/domain';

interface FindInformationDialogProps {
  open: boolean;
  entities: InvestigationEntity[];
  aiConfigured: boolean;
  runningEntityIds: ReadonlySet<string>;
  onClose: () => void;
  onStart: (question: string, file?: File) => void;
}

export function FindInformationDialog({ open, entities, aiConfigured, runningEntityIds, onClose, onStart }: FindInformationDialogProps) {
  const [mode, setMode] = useState<'web' | 'file'>('web');
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const hasRunningSelection = entities.some((entity) => runningEntityIds.has(entity.id));

  useEffect(() => {
    if (!open) return;
    setMode('web');
    setQuestion('');
    setFile(undefined);
    setFileError(undefined);
    if (fileInput.current) fileInput.current.value = '';
  }, [open]);

  return (
    <Dialog open={open} title={entities.length > 1 ? `Найти информацию по выбранным (${entities.length})` : 'Найти информацию'} onClose={onClose}>
      <div className="information-dialog">
        <div className="information-dialog__targets" aria-label="Объекты исследования">
          {entities.map((entity) => <span key={entity.id}>{entity.title}</span>)}
        </div>
        <label><span>Источник</span><Select value={mode} onChange={(event) => setMode(event.target.value as 'web' | 'file')}><option value="web">Открытые источники</option><option value="file">PDF или Markdown-файл</option></Select></label>
        {mode === 'file' && <div className="research-file-picker">
          <input ref={fileInput} tabIndex={-1} type="file" accept=".pdf,.md,.markdown,application/pdf,text/markdown" onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected && selected.size > 12 * 1024 * 1024) { setFile(undefined); setFileError('Файл больше 12 МБ.'); return; }
            setFile(selected); setFileError(undefined);
          }} />
          <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><FileUp size={14} />Выбрать файл</button>
          <div title={file?.name}>{file ? <><FileText size={13} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} КБ</small></> : <><Globe2 size={13} /><span>PDF, .md или .markdown</span><small>до 12 МБ</small></>}</div>
          {fileError && <p>{fileError}</p>}
        </div>}
        <label><span>Что требуется найти</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={entities.length > 1 ? 'Общая инструкция для всех выбранных карточек' : 'Реквизиты, должность, официальные сайты и другие проверяемые сведения'} /></label>
        {hasRunningSelection && <p className="information-dialog__warning">Одна или несколько выбранных карточек уже исследуются.</p>}
        <footer><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!aiConfigured || hasRunningSelection || entities.length === 0 || (mode === 'file' && !file)} onClick={() => onStart(question.trim(), mode === 'file' ? file : undefined)}>Запустить исследование</Button></footer>
      </div>
    </Dialog>
  );
}
