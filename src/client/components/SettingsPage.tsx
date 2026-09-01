import { Check, CircleAlert, ExternalLink, RefreshCw, Settings2, Terminal, X } from 'lucide-react';
import type { HealthStatus } from '../../shared/domain';

interface SettingsPageProps {
  health: HealthStatus;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenBoard: () => void;
}

export function SettingsPage({ health, refreshing, onRefresh, onOpenBoard }: SettingsPageProps) {
  const { codex } = health;
  return (
    <section className="settings-page">
      <header className="settings-header">
        <div><span className="inspector__eyebrow">Системная готовность</span><h1>Настройки Detective AI</h1><p>Приложение автоматически использует вашу локальную авторизацию Codex CLI. API-ключ в браузере не нужен.</p></div>
        <button className="secondary-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />Проверить снова</button>
      </header>

      <div className={`readiness-banner ${codex.ready ? 'is-ready' : 'is-manual'}`}>
        <div className="readiness-icon">{codex.ready ? <Check size={24} /> : <CircleAlert size={24} />}</div>
        <div><strong>{codex.ready ? 'Codex готов к исследованиям' : 'Доступен только ручной режим'}</strong><p>{codex.ready ? 'Можно запускать поиск по карточкам и наблюдать построение графа.' : 'Карточки, факты и ручные связи работают, но автоматический поиск заблокирован.'}</p></div>
        <button className={codex.ready ? 'primary-button' : 'secondary-button'} onClick={onOpenBoard}>Открыть доску</button>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <header><Terminal size={18} /><div><h2>Codex CLI</h2><p>Локальный исполняемый файл</p></div><StatusBadge ok={codex.installed} /></header>
          <dl>
            <div><dt>Путь</dt><dd>{codex.path || 'Не найден в PATH'}</dd></div>
            <div><dt>Версия</dt><dd>{codex.version || '—'}</dd></div>
            <div><dt>Состояние</dt><dd>{codex.installed ? 'Установлен' : 'Не установлен'}</dd></div>
          </dl>
          {!codex.installed && <div className="setup-instruction"><code>npm install -g @openai/codex</code><a href="https://learn.chatgpt.com/docs/codex-cli" target="_blank" rel="noreferrer">Инструкция <ExternalLink size={12} /></a></div>}
        </article>

        <article className="settings-card">
          <header><Settings2 size={18} /><div><h2>Авторизация</h2><p>Доступ к локальному агенту</p></div><StatusBadge ok={codex.authenticated} /></header>
          <dl>
            <div><dt>Проверка</dt><dd>{codex.authMessage || 'Не выполнена'}</dd></div>
            <div><dt>Обновлено</dt><dd>{codex.checkedAt ? new Date(codex.checkedAt).toLocaleString('ru-RU') : '—'}</dd></div>
          </dl>
          {codex.installed && !codex.authenticated && <div className="setup-instruction"><code>codex login</code><span>Выполните команду в терминале, затем нажмите «Проверить снова».</span></div>}
        </article>
      </div>

      <section className="execution-policy">
        <h2>Политика запуска исследований</h2>
        <div><Check size={15} /><span>Codex запускается через <code>codex exec --json</code></span></div>
        <div><Check size={15} /><span>Файловая система доступна только для чтения</span></div>
        <div><Check size={15} /><span>Живой веб-поиск включается только на время исследования</span></div>
        <div><Check size={15} /><span>Результат проверяется по JSON Schema до появления на доске</span></div>
      </section>
    </section>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return <span className={`status-badge ${ok ? 'ok' : 'fail'}`}>{ok ? <Check size={11} /> : <X size={11} />}{ok ? 'Готово' : 'Нет'}</span>;
}
