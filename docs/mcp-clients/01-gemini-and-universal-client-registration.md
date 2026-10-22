# Завдання: підключення Gemini та універсальна реєстрація OAuth-клієнтів (DCR)

> Записано 2026-10-22 після спроби підключити MyGym до Gemini
> (gemini.google.com → Customize → Connectors → Custom).
> **Стан: відкладено.** Розв'язувати не «ручним» способом для одного
> користувача, а універсальним механізмом, бо MyGym працюватиме для широкої
> аудиторії.

## Що сталося

1. У Gemini: **Custom → MCP Server URL** `https://my-gym-com.duckdns.org/mcp`,
   поля Client ID / Client secret порожні → **Next**.
2. Gemini показав: *«This server doesn't support automatic registration. Enter
   your OAuth client ID and client secret to connect.»*

## Чому (діагноз)

Наш `/.well-known/oauth-authorization-server` зараз віддає:

```json
{
  "issuer": "https://my-gym-com.duckdns.org",
  "authorization_endpoint": "https://my-gym-com.duckdns.org/api/oauth/authorize",
  "token_endpoint": "https://my-gym-com.duckdns.org/api/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true,
  "scopes_supported": ["mygym"]
}
```

- Клієнти реєструються **лише через CIMD** (Client ID Metadata Document,
  `client_id` = https-URL метадокумента) з allow-list хостів `OAUTH_CLIENT_HOSTS`
  (`claude.ai, claude.com, chatgpt.com`). Це свідоме рішення з `CLAUDE.md`
  («OAuth для MCP-клієнтів»): «лише через CIMD… без DCR».
- **`registration_endpoint` немає**, тобто Dynamic Client Registration
  (RFC 7591) не підтримується.
- `token_endpoint_auth_methods_supported: ["none"]`: лише публічні клієнти
  (PKCE без секрету).

**Gemini (споживчий, станом на 2026-10) не вміє CIMD.** Він шукає
`registration_endpoint` (DCR), а коли його немає, просить заздалегідь
зареєстровані `client_id` + `client_secret`, тобто confidential client.
Схоже поводяться Gemini CLI, Gemini Enterprise (Custom MCP Server data
store), VS Code, Cursor та інші клієнти: більшість досі реєструється через DCR
або статичні креди, а не через CIMD.

## Чому не «просто статичний клієнт»

Швидкий обхід: один статичний клієнт `mygym-gemini` з секретом у `.env` і
точним `redirect_uri` Gemini. Для одного користувача цього досить, але він:
- не масштабується: кожен новий AI-клієнт (Cursor, VS Code, Gemini CLI,
  Le Chat, …) означає правку `.env` і деплой;
- змушує користувача вводити ID/секрет руками, а цього ми й уникали з OAuth.

Його можна лишити як аварійний варіант для клієнтів, що не підтримують ні CIMD,
ні DCR (див. «Ручна реєстрація» нижче).

## Цільове рішення: CIMD + DCR паралельно

Лишаємо CIMD для Claude/ChatGPT як є і **додаємо DCR (RFC 7591)** для решти.
Порядок вибору в `/authorize` і `/token`:
`client_id` схожий на https-URL → CIMD (як зараз); інакше → пошук у таблиці
зареєстрованих клієнтів.

### Бекенд

- **Таблиця `oauth_clients`** (міграція Drizzle):
  `id` (= `client_id`, випадковий, напр. `mygym_cli_<32 hex>`),
  `clientSecretHash` (sha256, nullable — для публічних клієнтів),
  `tokenEndpointAuthMethod` (`none` | `client_secret_post` | `client_secret_basic`),
  `clientName`, `logoUri`, `clientUri`, `redirectUris` (jsonb),
  `grantTypes`, `createdAt`, `lastUsedAt`, `registrationIp`(?).
- **`POST /api/oauth/register`** (RFC 7591), відповідь `201` з `client_id`,
  `client_secret` (лише для confidential, **один раз**),
  `client_id_issued_at`, `client_secret_expires_at: 0`.
