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
  - "frontend/src/styles/index.css"
---

# Навігація: хедер, нижній таб-бар, меню акаунта

Макети — `docs/tasks/design/NavMobileA.dc.html` (аркуш «Додатково», поведінка) і
`docs/tasks/design/NavBarC.dc.html` (нижній бар). Межа — `lg` (1024 px): нижче п'ять посилань
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

- `fixed bottom-0 z-30`, `aria-label` `nav.mainNav`. Чотири таби: Журнал (`/`, `end`),
  Програми, Прогрес, Вправи — і кнопка «Додатково» (`nav.more`, `aria-haspopup="dialog"`,
  `aria-expanded`).
- **Стиль (макет C):** плаский бар `bg-surface` з 1px верхньою лінією `border-surface-border`.
  Кожен таб (`TabContent`) — іконка 26 px + видимий підпис 11px semibold (`truncate`); тап-зона —
  уся п'ята частина бару. Неактивний — `#8b93a3` (5.8:1 на `surface`), активний — `accent` +
  індикатор 28×3 на верхній лінії (`top-[-1px]`, заокруглений знизу); «пігулки» нема. Переходи
  180 ms (`motion-reduce:transition-none`), натиск — `group-active:scale-[.92]`.
- **Доступна назва таба — видимий підпис:** `aria-label`/`title` на табах нема, svg — `aria-hidden`.
- **«Додатково» — аркуш** (`role="dialog"`, `aria-label` `nav.more`, `z-40`, над баром): Розклад,
  Імпорт, Інтеграції (для демо рядка нема — сторінка й так за `NotForDemo` в `App.tsx`).
  Кнопка «Додатково» підсвічена, поки аркуш відкритий або поточний маршрут — один з його пунктів;
  поки аркуш відкритий, активний таб не підсвічується. Затемнення — лише над баром
  (таби лишаються клікабельними).
- Аркуш закривається: зміною `pathname` (будь-яка навігація, зокрема тап по таймеру), Escape
  і хрестиком (фокус повертається на «Додатково»), тапом по затемненню, переходом ширини вікна на
  `lg+` (`matchMedia('(min-width: 1024px)')`) — інакше він повертався б відкритим при звуженні.
  При відкритті фокус — на перше посилання.
- Іконки — `components/NavIcons.tsx` (сітка 24, `currentColor`; таби 26 px зі stroke 1.7,
  рядки аркуша 22 px). Олівець `JournalIcon` залитий `fill-surface` — фоном бару, щоб маскувати
  лінії під ним; змінив фон бару → зміни й заливку.

## Висота бару — одна змінна `--bottom-nav-h`

Бар = **`--bottom-nav-h` + `env(safe-area-inset-bottom)`**; змінна — `:root` у `@layer base`
`styles/index.css` (78px), inset — у `paddingBottom` бару (`calc(14px + inset)`). Її читають:
- `App.tsx` — `<main>` залогіненого: `pb-[calc(var(--bottom-nav-h)+1.5rem+env(safe-area-inset-bottom))]`,
  з `lg` — звичайний `pb-[max(1.5rem,env(safe-area-inset-bottom))]`; незалогінений — без бару;
- `BottomNav.tsx` — висота бару, низ затемнення (змінна + inset) і аркуша «Додатково»
  (змінна + 8px + inset);
- `ProgramsPage.tsx` — липка панель форми програми: нижче `lg`
  `bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))]` (лежить на барі, свій inset
  уже не додає), з `lg` — `bottom-0` + inset.

Змінити висоту бару = змінити лише змінну. Новий липкий/fixed низ сторінки → теж через
`var(--bottom-nav-h)`, над баром.
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
