---
paths:
  - "frontend/src/components/Navbar.tsx"
  - "frontend/src/components/BottomNav.tsx"
  - "frontend/src/components/AccountMenu.tsx"
  - "frontend/src/components/NavIcons.tsx"
  - "frontend/src/components/LanguageSwitcher.tsx"
  - "frontend/src/utils/initials.ts"
  - "frontend/src/App.tsx"
  - "frontend/src/pages/ProgramsPage.tsx"
---

# Навігація: хедер, нижній таб-бар, меню акаунта

Макет — `docs/tasks/design/NavMobileA.dc.html`. Межа — `lg` (1024 px): нижче п'ять посилань
разом із таймером не вміщаються в хедер. Усе навігаційне рендериться лише для залогіненого
(`if (!user) return null`).

## Хедер (`Navbar.tsx`)

- Sticky, `pt-[env(safe-area-inset-top)]`, `backdrop-blur`. Лого → посилання розділів (лише
  `lg+`: Журнал, Програми, Прогрес, Вправи, Імпорт) → `WorkoutTimer` → праворуч:
  - `lg+`: `LanguageSwitcher` + `ProfileMenu` (аватар з ініціалами + випадне меню: email,
    Розклад, Інтеграції — не для демо, Вийти);
  - нижче `lg`: `AccountMenu` (аватар 44×44).
- Таймер на телефоні — по центру між лого й аватаром, на `lg+` — біля перемикача мов.
- Ініціали аватара — `utils/initials.ts::initials` (перші літери двох сегментів локальної
  частини email, інакше дві перші літери); спільна для `ProfileMenu` і `AccountMenu`.

## Нижній таб-бар (`BottomNav.tsx`, нижче `lg`)

- `fixed bottom-0 z-30`, `aria-label` `nav.mainNav`. Чотири таби-іконки (`aria-label`/`title`
  = назва розділу): Журнал (`/`, `end`), Програми, Прогрес, Вправи — і кнопка «Додатково»
  (`nav.more`, `aria-haspopup="dialog"`, `aria-expanded`).
- **«Додатково» — аркуш** (`role="dialog"`, `aria-label` `nav.more`, `z-40`, над баром): Розклад,
  Імпорт, Інтеграції (для демо рядка нема — сторінка й так за `NotForDemo` в `App.tsx`).
  Кнопка «Додатково» підсвічена, поки аркуш відкритий або поточний маршрут — один з його пунктів;
  поки аркуш відкритий, активний таб не підсвічується. Затемнення — лише над баром
  (таби лишаються клікабельними).
- Аркуш закривається: зміною `pathname` (будь-яка навігація, зокрема тап по таймеру), Escape
  і хрестиком (фокус повертається на «Додатково»), тапом по затемненню, переходом ширини вікна на
  `lg+` (`matchMedia('(min-width: 1024px)')`) — інакше він повертався б відкритим при звуженні.
  При відкритті фокус — на перше посилання.
- Іконки — `components/NavIcons.tsx` (сітка 24, `currentColor`; таби 30 px, рядки аркуша
  22 px). Олівець `JournalIcon` залитий `var(--nav-icon-bg)`, щоб маскувати лінії під ним;
  активна «пігулка» задає йому `ACTIVE_PILL_SOLID` — колір пігулки (accent 14% над баром
  `#1b2029`), сплющений у непрозорий.

## Висота бару — інваріант 76 px

Бар = **76 px + `env(safe-area-inset-bottom)`** (inset — у його `paddingBottom`). Те саме число
стоїть у:
- `App.tsx` — `<main>` залогіненого: `pb-[calc(76px+1.5rem+env(safe-area-inset-bottom))]`,
  з `lg` — звичайний `pb-[max(1.5rem,env(safe-area-inset-bottom))]`; незалогінений — без бару;
- `BottomNav.tsx` — низ затемнення (76 px) і аркуша «Додатково» (84 px);
- `ProgramsPage.tsx` — липка панель форми програми: нижче `lg`
  `bottom-[calc(76px+env(safe-area-inset-bottom))]` (лежить на барі, свій inset уже не
  додає), з `lg` — `bottom-0` + inset.

Змінив висоту бару → онови всі місця. Новий липкий/fixed низ сторінки → так само над баром.
`ReactQueryDevtools` (dev, `main.tsx`) — `buttonPosition="top-left"`: справа знизу кнопка
перекривала б «Додатково».

## Меню акаунта (`AccountMenu.tsx`, нижче `lg`)

- Аватар → картка: «Обліковий запис» (`nav.account`) + email, «Мова» + `LanguageSwitcher size="large"` (сегменти
  48×38), «Вийти з акаунта» (`nav.logoutLong`). Розклад та інтеграції тут не дублюються —
  вони в «Додатково».
- `role="dialog"` + `aria-modal="true"`, а не `role="menu"`: меню може містити лише
  menuitem-и, а тут ще кнопки мов. Tab циклиться всередині картки; при відкритті фокус на
  першу кнопку, Escape/хрестик/тап по затемненню закривають з поверненням фокусу на аватар.
- **Портал у `<body>`**: sticky-хедер з `backdrop-blur` — окремий stacking context і
  containing block для `fixed`-нащадків, тож затемнення всередині покривало б лише хедер, а
  нижній бар малювався б поверх картки.
- Позиція `top` рахується раз при відкритті — під аватаром (`getBoundingClientRect().bottom
  + 8`; висота хедера залежить від safe-area). Тому зміна **ширини** вікна (поворот) меню
  закриває; зміна лише висоти — ні (мобільні браузери шлють `resize`, ховаючи адресний рядок).
- Зовнішній тап ловить затемнення, а не `mousedown` на документі: інакше той самий тап
  долітав би кліком до сторінки під меню.
