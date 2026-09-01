import { useEffect, useState } from 'react';
import { Check, CircleAlert, ContactRound, ExternalLink, Focus, PlugZap, RefreshCw, Save, Settings2, ShieldAlert, Terminal, Unplug, X } from 'lucide-react';
import { Button, Checkbox } from '@operator-ui/framework';
import type { GoogleIntegrationStatus, HealthStatus, McpServerSetting, McpSettingsView } from '../../shared/domain';
import { api } from '../lib/api';

interface SettingsPageProps {
  health: HealthStatus;
  refreshing: boolean;
  autoFitResearch: boolean;
  onAutoFitResearchChange: (enabled: boolean) => void;
  autoOpenInspector: boolean;
  onAutoOpenInspectorChange: (enabled: boolean) => void;
  autoSave: boolean;
  onAutoSaveChange: (enabled: boolean) => void;
  googleStatus: GoogleIntegrationStatus;
  disconnectingGoogle: boolean;
  onDisconnectGoogle: () => void;
  onRefresh: () => void;
  onOpenBoard: () => void;
}

export function SettingsPage({ health, refreshing, autoFitResearch, onAutoFitResearchChange, autoOpenInspector, onAutoOpenInspectorChange, autoSave, onAutoSaveChange, googleStatus, disconnectingGoogle, onDisconnectGoogle, onRefresh, onOpenBoard }: SettingsPageProps) {
  const { codex } = health;
  const [mcpSettings, setMcpSettings] = useState<McpSettingsView>();
  const [saving, setSaving] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<string>();

  useEffect(() => {
    api.loadMcpSettings().then(setMcpSettings).catch((error: Error) => setMcpMessage(error.message));
  }, []);

  function updateServer(id: string, update: Partial<McpServerSetting>) {
    setMcpSettings((current) => current && ({ ...current, servers: current.servers.map((server) => server.id === id ? { ...server, ...update } : server) }));
  }

  async function saveMcpSettings() {
    if (!mcpSettings) return;
    setSaving(true);
    setMcpMessage(undefined);
    try {
      setMcpSettings(await api.saveMcpSettings({ servers: mcpSettings.servers, updatedAt: mcpSettings.updatedAt }));
      setMcpMessage('Настройки MCP сохранены. Новые исследования будут использовать выбранные инструменты.');
    } catch (error) {
      setMcpMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки MCP.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div><span className="inspector__eyebrow">Системная готовность</span><h1>Настройки Detective AI</h1><p>Codex и OSINT-инструменты запускаются локально. Секреты читаются только из переменных окружения и не сохраняются в браузере.</p></div>
        <div className="settings-header__actions"><button className="secondary-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Проверить</button><button className="primary-button" onClick={onOpenBoard}>Открыть доску</button></div>
      </header>

      <div className={`readiness-banner ${codex.ready ? 'is-ready' : 'is-manual'}`}>
        <div className="readiness-icon">{codex.ready ? <Check size={24} /> : <CircleAlert size={24} />}</div>
        <div><strong>{codex.ready ? 'Codex готов к исследованиям' : 'Доступен только ручной режим'}</strong><p>{codex.ready ? 'Можно параллельно исследовать несколько карточек и наблюдать изменения на доске.' : 'Карточки, факты и ручные связи работают, но автоматический поиск заблокирован.'}</p></div>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <header><Terminal size={18} /><div><h2>Codex CLI</h2><p>Локальный исполняемый файл</p></div><StatusBadge ok={codex.installed} /></header>
          <dl><div><dt>Путь</dt><dd>{codex.path || 'Не найден в PATH'}</dd></div><div><dt>Версия</dt><dd>{codex.version || '—'}</dd></div><div><dt>Состояние</dt><dd>{codex.installed ? 'Установлен' : 'Не установлен'}</dd></div></dl>
          {!codex.installed && <div className="setup-instruction"><code>npm install -g @openai/codex</code><a href="https://learn.chatgpt.com/docs/codex-cli" target="_blank" rel="noreferrer">Инструкция <ExternalLink size={12} /></a></div>}
        </article>

        <article className="settings-card">
          <header><Settings2 size={18} /><div><h2>Авторизация</h2><p>Доступ к локальному агенту</p></div><StatusBadge ok={codex.authenticated} /></header>
          <dl><div><dt>Проверка</dt><dd>{codex.authMessage || 'Не выполнена'}</dd></div><div><dt>Обновлено</dt><dd>{codex.checkedAt ? new Date(codex.checkedAt).toLocaleString('ru-RU') : '—'}</dd></div></dl>
          {codex.installed && !codex.authenticated && <div className="setup-instruction"><code>codex login</code><span>Выполните команду в терминале, затем нажмите «Проверить».</span></div>}
        </article>

        <article className="settings-card board-behavior-settings">
          <header><Focus size={18} /><div><h2>Поведение доски</h2><p>Масштаб во время исследования</p></div></header>
          <Checkbox
            checked={autoFitResearch}
            onChange={(event) => onAutoFitResearchChange(event.target.checked)}
            label="Автоматически вписывать новые связи"
          />
          <Checkbox checked={autoOpenInspector} onChange={(event) => onAutoOpenInspectorChange(event.target.checked)} label="Автоматически открывать инспектор при выборе" />
          <Checkbox checked={autoSave} onChange={(event) => onAutoSaveChange(event.target.checked)} label="Автоматически сохранять изменения" />
          <p className="settings-card__hint">Пока Codex добавляет карточки и связи, вся видимая схема остаётся в границах доски. После завершения масштаб снова управляется только вручную.</p>
        </article>

        <article className="settings-card google-integration-settings">
          <header><ContactRound size={18} /><div><h2>Google Контакты</h2><p>Личная адресная книга · только чтение</p></div><StatusBadge ok={googleStatus.connected} /></header>
          <p className="settings-card__hint">{googleStatus.message} При ручном запуске исследования импортированные поля карточки войдут в контекст Codex.</p>
          {!googleStatus.configured ? <div className="setup-instruction"><code>GOOGLE_CLIENT_ID</code><code>GOOGLE_CLIENT_SECRET</code><span>Включите People API, создайте OAuth-клиент типа Web application и добавьте redirect URI <strong>http://localhost:8787/api/google/oauth/callback</strong>.</span></div> : (
            <div className="google-integration-actions">
              {googleStatus.connected
                ? <Button disabled={disconnectingGoogle} onClick={onDisconnectGoogle}><Unplug size={13} />{disconnectingGoogle ? 'Отключаем…' : 'Отключить'}</Button>
                : <Button variant="primary" onClick={() => window.location.assign('/api/google/oauth/start')}><ContactRound size={13} />Подключить Google</Button>}
            </div>
          )}
        </article>
      </div>

      <section className="mcp-settings">
        <header className="mcp-settings__header"><div><span className="inspector__eyebrow">Источники и инструменты</span><h2>MCP для OSINT</h2><p>Включённые серверы передаются в Codex только на время конкретного исследования.</p></div><button className="primary-button" disabled={!mcpSettings || saving} onClick={saveMcpSettings}><Save size={14} />{saving ? 'Сохраняем…' : 'Сохранить MCP'}</button></header>
        {mcpMessage && <div className="mcp-message">{mcpMessage}</div>}
        {!mcpSettings ? <div className="mcp-loading"><RefreshCw size={15} className="spin" /> Загружаем настройки…</div> : (
          <div className="mcp-server-list">
            {mcpSettings.servers.map((server) => {
              const readiness = mcpSettings.readiness.find((item) => item.id === server.id);
              return <article className={`mcp-server ${server.enabled ? 'is-enabled' : ''}`} key={server.id}>
                <header>
                  <label className="mcp-toggle"><input type="checkbox" checked={server.enabled} onChange={(event) => updateServer(server.id, { enabled: event.target.checked })} /><span /></label>
                  <PlugZap size={16} />
                  <div><strong>{server.name}</strong><p>{server.description}</p></div>
                  <span className={`mcp-readiness ${readiness?.ready ? 'ok' : 'fail'}`}>{readiness?.ready ? <Check size={11} /> : <X size={11} />}{readiness?.message}</span>
                </header>
                <div className="mcp-fields">
                  <label>Транспорт<select value={server.transport} onChange={(event) => updateServer(server.id, { transport: event.target.value as McpServerSetting['transport'] })}><option value="stdio">stdio</option><option value="http">HTTP</option></select></label>
                  {server.transport === 'stdio' ? <><label>Команда<input value={server.command} onChange={(event) => updateServer(server.id, { command: event.target.value })} placeholder="npx или uvx" /></label><label className="mcp-field-wide">Аргументы — один на строку<textarea value={server.args.join('\n')} onChange={(event) => updateServer(server.id, { args: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} placeholder={'-y\npackage@version'} /></label></> : <><label className="mcp-field-wide">Streamable HTTP URL<input value={server.url} onChange={(event) => updateServer(server.id, { url: event.target.value })} placeholder="https://example.org/mcp" /></label><label className="mcp-field-wide">Переменная bearer-токена<input value={server.bearerTokenEnvVar} onChange={(event) => updateServer(server.id, { bearerTokenEnvVar: event.target.value.trim().toUpperCase() })} placeholder="MCP_BEARER_TOKEN" /></label></>}
                  <label className="mcp-field-wide">Переменные окружения<input value={server.envVars.join(', ')} onChange={(event) => updateServer(server.id, { envVars: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="BRAVE_API_KEY" /></label>
                </div>
                <footer><ShieldAlert size={12} /><span>{server.caution}</span>{server.sourceUrl && <a href={server.sourceUrl} target="_blank" rel="noreferrer">Исходный код <ExternalLink size={11} /></a>}</footer>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="execution-policy"><h2>Политика запуска исследований</h2><div><Check size={15} /><span>Полный граф передаётся Codex через stdin, а не через аргументы процесса</span></div><div><Check size={15} /><span>Глобальный <code>~/.codex/config.toml</code> не изменяется и не используется для MCP</span></div><div><Check size={15} /><span>Файловая система доступна только для чтения; результат проверяется JSON Schema</span></div><div><Check size={15} /><span>Навык <code>$detective-osint</code> задаёт правила доказательности, приватности и построения графа</span></div></section>
    </section>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return <span className={`status-badge ${ok ? 'ok' : 'fail'}`}>{ok ? <Check size={11} /> : <X size={11} />}{ok ? 'Готово' : 'Нет'}</span>;
}
