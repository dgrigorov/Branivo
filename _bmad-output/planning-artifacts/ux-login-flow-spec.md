# UX Mini-Spec — Auth Flow (Login, Register, Password Reset)

**Author:** Daniel
**Date:** 2026-03-24
**Status:** Implemented
**Reference Design:** Dribbble — Phone OTP Auth UI (light sage theme)

---

## 1. Design Language

### Color Palette

| Token | Hex | Употреба |
|-------|-----|---------|
| `kBgColor` | `#E0EAF0` | Фон на всички auth екрани |
| `kDarkCard` | `#1A2D3A` | Info карта, headings |
| `kBlueMid` | `#3EA8E5` | Primary action, focus border |
| `kBlueLight` | `#6CC4F5` | Gradient start за CTA бутон |
| `kFieldBg` | `#F5F8FC` | Fill цвят на input полетата |
| White | `#FFFFFF` | Форм карти, OTP кутийки |

### Typography

| Употреба | Size | Weight |
|---------|------|--------|
| Screen heading | 32px | w800 (ExtraBold) |
| Body / subtitle | 15px | w400, opacity 55% |
| Button label | 16px | w700, letter-spacing 0.3 |
| Info card title | 14px | w700 |
| Info card subtitle | 12px | w400, white60 |
| Field label | 14px | grey |

### Общи компоненти

#### `_CircleButton` — Back navigation
- 40×40px, бял кръг с мека сянка
- `Icons.arrow_back_ios_new_rounded`, size 16, цвят `kDarkCard`

#### `_DarkInfoCard` — Контекстна информация
- Фон `kDarkCard`, border-radius 16px
- Иконка в полупрозрачен контейнер (white 15%) + title + subtitle
- Използва се на всеки auth екран за контекстна подкана

#### `_BranivoTextField` — Input поле
- Fill style (без outline border), `kFieldBg` фон
- Focused border: 1.5px `kBlueMid`
- Border-radius 14px, contentPadding 16px
- Prefix icon в `kBlueMid`

#### `_GradientButton` — Primary CTA
- Height 56px, border-radius 16px
- Gradient: `kBlueLight` → `kBlueMid` (left → right)
- Glow shadow: `kBlueMid` at alpha 90, blur 12px, offset (0, 4)
- Loading state: `CircularProgressIndicator` white, strokeWidth 2.5

---

## 2. Екран: Login

**Файл:** `lib/features/auth/screens/login_screen.dart`

### Layout (top → bottom)
```
SafeArea
└── SingleChildScrollView (px: 24, py: 32)
    ├── TopBar
    │   ├── _CircleButton (back / maybePop)
    │   └── TextButton "Регистрация" → /registration
    ├── SizedBox(40)
    ├── Heading "Добре дошли!" + subtitle
    ├── SizedBox(24)
    ├── _DarkInfoCard (lock icon, "Сигурно влизане")
    ├── SizedBox(24)
    ├── [AuthErrorState] → ErrorBanner
    └── FormCard (white, radius 20, shadow)
        ├── _BranivoTextField "Имейл"
        ├── SizedBox(12)
        ├── _BranivoTextField "Парола" (obscure + toggle)
        ├── SizedBox(24)
        └── _GradientButton "Влез"
```

### State mapping
| AuthState | UI |
|-----------|-----|
| `AuthInitialState` | Normal form |
| `AuthLoadingState` | Button shows spinner, disabled |
| `AuthErrorState` | Red error banner above form card |
| `AuthRequires2FAState` | Navigate → `/2fa` |
| `AuthAuthenticatedState` | Navigate → `/` |

---

## 3. Екран: 2FA Verification

**Файл:** `lib/features/auth/screens/two_fa_screen.dart`

