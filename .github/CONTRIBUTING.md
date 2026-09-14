# Изменения в Detective AI

1. Создайте ветку от актуальной `main`: `git switch -c type/short-name`.
2. Не добавляйте реальные дела, материалы, токены, `.env` и скриншоты с персональными данными.
3. Сохраняйте ответственность модулей: UI — в `src/client`, сервер и интеграции — в `src/server`, доменная модель — в `src/shared`.
4. Добавляйте или обновляйте тесты поведения.
5. Перед commit выполните `npm run verify` и `npm run security:secrets -- --history`.
6. В Pull Request опишите поведение до/после, проверки и риски для данных или внешних интеграций.

Commit-сообщения оформляются в стиле Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `security:` или `chore:`.
