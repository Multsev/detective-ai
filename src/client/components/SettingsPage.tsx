import { useState } from 'react';
import { ContactRound, ExternalLink, Focus, RefreshCw, Terminal, Unplug, X } from 'lucide-react';
import { Button, Checkbox, appPersistence, InlineStatus, Select } from '../ui';
import type { GoogleIntegrationStatus, HealthStatus } from '../../shared/domain';
import type { MotionLevel } from '../motion/motionPreferences';
import { McpSettingsSection } from './McpSettingsSection';
import { SettingsSection } from './SettingsSection';

interface SettingsPageProps {
  health: HealthStatus;
  refreshing: boolean;
  autoFitResearch: boolean;
  onAutoFitResearchChange: (enabled: boolean) => void;
  autoOpenInspector: boolean;
  onAutoOpenInspectorChange: (enabled: boolean) => void;
  autoSave: boolean;
  onAutoSaveChange: (enabled: boolean) => void;
  motionLevel: MotionLevel;
  onMotionLevelChange: (level: MotionLevel) => void;
  googleStatus: GoogleIntegrationStatus;
  disconnectingGoogle: boolean;
  onDisconnectGoogle: () => void;
  onRefresh: () => void;
  onOpenBoard: () => void;
}

type SettingsSectionId = 'codex' | 'board' | 'google' | 'mcp';
type OpenSections = Record<SettingsSectionId, boolean>;

export function SettingsPage({ health, refreshing, autoFitResearch, onAutoFitResearchChange, autoOpenInspector, onAutoOpenInspectorChange, autoSave, onAutoSaveChange, motionLevel, onMotionLevelChange, googleStatus, disconnectingGoogle, onDisconnectGoogle, onRefresh, onOpenBoard }: SettingsPageProps) {
  const { codex } = health;
  const [openSections, setOpenSections] = useState<OpenSections>(() => appPersistence.get<OpenSections>('detective:settings-sections', { codex: !codex.ready, board: false, google: false, mcp: false }, isOpenSections));

  function setSectionOpen(id: SettingsSectionId, open: boolean) {
    setOpenSections((current) => {
      if (current[id] === open) return current;
      const next = { ...current, [id]: open };
      appPersistence.set('detective:settings-sections', next);
      return next;
    });
  }

  return <section className="settings-page">
    <header className="settings-header">
      <div><h1>Настройки</h1><p>Подключения, поведение доски и инструменты исследования.</p></div>
      <button className="secondary-button settings-close" onClick={onOpenBoard}><X size={14} />Закрыть</button>
    </header>

    <div className="settings-sections">
      <SettingsSection title="Codex CLI" description="Определяется автоматически" icon={<Terminal size={15} />} status={<InlineStatus tone={codex.ready ? 'success' : codex.installed ? 'warning' : 'danger'}>{codex.ready ? 'Готов к работе' : codex.installed ? 'Нужна авторизация' : 'Не найден'}</InlineStatus>} open={openSections.codex} onToggle={(open) => setSectionOpen('codex', open)}>
        <div className="compact-settings-grid"><dl><div><dt>Путь</dt><dd>{codex.path || 'Не найден в PATH'}</dd></div><div><dt>Версия</dt><dd>{codex.version || '—'}</dd></div></dl><dl><div><dt>Авторизация</dt><dd>{codex.authMessage || 'Не выполнена'}</dd></div><div><dt>Проверено</dt><dd>{codex.checkedAt ? new Date(codex.checkedAt).toLocaleString('ru-RU') : '—'}</dd></div></dl></div>
        {!codex.installed && <div className="setup-instruction"><code>npm install -g @openai/codex</code><a href="https://learn.chatgpt.com/docs/codex-cli" target="_blank" rel="noreferrer">Инструкция <ExternalLink size={11} /></a></div>}
        {codex.installed && !codex.authenticated && <div className="setup-instruction"><code>codex login</code><span>Выполните команду в терминале.</span></div>}
        <div className="settings-section__actions"><Button disabled={refreshing} onClick={onRefresh}><RefreshCw size={12} className={refreshing ? 'spin' : ''} />{refreshing ? 'Проверяем…' : 'Проверить снова'}</Button></div>
      </SettingsSection>

      <SettingsSection title="Поведение доски" description="Автоматизация интерфейса и движение" icon={<Focus size={15} />} status={<InlineStatus tone="info">4 параметра</InlineStatus>} open={openSections.board} onToggle={(open) => setSectionOpen('board', open)}>
        <div className="motion-preference"><label htmlFor="motion-level">Анимации</label><Select id="motion-level" value={motionLevel} onChange={(event) => onMotionLevelChange(event.target.value as MotionLevel)}><option value="full">Полные</option><option value="reduced">Сокращённые</option><option value="off">Выключены</option></Select><small>Сокращённый режим уменьшает перемещения и длительность эффектов.</small></div>
        <div className="compact-choice-list"><Checkbox checked={autoFitResearch} onChange={(event) => onAutoFitResearchChange(event.target.checked)} label="Автоматически вписывать новые связи" /><Checkbox checked={autoOpenInspector} onChange={(event) => onAutoOpenInspectorChange(event.target.checked)} label="Открывать инспектор при выборе карточки" /><Checkbox checked={autoSave} onChange={(event) => onAutoSaveChange(event.target.checked)} label="Автоматически сохранять изменения" /></div>
      </SettingsSection>

      <SettingsSection title="Google Контакты" description="Импорт личной адресной книги · только чтение" icon={<ContactRound size={15} />} status={<InlineStatus tone={googleStatus.connected ? 'success' : googleStatus.configured ? 'warning' : 'info'}>{googleStatus.connected ? 'Подключено' : googleStatus.configured ? 'Не подключено' : 'Не настроено'}</InlineStatus>} open={openSections.google} onToggle={(open) => setSectionOpen('google', open)}>
        <p className="settings-section__message">{googleStatus.message}</p>
        {!googleStatus.configured ? <div className="setup-instruction"><code>GOOGLE_CLIENT_ID</code><code>GOOGLE_CLIENT_SECRET</code><span>Redirect URI: <strong>http://localhost:8787/api/google/oauth/callback</strong></span></div> : <div className="settings-section__actions">{googleStatus.connected ? <Button disabled={disconnectingGoogle} onClick={onDisconnectGoogle}><Unplug size={12} />{disconnectingGoogle ? 'Отключаем…' : 'Отключить'}</Button> : <Button variant="primary" onClick={() => window.location.assign('/api/google/oauth/start')}><ContactRound size={12} />Подключить Google</Button>}</div>}
      </SettingsSection>

      <McpSettingsSection open={openSections.mcp} onToggle={(open) => setSectionOpen('mcp', open)} />
    </div>
  </section>;
}

function isOpenSections(value: unknown): value is OpenSections {
  if (!value || typeof value !== 'object') return false;
  const sections = value as Record<string, unknown>;
  return ['codex', 'board', 'google', 'mcp'].every((key) => typeof sections[key] === 'boolean');
}