- **Метадані:** додати `registration_endpoint` і розширити
  `token_endpoint_auth_methods_supported` до
  `["none", "client_secret_post", "client_secret_basic"]`.
  `client_id_metadata_document_supported: true` **лишити**: без нього Claude не
  бере CIMD (див. `CLAUDE.md`).
- **`/token`:** для DCR-клієнтів перевіряти секрет (`client_secret_post` у body або
  `Authorization: Basic`), порівняння через `crypto.timingSafeEqual`. PKCE
  обов'язковий для всіх, і для confidential теж.
- **`/authorize`:** `redirect_uri` — точний збіг із зареєстрованими
  (для loopback — порт ігнорується, як зараз у CIMD).
- Спільна абстракція: `resolveClient(clientId)` повертає той самий `OAuthClient`
  для обох джерел, щоб решта `oauth.service.ts` не знала про різницю.

### Безпека відкритої реєстрації (головне, що треба продумати)

DCR відкритий: зареєструватися може будь-хто. Тому:
- **`redirect_uris`**: лише `https://` або loopback `http://127.0.0.1|localhost`;
  без фрагментів, без wildcard. Опційно allow-list хостів для https
  (`OAUTH_DCR_REDIRECT_HOSTS`, напр. `gemini.google.com`, `*.googleusercontent.com`,
  `vscode.dev`, …) — вирішити: allow-list чи відкрито + попередження на згоді.
- **Rate limit** на `/register` за IP (напр. 10/год).
- **Сторінка згоди** (`OAuthConsentPage.tsx`): для DCR-клієнтів явно показувати
  «Застосунок не перевірений MyGym» + **хост redirect URI** (бо `client_name`
  атакер пише сам, а `redirect_uri` — реальне місце, куди піде код).
  Логотип з `logo_uri` для неперевірених клієнтів не показувати або проксувати
  (див. `clientIcon.*` на гілці `feat/client-logos`).
- **Прибирання**: клієнти без жодного grant старші за N днів видаляти
  (як прострочені рядки при видачі нових токенів).
- Прив'язка запиту до браузера (`mygym_oauth_browser`) і одноразовий код
  працюють і для DCR без змін.
- Опційно: RFC 7592 (`registration_access_token` для оновлення/видалення клієнта)
  не робити в першій версії.

### Ручна реєстрація (запасний варіант)

Для клієнтів без DCR і CIMD (форма лише з полями ID/secret, як у Gemini, якщо
DCR чомусь не спрацює): у «Інтеграції» кнопка «Зареєструвати власний
OAuth-клієнт» (лише сесія, `requireSession`): користувач вставляє **redirect
URI** (у Gemini — кнопка *Copy redirect URI*), отримує `client_id` +
`client_secret` один раз. Під капотом це той самий рядок `oauth_clients`, але з
власником `userId`.

## Перевірка після реалізації

1. `curl …/.well-known/oauth-authorization-server` → є `registration_endpoint`.
2. Gemini: Custom → URL без ID/secret → Next → згода → Connect → інструменти видно.
3. Claude і ChatGPT досі підключаються через CIMD (регресія).
4. Gemini CLI: `gemini mcp add --transport http mygym https://<домен>/mcp` →
   `/mcp auth mygym`.
5. Тести: `test/oauth-dcr.test.ts`: реєстрація, невалідні redirect_uris,
   секрет (post/basic/невірний), PKCE для confidential, rate limit, ізоляція.

## Відкриті питання

- Який точно redirect URI у Gemini (кнопка *Copy redirect URI*) і чи
  реєструється він як public (`none`) чи confidential клієнт? Зловити в
  логах `/api/oauth/register` при першій спробі.
- Allow-list хостів redirect URI для DCR чи відкрито + попередження?
- Чи треба оновлювати `CLAUDE.md` («клієнти лише через CIMD… без DCR»): так,
  рішення змінюється, оновити після реалізації (`/update-context`).
