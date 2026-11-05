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

# Навігація: хедер, нижній док, меню акаунта

Макети — `docs/tasks/design/NavMobileA.dc.html` (аркуш «Додатково», поведінка) і
`docs/tasks/design/NavDock.dc.html` (док). Межа — `lg` (1024 px): нижче п'ять посилань
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

## Нижній док (`BottomNav.tsx`, нижче `lg`)

- `fixed`, `z-30`, `aria-label` `nav.mainNav`. Чотири таби: Журнал (`/`, `end`), Програми, Прогрес,
  Вправи — і кнопка «Додатково» (`aria-haspopup="dialog"`, `aria-expanded`).
- **Капсула:** висота 68 px, радіус 34 px, 16 px від низу + inset, боки `max(16px, inset)`, поля
  `px-2.5`, таби — `justify-between`. Фон `bg-surface-raised/[.94]` + `backdrop-blur-[16px]`, рамка
  `surface-border`, тінь. Довкола дока видно сторінку.
- **Таби:** завжди 48 px заввишки. Неактивний — лише іконка 22 px, `text-slate-400` (понад 6:1 на
  доку), 48×48 (`shrink-0`). Активний — пігулка `bg-accent` (токен) з іконкою й підписом 14px
  semibold, колір `text-surface` (5.8:1 на `accent`), відступи `pl-3.5 pr-[18px]`.
  Переходи 220 ms (`motion-reduce:transition-none`) — padding і `max-width`, а не ширина: `width`
  до `auto` не анімується. Натиск — `group-active:scale-[.92]`. Кільце фокусу — `accent`, на
  пігулці — `slate-100`.
- **Вузькі екрани:** таби не зменшуються, місце дають поля. Нижче 379 px (`max-[378px]:`) відступи
  пігулки 12/14; нижче 375 px (`max-[374px]:`) боки дока 12 px, поля 6 px. Найширший підпис
  («Програми», 71 px) лишається цілим до 357 px; вужче обрізається (`truncate`) — лише в пігулці.
- **Доступна назва таба — підпис:** він завжди в DOM (`aria-label`/`title` на табах нема, svg —
  `aria-hidden`), у неактивного лише стиснутий (`max-w-0 opacity-0`) — так він і розгортається
  анімацією. У «Додатково» підпис на екрані короткий — `nav.moreShort` («Ще»/«More», `aria-hidden`),
  а скрінрідер читає `nav.more` (`sr-only`), як і заголовок аркуша.
- **«Додатково» — аркуш** (`role="dialog"`, `aria-label` `nav.more`, `z-40`, над доком): Розклад,
  Імпорт, Інтеграції (для демо рядка нема — сторінка й так за `NotForDemo` в `App.tsx`).
  Кнопка «Додатково» підсвічена, поки аркуш відкритий або поточний маршрут — один з його пунктів;
  поки аркуш відкритий, активний таб не підсвічується. Затемнення — на весь екран (`inset-0 z-40`),
  зокрема довкола дока; сам док на цей час піднімається на `z-50`, над затемненням, тож таби
  лишаються клікабельними.
- Аркуш закривається: зміною `pathname` (будь-яка навігація, зокрема тап по таймеру), Escape
  і хрестиком (фокус повертається на «Додатково»), тапом по затемненню, переходом ширини вікна на
  `lg+` (`matchMedia('(min-width: 1024px)')`) — інакше він повертався б відкритим при звуженні.
  При відкритті фокус — на перше посилання.
- Іконки — `components/NavIcons.tsx` (сітка 24, `currentColor`; таби 22 px зі stroke 1.7,
  рядки аркуша 22 px). Олівець `JournalIcon` залитий `var(--icon-bg)`, щоб маскувати лінії під ним;
  значення задає таб у `tabClass`: `surface.raised` — неактивний, `accent` — пігулка. Змінив фон
  дока чи пігулки → зміни й `--icon-bg`. Поза табом змінна не задана й заливки нема.

## Висота дока — змінна `--bottom-nav-h`

`--bottom-nav-h` = **висота дока + зазор під ним**, 84px (68 + 16), без
`env(safe-area-inset-bottom)` — inset додають окремо; змінна — `:root` у `@layer base`
`styles/index.css`. Самі 68 і 16 — літерали в `BottomNav.tsx` (`h-[68px]`,
`bottom: calc(16px + inset)`): змінив їх → зміни й змінну. Її читають:
- `App.tsx` — `<main>` залогіненого: `pb-[calc(var(--bottom-nav-h)+1.5rem+env(safe-area-inset-bottom))]`,
  з `lg` — звичайний `pb-[max(1.5rem,env(safe-area-inset-bottom))]`; незалогінений — без дока;
- `BottomNav.tsx` — низ аркуша «Додатково» (змінна + 8px + inset);
- `ProgramsPage.tsx` — липка панель форми програми йде під док до низу екрана (`sticky bottom-0
  z-10`), щоб довкола дока не просвічувала сторінка. Нижче `lg`
  `pb-[calc(var(--bottom-nav-h)+1rem+env(safe-area-inset-bottom))]` піднімає кнопки над доком, а
  `-mb-[calc(var(--bottom-nav-h)+1.5rem+env(safe-area-inset-bottom))]` дорівнює нижньому padding
  `<main>` і забирає його — інакше наприкінці скролу панель піднімалась би на цю висоту. З `lg` —
  `mb-0` і `pb-[max(1rem,env(safe-area-inset-bottom))]`.

**Зв'язок `App.tsx` ↔ `ProgramsPage.tsx`:** `1.5rem` у `pb` `<main>` і в `-mb` панелі — те саме
значення, записане двічі; змінив в одному файлі → зміни в іншому.

Новий липкий/fixed низ сторінки → теж через `var(--bottom-nav-h)`: над доком або під ним із таким
самим padding.
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
  нижній док малювався б поверх картки.
- Позиція `top` рахується раз при відкритті — під аватаром (`getBoundingClientRect().bottom
  + 8`; висота хедера залежить від safe-area). Тому зміна **ширини** вікна (поворот) меню
  закриває; зміна лише висоти — ні (мобільні браузери шлють `resize`, ховаючи адресний рядок).
- Зовнішній тап ловить затемнення, а не `mousedown` на документі: інакше той самий тап
  долітав би кліком до сторінки під меню.
