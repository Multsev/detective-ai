import { useState } from 'react';
import { Button, Dialog, FormRow, Select, TextField } from '../ui';
import type { CreateCaseInput } from '../../shared/domain';

interface CreateCaseDialogProps {
  open: boolean;
  nextCaseNumber: number;
  onClose: () => void;
  onCreate: (input: CreateCaseInput) => void;
}

export function CreateCaseDialog({ open, nextCaseNumber, onClose, onCreate }: CreateCaseDialogProps) {
  const [subject, setSubject] = useState('');
  const [entityType, setEntityType] = useState<CreateCaseInput['entityType']>('person');

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!subject.trim()) return;
    onCreate({ subject: subject.trim(), entityType });
    setSubject('');
  }

  return (
    <Dialog open={open} title="Новое дело" onClose={onClose}>
      <form className="detective-dialog-form create-case-form" onSubmit={submit}>
        <FormRow label="Объект" required hint="Фамилия и имя человека либо название компании">
          <TextField value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Иван Морозов" />
        </FormRow>
        <FormRow label="Тип">
          <Select value={entityType} onChange={(event) => setEntityType(event.target.value as CreateCaseInput['entityType'])}>
            <option value="person">Человек</option>
            <option value="company">Компания</option>
          </Select>
        </FormRow>
        <p className="case-file-preview">Будет создано <strong>Дело № {String(nextCaseNumber).padStart(4, '0')}</strong> и отдельный JSON-файл.</p>
        <div className="create-case-actions">
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="primary" disabled={!subject.trim()}>Создать дело</Button>
        </div>
      </form>
    </Dialog>
  );
}