### Layout (top → bottom)
```
SafeArea
└── GestureDetector (onTap: requestFocus)
    └── SingleChildScrollView (px: 24, py: 32)
        ├── TopBar (_CircleButton back)
        ├── SizedBox(40)
        ├── Heading "Верификация" + subtitle
        ├── SizedBox(24)
        ├── _DarkInfoCard (verified_user icon, "Двустепенна верификация")
        ├── SizedBox(32)
        ├── [AuthErrorState] → ErrorBanner
        ├── OtpBoxesRow (6× _OtpBox)
        ├── HiddenTextField (height: 0, transparent)
        ├── SizedBox(32)
        └── _GradientButton "Провери" (disabled opacity 0.5 when < 6 digits)
```

### `_OtpBox` — Индивидуална OTP цифра
- 48×56px, white, border-radius 14px, мека сянка
- **Active** (cursor position): border 2px `kBlueMid` + мигащ cursor bar
- **Filled**: border 1.5px `kBlueMid` at alpha 100, показва цифрата (22px, w700)
- **Empty**: без border
- `AnimatedContainer` duration 150ms за плавен преход

### OTP вход механизъм
- Скрит `TextFormField` с `FocusNode` — `digitsOnly`, max 6
- `GestureDetector` на целия екран → `requestFocus()`
- `_codeController.addListener(() => setState(...))` за real-time update на кутийките
- Auto-focus при `initState` (след first frame)

### State mapping
| AuthState | UI |
|-----------|-----|
| `AuthInitialState` | OTP boxes empty |
| `AuthLoadingState` | Button spinner, disabled |
| `AuthErrorState` | Red error banner |
| `AuthAuthenticatedState` | `pushReplacementNamed('/dashboard')` |

---

## 4. Екран: Register (TODO — следваща итерация)

> Текущо Registration screen е отделен flow. Следващата итерация трябва да приложи същата design система.

### Планирани промени
- Sage `#E0EAF0` фон вместо бял
- `_DarkInfoCard` с "Създайте своя акаунт"
- `_BranivoTextField` за всички полета
- `_GradientButton` за Submit
- Scroll picker за дата на раждане (Date of Birth) — вдъхновен от референса

---

## 5. Екран: Password Reset (TODO — следваща итерация)

### Планирани промени
- Sage фон + `_DarkInfoCard` с "Нулиране на парола"
- Step 1: Email input → изпращане на link
- Step 2: OTP boxes (6 digit) — reuse на `_OtpBox` компонента
- Step 3: New password + confirm (obscure toggles)

---

## 6. Дизайн решения и обосновка

| Решение | Защо |
|---------|------|
| Sage `#E0EAF0` фон вместо бял | По-мек контраст, намалява eye strain; референсът го ползва като base tone |
| `_DarkInfoCard` на всеки auth екран | Дава контекст на потребителя без modal — по-clean UX |
| Fill inputs без border | По-модерен вид; focus border дава достатъчна visual feedback |
| Gradient CTA с glow | Водещ визуален елемент — ясна call-to-action йерархия |
| Отделни OTP кутийки с hidden input | Стандарт за мобилни OTP; native keyboard, без custom keypad |
| `AnimatedContainer` за OTP boxes | Плавен преход при навигация между позициите |
| `withAlpha()` вместо `withOpacity()` | Избягва deprecated Flutter API |

---

## 7. Достъпност

- Всички touch targets ≥ 40×40px (`_CircleButton` = 40×40)
- Цветови контраст heading/фон: `#1A2D3A` на `#E0EAF0` → ratio ~8:1 (WCAG AA ✓)
- Error state съдържа и иконка + текст (не само цвят)
- `textInputAction` за keyboard navigation между полетата

---

## 8. Файлова структура

```
lib/features/auth/screens/
├── login_screen.dart     ✅ Redesigned
└── two_fa_screen.dart    ✅ Redesigned (with _OtpBox, _GradientButton)

test/features/auth/screens/
└── login_screen_test.dart ✅ Updated
```

### Shared компоненти (дефинирани в `login_screen.dart`)
Използват се и от `two_fa_screen.dart` чрез import:
- `_CircleButton`
- `_DarkInfoCard`
- `_BranivoTextField`
- `_GradientButton`

> **TODO:** При имплементация на Register/Password Reset — екстрактирай shared компонентите в `lib/core/widgets/auth_widgets.dart`
