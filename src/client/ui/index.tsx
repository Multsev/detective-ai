import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleHelp, Filter, Info, ListTree, Search, Settings, TriangleAlert, X } from 'lucide-react';
import { isOutsideMenu } from './menuInteraction';
import { appPersistence } from './persistence';
export { appPersistence } from './persistence';
export { SelectionModel } from './selection';
import { SelectionModel } from './selection';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' }>(function Button({ variant = 'default', className = '', children, ...props }, ref) {
  return <button ref={ref} className={`detective-button detective-button--${variant} ${className}`} {...props}>{children}</button>;
});

const iconMap = { search: Search, settings: Settings, error: X, filter: Filter, info: Info, warning: TriangleAlert, check: CircleCheck, network: ListTree } as const;
export function IconButton({ label, icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: keyof typeof iconMap }) {
  const Icon = iconMap[icon] ?? CircleHelp;
  return <button className={`detective-icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={15} /></button>;
}

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(function TextField({ error, className = '', ...props }, ref) {
  return <input ref={ref} className={`detective-input ${error ? 'is-error' : ''} ${className}`} aria-invalid={error || undefined} {...props} />;
});

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`detective-select ${className}`} {...props} />;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="detective-check"><input type="checkbox" {...props} /><span aria-hidden="true" className="detective-check__mark" /><span>{label}</span></label>;
}

export const PlainTextEditor = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function PlainTextEditor({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`detective-plain-text ${className}`} {...props} />;
});

export function FormRow({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  const generatedId = useId();
  const controlId = isValidElement(children) ? (children.props as { id?: string }).id || generatedId : generatedId;
  const child = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-required'?: boolean }>, { id: controlId, 'aria-required': required || undefined }) : children;
  return <div className="detective-form-row"><label className="detective-field-label" htmlFor={controlId}>{label}{required && ' *'}</label><div>{child}{hint && <div className="detective-field-hint">{hint}</div>}</div></div>;
}

export function InlineStatus({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`detective-inline detective-inline--${tone}`}>{children}</span>;
}

export function Panel({ title, toolbar, children, footer, className = '' }: { title?: ReactNode; toolbar?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <section className={`detective-panel ${className}`}>{(title || toolbar) && <header>{title && <strong>{title}</strong>}<span className="detective-panel-header-fill" />{toolbar}</header>}<div className="detective-panel-content">{children}</div>{footer && <footer>{footer}</footer>}</section>;
}

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled), textarea:not(:disabled)')?.focus());
    return () => previous?.focus();
  }, [open]);
  if (!open) return null;
  return createPortal(<div className="detective-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="detective-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}><header><span className="detective-dialog-kicker">Материалы дела</span><strong id={titleId}>{title}</strong><button onClick={onClose} aria-label="Закрыть"><X size={17} /></button></header><div className="detective-dialog-body">{children}</div></section></div>, document.body);
}

export type MenuEntry =
  | { type?: 'command'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; action?: () => void }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; items: MenuEntry[]; disabled?: boolean };

function MenuEntries({ items, close }: { items: MenuEntry[]; close: () => void }) {
  return items.map((item, index) => {
    if (item.type === 'separator') return <div key={`separator-${index}`} role="separator" />;
    if (item.type === 'submenu') return <div className="detective-submenu" key={item.label}><button role="menuitem" disabled={item.disabled}><span />{item.label}<span>›</span></button><div role="menu"><MenuEntries items={item.items} close={close} /></div></div>;
    return <button key={item.label} role="menuitem" disabled={item.disabled} onClick={() => { item.action?.(); close(); }}><span className="detective-menu-check">{item.checked ? '✓' : ''}</span><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>;
  });
}

export function MenuBar({ children }: { children: ReactNode }) { return <nav className="detective-menubar" aria-label="Меню дела">{children}</nav>; }

export function Menu({ label, items }: { label: string; items: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const floatingMenu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 44 });
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (isOutsideMenu(target, root.current, floatingMenu.current)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return <div ref={root} className="detective-app-menu"><button ref={trigger} className={open ? 'is-open' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => { const rect = trigger.current?.getBoundingClientRect(); if (rect) setPosition({ left: Math.min(rect.left, window.innerWidth - 250), top: rect.bottom + 5 }); setOpen((value) => !value); }}>{label}</button>{open && createPortal(<div ref={floatingMenu} className="detective-floating-menu" role="menu" style={position}><MenuEntries items={items} close={() => setOpen(false)} /></div>, document.body)}</div>;
}

export function ContextMenu({ open, x, y, onClose, children }: { open: boolean; x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) });
  }, [open, x, y]);
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(<div ref={ref} className="detective-context-menu" role="menu" style={position} onPointerDown={(event) => event.stopPropagation()}>{children}</div>, document.body);
}

export function ContextMenuItem({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) { return <button role="menuitem" disabled={disabled} onClick={onClick}><span className="detective-menu-bullet" />{children}</button>; }
export function ContextMenuSeparator() { return <div role="separator" />; }

export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="detective-empty"><strong>{title}</strong><span>{description}</span></div>; }
export function LoadingState({ label = 'Загрузка…' }: { label?: string }) { return <div className="detective-loading" role="status"><span />{label}</div>; }

export type DataViewColumn<Row> = { key: keyof Row & string; label: string; width: number; minWidth?: number; render?: (row: Row) => ReactNode };
export function DataView<Row extends { id: string }>({ rows, columns, height = 320, ariaLabel = 'Список', filterText = '', selectionModel, onSelectionChange, onOpen }: { rows: readonly Row[]; columns: readonly DataViewColumn<Row>[]; height?: number; ariaLabel?: string; storageKey?: string; filterText?: string; selectionModel?: SelectionModel<string>; onSelectionChange?: (rows: Row[]) => void; onOpen?: (row: Row) => void; doubleClickBehavior?: 'open' | 'toggle' }) {
  const ownedSelection = useMemo(() => new SelectionModel<string>(), []);
  const selection = selectionModel ?? ownedSelection;
  const snapshot = useSyncExternalStore(selection.subscribe, selection.getSnapshot);
  const visibleRows = useMemo(() => {
    const query = filterText.trim().toLocaleLowerCase('ru');
    return query ? rows.filter((row) => Object.values(row).some((value) => typeof value === 'string' && value.toLocaleLowerCase('ru').includes(query))) : [...rows];
  }, [filterText, rows]);
  useEffect(() => { onSelectionChange?.(visibleRows.filter((row) => snapshot.selected.has(row.id))); }, [onSelectionChange, snapshot.selected, visibleRows]);
  return <div className="detective-data-view" style={{ maxHeight: height }} role="grid" aria-label={ariaLabel}><table><thead><tr>{columns.map((column) => <th key={column.key} style={{ width: column.width, minWidth: column.minWidth }}>{column.label}</th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={snapshot.selected.has(row.id) ? 'is-selected' : ''} onClick={(event) => selection.select(row.id, visibleRows.map((item) => item.id), { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })} onDoubleClick={() => onOpen?.(row)}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}

void appPersistence;
