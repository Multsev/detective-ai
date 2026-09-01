import { useEffect, useMemo, useState } from 'react';
import { Button, DataView, Dialog, EmptyState, InlineStatus, LoadingState, SelectionModel, TextField, type DataViewColumn } from '@operator-ui/framework';
import type { GoogleContact } from '../../shared/domain';
import { api } from '../lib/api';

interface GoogleContactsDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (contact: GoogleContact) => void;
}

interface ContactRow extends GoogleContact {
  organizationLabel: string;
  phoneLabel: string;
  emailLabel: string;
}

const columns: DataViewColumn<ContactRow>[] = [
  { key: 'displayName', label: 'Контакт', width: 190, minWidth: 130 },
  { key: 'organizationLabel', label: 'Должность / компания', width: 200, minWidth: 130 },
  { key: 'phoneLabel', label: 'Телефон', width: 145, minWidth: 110 },
  { key: 'emailLabel', label: 'Email', width: 190, minWidth: 130 },
];

export function GoogleContactsDialog({ open, onClose, onImport }: GoogleContactsDialogProps) {
  const selection = useMemo(() => new SelectionModel<string>(), []);
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [selected, setSelected] = useState<GoogleContact>();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    selection.clear();
    setSelected(undefined);
    setLoading(true);
    setError(undefined);
    api.listGoogleContacts(controller.signal)
      .then(setContacts)
      .catch((failure: Error) => { if (failure.name !== 'AbortError') setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, selection]);

  const rows = useMemo<ContactRow[]>(() => contacts.map((contact) => ({
    ...contact,
    organizationLabel: contact.organizations.map((organization) => [organization.title, organization.name].filter(Boolean).join(' · ')).filter(Boolean).join('; '),
    phoneLabel: contact.phoneNumbers.map((phone) => phone.value).join(', '),
    emailLabel: contact.emailAddresses.map((email) => email.value).join(', '),
  })), [contacts]);

  const importSelected = (contact = selected) => {
    if (!contact) return;
    onImport(contact);
    onClose();
  };

  return (
    <Dialog open={open} title="Google Контакты" onClose={onClose}>
      <div className="google-contacts-dialog">
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, компания или email…" aria-label="Поиск по Google Контактам" />
        {loading ? <LoadingState label="Загружаем контакты…" /> : error ? <InlineStatus tone="danger">{error}</InlineStatus> : rows.length === 0 ? <EmptyState title="Контактов нет" description="В подключённом аккаунте Google не найдено контактов." /> : (
          <DataView
            rows={rows}
            columns={columns}
            height={310}
            ariaLabel="Google Контакты"
            storageKey="detective-google-contacts"
            filterText={search}
            selectionModel={selection}
            onSelectionChange={(selectedRows) => setSelected(selectedRows.at(-1))}
            onOpen={importSelected}
            doubleClickBehavior="open"
          />
        )}
        {selected && <div className="google-contact-preview"><strong>{selected.displayName}</strong><span>{selected.phoneNumbers.length} тел. · {selected.emailAddresses.length} email · {selected.organizations.length} мест работы</span></div>}
        <div className="custom-dialog-actions">
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button type="button" variant="primary" disabled={!selected || loading} onClick={() => importSelected()}>Добавить на доску</Button>
        </div>
      </div>
    </Dialog>
  );
}
