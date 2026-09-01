import { useEffect, useState } from 'react';
import { FileCheck2, Globe2 } from 'lucide-react';
import { Button, Checkbox, Dialog } from '../ui';
import type { CaseMaterial, InvestigationEntity } from '../../shared/domain';

interface FindInformationDialogProps {
  open: boolean;
  entities: InvestigationEntity[];
  materials: CaseMaterial[];
  aiConfigured: boolean;
  runningEntityIds: ReadonlySet<string>;
  onClose: () => void;
  onStart: (question: string, includeWeb: boolean) => void;
}

export function FindInformationDialog({ open, entities, materials, aiConfigured, runningEntityIds, onClose, onStart }: FindInformationDialogProps) {
  const [question, setQuestion] = useState('');
  const [includeWeb, setIncludeWeb] = useState(true);
  const hasRunningSelection = entities.some((entity) => runningEntityIds.has(entity.id));
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relevantMaterials = materials.filter((material) => entityIds.has(material.entityId));
  const pendingMaterials = relevantMaterials.filter((material) => material.status !== 'processed' || material.processedRevision !== material.revision);
  const processedMaterials = relevantMaterials.length - pendingMaterials.length;

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setIncludeWeb(true);
  }, [open]);

  return (
    <Dialog open={open} title={entities.length > 1 ? `Найти информацию по выбранным (${entities.length})` : 'Найти информацию'} onClose={onClose}>
      <div className="information-dialog">
        <div className="information-dialog__targets" aria-label="Объекты исследования">
          {entities.map((entity) => <span key={entity.id}>{entity.title}</span>)}
        </div>
        <div className="research-plan">
          <div className={pendingMaterials.length ? 'is-pending' : ''}><FileCheck2 size={14} /><span><strong>{pendingMaterials.length}</strong> новых или изменённых материалов</span></div>
          <div><FileCheck2 size={14} /><span><strong>{processedMaterials}</strong> уже обработано — будут пропущены</span></div>
          <div><Globe2 size={14} /><span>Веб-поиск продолжится с контрольной точки предыдущего запуска</span></div>
        </div>
        <Checkbox label="После материалов продолжить поиск в открытых источниках" checked={includeWeb} onChange={(event) => setIncludeWeb(event.target.checked)} />
        <label><span>Что требуется найти</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={entities.length > 1 ? 'Общая инструкция для всех выбранных карточек' : 'Реквизиты, должность, официальные сайты и другие проверяемые сведения'} /></label>
        {hasRunningSelection && <p className="information-dialog__warning">Одна или несколько выбранных карточек уже исследуются.</p>}
        {!includeWeb && pendingMaterials.length === 0 && <p className="information-dialog__warning">Новых материалов нет. Включите открытые источники или добавьте материал в карточку.</p>}
        <footer><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!aiConfigured || hasRunningSelection || entities.length === 0 || (!includeWeb && pendingMaterials.length === 0)} onClick={() => onStart(question.trim(), includeWeb)}>Запустить исследование</Button></footer>
      </div>
    </Dialog>
  );
}
