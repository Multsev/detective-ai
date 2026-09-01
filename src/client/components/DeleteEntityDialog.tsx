import { Button, Dialog } from '../ui';

interface DeleteEntityDialogProps {
  entityTitle?: string;
  relationCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteEntityDialog({ entityTitle, relationCount, onClose, onConfirm }: DeleteEntityDialogProps) {
  return (
    <Dialog open={Boolean(entityTitle)} title="Удалить карточку?" onClose={onClose}>
      <div className="delete-entity-dialog">
        <p>Карточка «{entityTitle}» будет удалена из текущего дела.</p>
        <p className="delete-entity-dialog__warning">Также будет удалено связей: <strong>{relationCount}</strong>.</p>
        <div className="custom-dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="danger" onClick={onConfirm}>Удалить</Button>
        </div>
      </div>
    </Dialog>
  );
}
