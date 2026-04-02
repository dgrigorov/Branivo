---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
lastStep: 14
status: complete
inputDocuments: ['prd.md', 'product-brief.md', 'project-context.md']
revisions:
  - date: 2026-03-25
    section: "Onboarding Experience"
    description: "Added full mobile onboarding spec: Splash, Value Proposition Slides, Quick Interest Selector, Entry Gate, Login, Reset Password (3-step), Register, Anonymous Entry"
  - date: 2026-04-02
    section: "GO Quote Wizard Web Portal"
    description: "Added 5-step GO wizard flow for web portal: vehicle data, additional details, offers with streaming + social proof sidebar, start date calendar, owner details"
---

# UX Design Specification Branivo

**Author:** Daniel
**Date:** 2026-03-17

---

## Executive Summary

### Project Vision

Branivo е white-label B2B2C SaaS платформа, която дава на всеки застрахователен брокер собствен
брандиран дигитален канал (Flutter app + Next.js web + Broker Dashboard), активен в рамките на < 1
час. Платформата не носи застрахователен риск. Успехът се измерва с невидимост — крайният клиент
вижда само бренда на брокера.

### Target Users

| Persona | Профил | Ключова UX нужда |
|---------|--------|-----------------|
| **Мариян** (брокер) | 4 агента, 180 клиента, Excel манталитет | Прост dashboard; live < 1 час |
| **Николай** (нов клиент) | Мобилно-first, висока tech грамотност | Оферти < 30 сек, Apple Pay, без регистрация |
| **Радка** (нов клиент, 62г.) | Таблет с размазана камера | OCR fallback без crash, Add to Home Screen |
| **Стоян** (връщащ се) | Лоялен, бърз | Push → Face ID → Pay за 12 секунди |

### Key Design Challenges

1. **White-label illusion** — < 5% от крайните клиенти да разпознаят платформата. UX трябва да
   е 100% tenant-branded на всяко ниво — анимации, micro-copy, цветова схема.
2. **OCR за широка аудитория** — един flow, две скорости. Проектираме за Радка като baseline;
   Стоян получава скоростта си от Face ID + Apple Pay (системни, не наш UX проблем).
3. **Anonymous → micro-registration friction** — само телефон + OTP, inline в purchase flow,
   без redirect, без modal. Потребителят не трябва да осъзнава, че се е регистрирал.
4. **Broker Dashboard за Excel манталитет** — Мариян управлява полици, плащания и клиенти без
   обучение.

### Design Opportunities

1. **OCR като "wow момент"** — 3 снимки → оферти в < 30 сек е конкурентно предимство.
   Прогрес анимация + tenant branding правят момента театрален.
2. **Renewal като push → tap → done** — референс UX в застрахователния сектор.
3. **Tenant-level behavioral hints** — при onboarding брокерът декларира средна възраст на
   клиентите → платформата адаптира font size defaults и OTP timeout per tenant.
4. **Data strategy след launch** — OCR fallback rate след 30 дни разкрива реалното
   Радка/Стоян разпределение и информира следващите UX итерации.

---

## Core User Experience

### Defining Experience

Core loop: **OCR scan → оферти → покупка** — това е MVP приоритет #1.
Централен дизайн принцип: **"30-секундното обещание"** — всяко дизайн решение се
оценява с въпроса "Помага ли това потребителят да получи оферти по-бързо и по-уверено?"
Ако не помага — изрязваме го.

### Platform Strategy

- **App-first design, PWA parity** — проектираме за Flutter native, валидираме PWA
  равностойност. Радка не трябва да знае разликата между app и Add-to-Home-Screen.
- Touch-first, mobile-first (< 768px)
- Device capabilities: Camera (OCR), Face ID / Touch ID, Apple Pay / Google Pay,
  Push notifications
- Offline: само issued documents в wallet; quote flow = винаги online

### Effortless Interactions

| Interaction | Принцип |
|-------------|---------|
| OCR scan | 3 снимки → автоматично попълване; confidence ≥ 0.85 = auto-fill |
| OCR fallback | Показваме САМО полетата с нисък confidence — не цяла форма |
| Micro-registration | Само телефон + OTP, inline в purchase flow, без redirect |
| Renewal | Push → Face ID → Apple Pay — нула ръчни полета |
| Получаване на полица | PDF + Green Card автоматично по имейл < 5 мин |

### Critical Success Moments

1. **Scan success** — "Намерихме вашето МПС" — камерата разпознава талона,
   прогрес анимация, tenant-branded feedback
2. **Оферти се появяват** — < 30 сек, sorted by score, `is_recommended` badge видим,
   цени ясни и сравними
3. **Плащането минава** — Stripe confirmation → екран с брокерския бранд →
   "Готово, полицата е ваша"

### Experience Principles

1. **"30-секундното обещание"** — оферти преди всичко; registration, tutorials и
   onboarding са след покупката
2. **Проектирай за Радка, оптимизирай за Стоян** — baseline accessibility,
   системна скорост (Face ID, Apple Pay)
3. **Failure е дизайн момент** — OCR fallback показва само непопълнените полета;
   никога пълна форма като наказание
4. **Невидима платформа** — 100% tenant branding на всяко ниво; < 5% разпознаване
5. **App-first, PWA parity** — native Flutter experience е reference; PWA трябва
   да е равностоен, не degraded

---

## Desired Emotional Response

### Primary Emotional Goals

| Потребител | Момент | Целева емоция |
|------------|--------|---------------|
| Краен клиент | При сканиране | **Увереност** — "системата ме разбира" |
| Краен клиент | При оферти | **Контрол + Разбиране** — "аз избирам; системата познава моята ситуация" |
| Краен клиент | При покупка | **Облекчение + Удовлетворение** — "готово, и взех правилното решение" |
| Краен клиент | При failure | **Подкрепеност** — "помагат ми, не ме наказват" |
| Брокер | При клиентска покупка | **Гордост + Доверие** — "изглеждам като голям играч, системата работи за мен" |
| Брокер | При dashboard | **Майсторство и Собственост** — "аз изградих този бизнес" |

### Emotional Journey Mapping

**Нов клиент (Николай):**
```
Любопитство → Увереност → Разбиране → Облекчение + Удовлетворение
(отваря app)   (OCR работи)  (офертата е "за мен")  (полицата е купена)
```

**Нов клиент с OCR failure (Радка):**
```
Тревога → Подкрепеност → Контрол → Облекчение
(OCR се проваля) (само 2 полета, "помагаме")  (избира)  (готово)
```

**Връщащ се клиент (Стоян):**
```
Очакване → Лекота → Удовлетворение
(push notification) (Face ID → Pay)  (12 секунди, готово)
```

**Брокер (Мариян) при клиентска покупка:**
```
Прегледност → Гордост → Доверие
(вижда sale-а в dashboard) (собствен бранд) (Stripe разпредели комисионата)
```

### Micro-Emotions

| Искаме | Избягваме |
|--------|-----------|
| Увереност при сканиране | Тревога при OCR грешка |
| Контрол при избор на оферта | Объркване от прекалено много опции |
| **Разбиране** — "системата познава моята ситуация" | Generic insurance speak |
| Облекчение след покупка | Съмнение дали е минало плащането |
| Подкрепеност при failure | Срам или усещане за некомпетентност |
| Гордост + Майсторство у брокера | Усещане за generic/неразличим продукт |
| Доверие в платформата | Страх от данни и сигурност |

### Design Implications

| Емоция | UX подход |
|--------|-----------|
| **Увереност** при OCR | Реална прогрес анимация, tenant-branded feedback, конкретен резултат ("Намерихме: Toyota Corolla 2019") |
| **Разбиране** при оферти | `is_recommended` badge с 1 изречение динамично обяснение: "Препоръчано: най-бърза обработка на щети (24ч) + пълно покритие" |
| **Контрол** при оферти | Ясна сортировка, transparent scoring, без агресивен натиск |
| **Облекчение + Удовлетворение** | Два отделни екрана: (1) голям checkmark "Готово!" (2) резюме на покритието "Взехте правилното решение" |
| **Подкрепеност** при failure | "Помогни ни с няколко детайла" — само непопълнени полета, без пълна форма |
| **Майсторство** у брокера | Dashboard с MRR горе вляво, live нотификации за нови продажби, subtle micro-celebration при всяка нова полица |

### Emotional Design Principles

1. **"Помагаме, не съдим"** — при всяка грешка tone-ът е подкрепящ, не технически
2. **"Двойна победа при покупка"** — облекчение (checkmark) + удовлетворение (покритие резюме) на два отделни екрана
3. **"Разбиране над цена"** — BG пазар: потребителят плаща повече ако му е обяснено защо. `is_recommended` = динамично "защо", не просто badge
4. **"Невидима гордост за клиента, видима за брокера"** — клиентът вижда само брокерския бранд; брокерът вижда своя бизнес в Dashboard
5. **"Доверие = бързина + обяснение"** — техническо доверие (< 30 сек) + съдържателно доверие (защо тази оферта е за теб)

---

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

| Продукт | Какво правят добре | Слабост (наша възможност) |
|---------|-------------------|--------------------------|
| **Lemonade** | Human tone, AI-assisted onboarding, instant claims, behavioral economics (giveback) | D2C само, не white-label; не работи за BG broker модел |
| **Boleron** | Мулти-застрахователно сравнение, бърз quote flow за BG | Ръчно въвеждане, generic бранд, функционален без емоция |
| **24ins.bg** | Изградено доверие и brand recognition в BG | Legacy desktop-first UX, тромав мобилен, без anonymous flow |
| **Amarant** | По-модерен визуален дизайн, по-добро мобилно изживяване | Generic бранд, без OCR, без white-label |
| **SDI** | Силна brand recognition, broker network | Legacy система, тежък onboarding, без digital-first |

**Ключово наблюдение:** Нито един BG конкурент няма OCR, white-label или anonymous-first flow.
Lemonade има емоционалния UX, но не работи за broker модела. Branivo комбинира двете.

### Transferable UX Patterns

**От Lemonade:**
- **Human tone навсякъде** — micro-copy е разговорен, не legalistic. "Намерихме вашето МПС!" вместо "Данните са обработени успешно."
- **Двата слоя текст** — human layer (голям, разговорен) + regulatory layer (малък, collapsible "Виж пълните условия"). КФН compliance без да жертваме human tone.
- **Progress celebration** — всяка стъпка се потвърждава с позитивен feedback
- **Instant gratification** — резултатът идва бързо и е dramatized (анимация, визуален impact)
- **Loyalty като micro-delight** — reward веднага след покупката, докато емоционалното състояние е позитивно

**От Boleron / 24ins.bg / Amarant:**
- **Ценова прозрачност** — всички оферти наредени, без скрити такси
- **Сравнителна структура** — лесна за разбиране без застрахователни познания
- **Доверие чрез познатост** — лога на застрахователите (ДЗИ, Алианц, Булстрад) изграждат доверие

### Anti-Patterns to Avoid

| Anti-pattern | Откъде идва | Защо го избягваме |
|-------------|-------------|-------------------|
| **Ръчно въвеждане на всички данни** | Boleron, 24ins.bg, SDI | OCR е нашето конкурентно предимство — никога не падаме до пълна форма |
| **Desktop-first layout** | 24ins.bg, SDI | BG потребителите са mobile-first; desktop е secondary |
| **Registration преди оферти** | Повечето BG платформи | Убива конверсията в момента на най-висок intent |
| **Generic бранд без personalization** | Всички BG конкуренти | White-label illusion е core value; никога не показваме "Branivo" на крайния клиент |
| **Legalistic micro-copy** | Индустриен стандарт | Говорим на езика на потребителя, не на застрахователя |
| **Error screens вместо помощ** | Legacy системи | При failure — "Помогни ни с няколко детайла", не "Грешка 422" |

### Design Inspiration Strategy

**Adopt от Lemonade:**
- Human, разговорен tone навсякъде в micro-copy
- Двата слоя текст (human + regulatory) — задължително за КФН compliance
- Progress celebration на всяка стъпка от OCR wizard-а
- Loyalty points на confirmation screen — трети емоционален слой след облекчение и удовлетворение

**Confirmation screen структура:**
1. ✅ "Готово, полицата е ваша!" — облекчение
2. 📋 Резюме на покритието — удовлетворение
3. ⭐ "Спечелихте 12 точки (1.20 BGN)" — micro-delight

**Adopt от BG конкурентите:**
- Ценова прозрачност и сравнителна структура на офертите
- Лога на познати застрахователи за изграждане на доверие

**Adapt за Branivo:**
- Lemonade chatbot → наш OCR wizard (3 снимки вместо въпроси)
- Boleron сравнение → наше сравнение + `is_recommended` с динамично "защо"
- Amarant модерен дизайн → наш design + 100% tenant branding отгоре

**White-label design система като barrier to entry:**
Не е theming — е пълна design система: tenant анимации, font пакети, copy tone per брокер,
onboarding flows. Месеци за изграждане, невъзможна за копиране за 3-6 месеца от конкурент.

**Avoid изцяло:**
- Всякакъв flow изискващ регистрация преди оферти
- Desktop-first layout decisions
- Generic платформен бранд видим за крайния клиент

---

## Design System Foundation

### Design System Choice

| Платформа | Система | Подход |
|-----------|---------|--------|
| **Flutter (mobile app)** | Material 3 (`flutter_material`) | Пълна theme customization per tenant чрез `ThemeData` |
| **Next.js (web/PWA)** | Tailwind CSS + shadcn/ui | Headless компоненти, 100% стилизируеми, без imposed visual identity |

### Rationale for Selection

- **White-label изискване:** И двете системи позволяват пълна визуална кастомизация per тенант — цветове, шрифтове, радиус, elevation — без да се налага да пишем компоненти от нулата
- **Скорост на разработка:** Proven компоненти с built-in accessibility; екипът се фокусира върху бизнес логиката, не върху бутони и input полета
- **Tenant theming:** Flutter `ThemeData` + CSS variables в Tailwind позволяват runtime theme switching per тенант от единна конфигурация
- **Общност и поддръжка:** Material 3 и shadcn/ui имат активни общности, добра документация и редовни updates

### Implementation Approach

**Flutter — Design Tokens per Tenant:**
```
TenantTheme {
  primaryColor, secondaryColor,
  fontFamily, borderRadius,
  logoUrl, splashImageUrl
}
→ ThemeData.from(colorScheme: ...) при app init
```

**Next.js — CSS Variables per Tenant:**
```
:root {
  --primary: {tenant.primaryColor};
  --font-sans: {tenant.fontFamily};
  --radius: {tenant.borderRadius};
}
→ Injected from middleware via Host header
```

### Customization Strategy

- **Level 1 — Tokens (задължително за всеки тенант):** Primary/secondary цветове, лого, шрифт
- **Level 2 — Components (опционално):** Кастомни анимации, splash screen, onboarding imagery
- **Level 3 — Flows (Enterprise):** Различен onboarding flow, custom home screen layout
- **Invariant:** Компонентната библиотека е обща — само визуалните tokens се менят. Никога не дублираме компоненти per тенант.

---

## 2. Core User Experience

### 2.1 Defining Experience

**"Снимаш талона, получаваш оферти"**

Определящото изживяване на Branivo: потребителят снима талона на
колата (3 зуумирани секции) → системата разпознава МПС-то автоматично →
оферти от множество застрахователи се появяват в < 30 секунди,
без ръчно въвеждане, без регистрация.

Метафора за потребителя: "Като сканиране на QR код" — познато
действие, нулево обяснение нужно.

### 2.2 User Mental Model

**Текущо очакване (което чупим):** "Ще попълня много полета, ще
отнеме много време, ще трябва да се регистрирам."

**Новото очакване (което създаваме):** "Снимам → системата знае
всичко → избирам → плащам."

**Ключовото прекъсване на очакването** е "wow момента" —
именно там се печели word-of-mouth.

### 2.3 Success Criteria

| Критерий | Мярка |
|----------|-------|
| OCR разпознаване | < 10 сек от последната снимка |
| Оферти на екрана | < 30 сек от старта на scan |
| OCR fallback rate | < 10% от сесиите |
| Drop-off в OCR wizard | < 15% |
| "Wow момент" усещане | Потребителят вижда "Намерихме: [марка модел година]" |

### 2.4 Novel UX Patterns

**Нови patterns, нуждаещи се от обучение:**

1. **3-стъпков OCR wizard** — нов за BG застраховки:
   - Guidance overlay при първа употреба: frame guide per секция
   - Live camera preview с правоъгълна рамка "Наредете талона в рамката"
   - Progressive reveal: след всяка снимка показваме разпознатото
   - При повторна употреба — guidance изчезва (experienced user flow)

2. **Anonymous-first quote** — нов за BG пазара:
   - Без registration prompt преди оферти
   - Micro-registration inline при "Купи" — потребителят не трябва
     да осъзнава, че се е регистрирал

### 2.5 Experience Mechanics

**3 зуумирани секции (не 2 далечни снимки):**

| Снимка | Секция | Ключови полета |
|--------|--------|----------------|
| 1 | Горна лява на Част 1 | Рег. номер, Марка, Модел, VIN (17 символа) |
| 2 | Горна дясна на Част 1 | Собственик, дата на първа регистрация |
| 3 | Част 2 (задна страна) | (G) двигател cm³, (J) категория, гориво, места |

**Обосновка:** 2 далечни снимки дават недостатъчна pixel density за
надежден OCR (< 0.85 confidence на критичните полета). 3 зуумирани
секции постигат confidence > 0.85 и fallback rate < 10%.

**Adaptive flow:**

```
1. INITIATION
   Голям CTA: "Сканирай талона" + иконка камера
   Hint: "3 снимки, 30 секунди"

2. INTERACTION
   Снимка 1 → frame guide "Горна лява секция" → capture
             → partial reveal: "Намерихме: [Марка Модел]"
   Снимка 2 → frame guide "Горна дясна секция" → capture
             → partial reveal: "Собственик: [Име]"
   Снимка 3 → frame guide "Задна страна" → capture
             → пълен резултат

3. FEEDBACK
   Success:  "Намерихме вашето МПС: [Марка Модел Година]"
             Tenant-branded анимация, зелена checkmark
   Partial:  Показваме попълненото + само непопълнените полета
   Failure:  "Помогни ни с няколко детайла" — 2-3 полета max

4. COMPLETION → ОФЕРТИ
   Animated transition към оферти screen
   < 30 сек от старта на scan
   is_recommended badge с динамично "защо"
```

---

## Visual Design Foundation

### Color System

**Platform Default Theme (Broker Dashboard + клиентски app baseline):**

| Token | Стойност | Употреба |
|-------|----------|----------|
| `primary` | `#6366F1` | CTA бутони, active states, links |
| `secondary` | `#0D9488` | Secondary actions, icons, highlights |
| `accent` | `#10B981` | Success states, checkmarks, "Готово" |
| `surface` | `#FAFAFA` | Background, карти |
| `text` | `#111827` | Body text, headings |
| `error` | `#EF4444` | Грешки, validation |
| `warning` | `#F59E0B` | Предупреждения, OCR low confidence |

**Tenant Override:** Тенантът замества `primary` и `secondary` с неговите цветове.
Останалите tokens остават непроменени. Индиго + тийл като базови са complementary
с повечето tenant палитри (синьо, червено, зелено) — без визуален конфликт.

**Диференциация:** Нито един основен BG застраховател не използва индиго —
визуалното разграничение е умишлено и стратегическо.

### Typography System

**Primary font:** Inter (Google Fonts — отлична Кирилица, безплатен)
**Fallback:** system-ui, -apple-system, sans-serif

| Scale | Size | Weight | Употреба |
|-------|------|--------|----------|
| Display | 32px | 700 | OCR success "Намерихме вашето МПС!" |
| H1 | 24px | 700 | Screen titles |
| H2 | 20px | 600 | Section headers |
| H3 | 17px | 600 | Card titles |
| Body | 16px | 400 | Основен текст (**минимум 16px — accessibility**) |
| Small | 14px | 400 | Secondary info, metadata |
| Caption | 12px | 400 | Regulatory layer, legal text |

### Spacing & Layout Foundation

**Base unit:** 8px (Material 3 + Tailwind стандарт)

| Token | Стойност | Употреба |
|-------|----------|----------|
| `space-1` | 8px | Вътре в компоненти |
| `space-2` | 16px | Между елементи |
| `space-3` | 24px | Секции |
| `space-4` | 32px | Между карти |
| `space-6` | 48px | Главни секции |

**Layout:** Mobile-first, single column (< 768px).
Максимална ширина на съдържанието: 480px центрирано.
Bottom navigation bar за primary actions на мобилен.
**Border radius:** 12px за карти, 8px за бутони, 6px за inputs.

### Accessibility Considerations

- Минимален body font size: **16px** (за Радка и всички 60+ потребители)
- Контраст ratio: минимум **4.5:1** за body text (WCAG AA)
- Touch targets: минимум **48×48px** за всички интерактивни елементи
- Inter шрифтът има отлична Кирилица поддръжка на всички размери
- `warning` (#F59E0B) за OCR low confidence полета — визуален сигнал без error

---

## Design Direction Decision

### Design Directions Explored

6 екранни направления са разработени и визуализирани в `ux-design-directions.html`:

| # | Екран | Ключова демонстрация |
|---|-------|---------------------|
| 1 | Client Home | Clean minimal, OCR като главен CTA, bottom navigation |
| 2 | OCR Wizard | Dark mode, frame guide, progress steps, partial reveal |
| 3 | Оферти | `is_recommended` с динамично "защо", Value Justification |
| 4 | Confirmation | 3 емоционални слоя — checkmark + покритие резюме + loyalty |
| 5 | Broker Dashboard | MRR prominent, live sales notifications, KPI grid |
| 6 | Renewal (Стоян) | Dark mode, Push → Face ID → Pay flow |

### Chosen Direction

**Unified direction** — всички 6 екрана формират един кохерентен дизайн език:

- **Client app:** Light mode (surface #FAFAFA) с индиго primary CTA
- **OCR Wizard:** Dark mode (#111827) за фокус върху камерата
- **Broker Dashboard:** Light mode с индиго header и prominent MRR
- **Renewal:** Dark mode за нощни/push notification контексти

### Design Rationale

- **Dark mode за OCR wizard:** Камерата се вижда по-добре на тъмен background; намалява distraction
- **Light mode за оферти и confirmation:** Финансова информация се чете по-лесно на светъл background
- **Индиго primary навсякъде:** Визуална нишка свързва всички екрани независимо от light/dark mode
- **Bottom navigation:** Стандарт за мобилни apps; thumb-friendly за едноръко ползване

### Implementation Approach

- Flutter: `ThemeData.light()` и `ThemeData.dark()` — switching per screen context
- Tenant замества само `primary` и `secondary` tokens; light/dark логиката остава
- HTML showcase (`ux-design-directions.html`) служи като living reference за developers

---

## User Journey Flows

### Error Messages (Platform-wide)

| Ситуация | Human Layer (видим) | Следваща стъпка |
|----------|---------------------|-----------------|
| Insurer API timeout | "Някои застрахователи не отговориха навреме. Показваме наличните оферти." | ⚠️ badge + "Опитай отново" след 30 сек |
| Stripe payment failure | "Плащането не мина. Провери картата и опитай отново — твоите данни са запазени." | Retry без да губим OCR данните (Redis TTL 48ч) |
| OCR complete failure | "Не успяхме да разчетем талона. Помогни ни с няколко детайла." | Само 4 задължителни полета: Рег. №, Марка/Модел, Година, VIN |
| OTP изтекъл | "Кодът е изтекъл. Изпрати нов." | Resend button, без error styling |
| Quote изтекъл (48ч) | "Офертата е изтекла. Сканирай отново — отнема само 30 секунди." | CTA към OCR wizard |
| ГФ / KAT недостъпни | "Не можем да проверим задълженията автоматично. Брокерът ще провери ръчно преди активация." | Прозрачност без паника |

**Tone правило:** "Какво се случи (без technical jargon)" + "Какво правим сега" + "Какво трябва да направиш ти"
Никога: "Error 422", "Session expired", "API unavailable"

---

### Journey 1 — Broker Onboarding (Мариян)

**Goal:** Брокерът активира собствен канал в < 1 час след регистрация.

```mermaid
flowchart TD
    A([Мариян открива Branivo]) --> B[Регистрация: имейл + парола + КФН номер]
    B --> C{КФН валидация}
    C -->|✓ Валиден| D[Stripe Connect onboarding]
    C -->|✗ Невалиден| E["Не намерихме КФН лиценз.\nСвържи се с нас."]
    D --> F[Качи лого + избери цветове]
    F --> G[Preview на брандирания app]
    G --> H{Одобряваш ли?}
    H -->|Да| I[Активация на тенант]
    H -->|Промени| F
    I --> J[Получава уникален домейн + QR код]
    J --> K([🎉 Live! < 1 час])
```

### Journey 2 — Нов клиент купува ГО (Николай)

**Goal:** Сканира талона → оферти → плаща за < 3 минути.

```mermaid
flowchart TD
    A([Николай отваря app]) --> B[Home screen — вижда Сканирай талона]
    B --> C[OCR Wizard — Снимка 1: горна лява]
    C --> D[Partial reveal: Намерихме Toyota Corolla 2019]
    D --> E[Снимка 2: горна дясна]
    E --> F[Снимка 3: задна страна]
    F --> G{OCR confidence?}
    G -->|≥ 0.85 всички| H[Пълен auto-fill → Оферти]
    G -->|Partial| I[Auto-fill + само low-confidence полета]
    I --> H
    H --> J[Паралелни insurer API calls]
    J --> K[Оферти screen — is_recommended с защо]
    K --> L[Николай избира оферта]
    L --> M[Купи → Silent Registration trigger]
    M --> N[Inline телефон поле]
    N --> O[OTP SMS]
    O --> P{OTP валиден?}
    P -->|✓| Q[Stripe PaymentSheet — Apple Pay]
    P -->|Изтекъл| R[Кодът е изтекъл. Изпрати нов.]
    R --> O
    Q --> S{Плащане}
    S -->|✓ succeeded| T[webhook: payment_intent.succeeded]
    S -->|✗ failed| U[Плащането не мина. Данните са запазени.]
    U --> Q
    T --> V[Policy активация + BullMQ PDF job]
    V --> W[Confirmation: ✓ + покритие + loyalty]
    W --> X([PDF + Green Card на имейл < 5 мин])
```

### Journey 3 — OCR Failure (Радка)

**Goal:** Graceful fallback без crash, без паника.

```mermaid
flowchart TD
    A([Радка отваря PWA]) --> B[Home — Сканирай талона]
    B --> C[Снимка 1 — размазана]
    C --> D{OCR confidence Снимка 1}
    D -->|< 0.85 на всички| E[Снимка 2]
    E --> F{OCR confidence Снимка 2}
    F -->|< 0.85 на всички| G[Снимка 3]
    G --> H{OCR confidence Снимка 3}
    H -->|Поне partial| I[Auto-fill частично + warning полета]
    H -->|Всички < 0.85| J[Не успяхме да разчетем. Помогни ни с няколко детайла.]
    I --> K[Само непопълнените полета — warning #F59E0B]
    J --> L[4 полета: Рег. №, Марка, Година, VIN]
    K --> M[Радка попълва липсващото]
    L --> M
    M --> N[Оферти screen — същият flow като Journey 2]
    N --> O([Покупка завършена])
```

### Journey 4 — Renewal (Стоян)

**Goal:** Push → Face ID → Pay за 12 секунди, нула ръчни полета.

```mermaid
flowchart TD
    A([D-7 Cron 09:00 EET]) --> B[Push notification: ГО изтича след 7 дни]
    B --> C([Стоян вижда push])
    C --> D[Отваря app — директно Renewal screen]
    D --> E[Показва: кола + застраховател + цена + валидност]
    E --> F[Face ID · Плати с Apple Pay]
    F --> G{Биометрика}
    G -->|✓| H[Stripe charge]
    G -->|✗| I[PIN fallback]
    I --> H
    H --> J{Плащане}
    J -->|✓| K[webhook → Policy renewal]
    J -->|✗| L[Плащането не мина. Провери картата.]
    L --> F
    K --> M[Confirmation: ✓ + нова валидност + loyalty]
    M --> N([Готово — 12 секунди])
```

### Journey 5 — Silent Registration

**Goal:** Micro-registration inline, потребителят не осъзнава регистрацията.

```mermaid
flowchart TD
    A([Клиент натиска Купи]) --> B{Логнат ли е?}
    B -->|Да| C[Директно към Stripe PaymentSheet]
    B -->|Не| D[Inline expand на purchase card]
    D --> E[Едно поле: телефонен номер]
    E --> F[SMS OTP — 6 цифри, TTL 5 мин]
    F --> G{OTP}
    G -->|✓| H[Акаунт създаден/намерен — прозрачно]
    G -->|Изтекъл| I[Кодът е изтекъл. Изпрати нов.]
    I --> F
    G -->|3x грешен| J[Lockout 15 мин — Опитай след малко.]
    H --> C
    C --> K([Плащане → Journey 2 продължава])
```

### Journey Patterns

**Navigation:**
- Back винаги е видим; never trap потребителя в стъпка
- Bottom nav скрит по време на OCR wizard и payment flow (фокус)

**Decision Points:**
- Maximum 2 избора на екран; никога повече от 3
- Default/препоръчан избор винаги предварително избран

**Feedback:**
- Progress indicator за всеки multi-step flow
- Success state винаги с позитивна анимация + tenant color
- Error state никога червен full-screen — само inline warning

### Flow Optimization Principles

1. **Zero dead ends** — всеки error има explicit следваща стъпка
2. **Data persistence** — OCR данни и quote избор в Redis 48ч; никога не губим прогреса
3. **Graceful degradation** — partial OCR > пълна форма; partial offers > no offers
4. **Invisible registration** — micro-reg е вграден в purchase flow, не прекъсва го

---

## Component Strategy

### Design System Components (без custom работа)

**Material 3 (Flutter) + shadcn/ui (Next.js) покриват:**
Бутони (primary/secondary/outlined), Text inputs + validation, Bottom navigation bar, Cards + списъци, Dialogs/modals, Progress indicators (linear/circular), Snackbars/toasts, Badges, Chips/tags.

### Custom Components

#### 1. OCR Camera Wizard
**Purpose:** 3-стъпков сканиращ wizard за разпознаване на талон
**Usage:** Journey 2, 3 — core experience, home screen CTA
**Anatomy:** Camera preview + frame guide overlay + progress steps + capture button + partial reveal area
**States:** `idle` → `capturing` → `processing` → `success` → `partial` → `failure`
**Variants:** Step 1 (горна лява) / Step 2 (горна дясна) / Step 3 (задна страна)
**Accessibility:** Voice feedback при capture; alto contrast frame guide
**Interaction:** Live preview с правоъгълна рамка → tap to capture → animated processing → reveal

#### 2. Offer Card
**Purpose:** Показва оферта от застраховател с pricing и is_recommended reasoning
**Usage:** Journey 2 — оферти screen
**Anatomy:** Insurer logo + name | Price | is_recommended badge + reason | Features chips | CTA button
**States:** `default` | `recommended` (indigo border) | `unavailable` (greyed, ⚠️)
**Variants:** Compact (list) / Expanded (selected)
**Accessibility:** Screen reader: "ДЗИ, 189 лева годишно, препоръчано: най-бързо изплащане"
**Content:** is_recommended reason — max 1 изречение, динамично от winning attributes

#### 3. Silent Registration Inline
**Purpose:** Micro-registration без да прекъсва purchase flow
**Usage:** Journey 5 — при натискане на "Купи" от анонимен потребител
**Anatomy:** Inline expand на offer card → phone field → OTP field → submit
**States:** `collapsed` → `phone_entry` → `otp_sent` → `otp_entry` → `verified`
**Accessibility:** Auto-focus на phone field при expand; OTP field auto-submit при 6 цифри
**Interaction:** Smooth expand animation (не modal, не redirect); OTP auto-paste от SMS

#### 4. Policy Card
**Purpose:** Показва активна полица в wallet/home screen
**Usage:** Home screen, My Policies screen
**Anatomy:** Vehicle icon + марка/модел | Тип (ГО) | Валидност | Status badge | Renewal CTA (ако < 30 дни)
**States:** `active` (green) | `expiring_soon` (amber, < 30 дни) | `expired` (red)
**Variants:** Compact (list) / Full (wallet view с PDF бутон)
**Accessibility:** Expiring soon — screen reader announcement при отваряне

#### 5. Confirmation Screen
**Purpose:** Три емоционални слоя след успешна покупка
**Usage:** Journey 2, 4 — след payment_intent.succeeded
**Anatomy:** (1) Hero checkmark + "Готово!" | (2) Coverage summary card | (3) Loyalty reward chip
**States:** `animating_in` → `static`
**Interaction:** Hero checkmark animate-in (scale + fade); coverage card slide-up; loyalty chip pulse
**Tenant:** Checkmark цвят = tenant primary; background gradient = tenant primary → secondary

#### 6. Broker MRR Widget
**Purpose:** Prominent MRR display с growth indicator — "майсторство и собственост"
**Usage:** Broker Dashboard — top card
**Anatomy:** Label "МЕСЕЧЕН ПРИХОД" | Large MRR number | Growth % vs минал месец | Mini sparkline
**States:** `positive_growth` (зелено) | `flat` (сиво) | `negative` (amber — не червено)
**Variants:** Full (dashboard) / Compact (widget)
**Interaction:** Tap → детайлна breakdown по период

#### 7. Renewal Quick Pay
**Purpose:** One-tap renewal с биометрика — нула ръчни полета
**Usage:** Journey 4 — renewal screen от push notification
**Anatomy:** Policy summary card | Price prominent | Face ID / Apple Pay CTA | "Напомни по-късно" link
**States:** `ready` | `authenticating` | `processing` | `success`
**Interaction:** Full-screen takeover при отваряне от push; биометрика CTA е primary и dominant

### Component Implementation Strategy

- Всички custom компоненти използват design tokens — никакви hardcoded цветове
- Tenant theme се инжектира отвън; компонентите са theme-agnostic
- Flutter: всеки custom компонент е отделен `Widget` в `lib/shared/widgets/`
- Next.js: всеки custom компонент е в `components/ui/` с Tailwind + CSS variables

### Implementation Roadmap

**Phase 1 — MVP Critical (Journey 2 + 3 + 5):**
1. OCR Camera Wizard — без него няма product
2. Offer Card — без него няма conversion
3. Silent Registration Inline — без него губим 30-40% при "Купи"
4. Confirmation Screen — без него няма emotional payoff

**Phase 2 — Retention (Journey 4):**
5. Policy Card — wallet experience
6. Renewal Quick Pay — Стоян flow

**Phase 3 — B2B (Journey 1):**
7. Broker MRR Widget — dashboard experience

---

## UX Consistency Patterns

### Button Hierarchy

| Ниво | Употреба | Стил | Пример |
|------|----------|------|--------|
| **Primary** | Главното действие на екран | Filled indigo, 48px height | "Сканирай талона", "Купи", "Плати" |
| **Secondary** | Алтернативно действие | Outlined indigo, 48px height | "Избери", "Виж детайли" |
| **Tertiary** | Деструктивно / dismissive | Text only, no background | "Напомни по-късно", "Пропусни" |
| **Danger** | Необратими действия | Filled red — само след confirmation dialog | "Откажи полица" |

**Правила:** Максимум 1 Primary бутон на екран. Primary CTA винаги в долната част (thumb zone). Minimum touch target: 48×48px.

### Feedback Patterns

**Success:** Голяма зелена анимация (scale-in checkmark) + tenant primary color. Toast "Готово!" — 3 сек. Никога modal за success.

**Error (inline):** Червен текст под засегнатото поле. Иконка ⚠️ + human message. Field остава попълнен.

**Warning:** Amber (#F59E0B) border на засегнатите полета. Снекбар не се auto-dismiss. Употреба: OCR low confidence, KAT/ГФ недостъпни.

**Loading:**
- Skeleton screens за списъци (не spinner)
- **Progressive offer reveal** — офертите се появяват с `Promise.allSettled()`: skeleton → first offer animate-in → second → ... → last. Изгражда очакване, прави < 30 сек да изглежда по-бързо.
- Spinner само за действия < 3 сек
- Branded text за OCR processing: "Разчитаме талона..."

### Form Patterns

**Validation:**
- **On blur** — за всички стандартни полета (не on keystroke)
- **Auto-submit** — OTP: auto-submit при 6-та цифра, без blur/бутон
- **Real-time** — VIN: character count в реално време (от 17 символа)

**Input types:**
- Телефон: `+359` prefix fixed, числово keyboard, auto-format
- OTP: 6 отделни box-а, auto-advance, auto-paste от SMS
- VIN: capitals only, 17 chars, real-time length indicator
- Рег. номер: uppercase, BG формат hint

**Auto-fill:** OCR резултати auto-fill с subtle indigo highlight flash. Low confidence полета: amber border + placeholder "Провери".

**OCR Partial Results:** Bottom sheet (`DraggableScrollableSheet`) върху camera резултата — потребителят вижда контекста отзад, коригира отпред.

### Navigation Patterns

**Bottom Navigation:** 4 таба: Начало / Полици / Чат / Профил. Скрит при OCR wizard, payment flow, confirmation screen.

**Back Navigation:** Винаги видим. При destructive back (от payment): confirmation dialog. Deep link от push → директно към target screen.

**App State:** При foreground от push → restore exact screen. При background > 30 мин → refresh данни, запази navigation position.

### Empty States

**Клиент — без полици:** "Нямаш активни полици" + "Сканирай талона" CTA.

**Broker — без клиенти (Share Screen):**
- QR код (голям, centrен) — статичен PNG от tenant domain, генериран при активация
- [WhatsApp] [Копирай линк] — secondary actions
- Native OS share sheet (`flutter_share`)
- При първа продажба → micro-celebration: "🎉 Първа продажба! [Клиент] купи ГО за [МПС]."

Никога "Няма данни" без next step CTA.

### Modal & Overlay Patterns

**Използва се modal:** Confirmation за деструктивни действия. Legal text ("Виж пълните условия").

**НЕ се използва modal:** Registration (→ inline), Error messages (→ inline), Success (→ full screen/toast), Loading (→ skeleton), OCR partial results (→ bottom sheet).

**Bottom sheets:** Preferred над modals за мобилен — natural thumb gesture за dismiss.

---

## Responsive Design & Accessibility

### Responsive Strategy

**Философия: App-first, Web-parity**

Branivo съществува в два канала — Flutter native app и Next.js PWA. Responsive стратегията не е "как да накараме desktop сайт да работи на мобилно", а "как да доставим app-качество в браузър, и как да използваме по-голям екран когато е наличен".

**Flutter (native app):**
Таргетираме 360–428px ширина (Android flagship + iPhone Pro range). Material 3 adaptive layouts се активират автоматично. Tablet (≥ 600dp) използва `NavigationRail` вместо `BottomNavigationBar`. OCR wizard е вертикален на телефон, хоризонтален split (preview 60% / форма 40%) на таблет — при confidence < 0.85 на tablet: автоматичен overlay "Приближи камерата" (гласово TalkBack/VoiceOver + визуален hint), за да не паникосва Радка пред мъгляво preview.

**Next.js PWA:**
Mobile-first CSS. Quote flow, confirmation, policy wallet — идентични с Flutter по функция, адаптирани за touch + Add to Home Screen (A2HS). Desktop Broker Dashboard е отделен layout — sidebar navigation + data-dense tables.

**Стратегия по тип потребител:**

| Канал | Primary device | Secondary | Стратегия |
|-------|---------------|-----------|-----------|
| Краен клиент | Телефон (Flutter) | Таблет (web PWA) | App-first; web = fallback за Радка |
| Брокер | Desktop (web dashboard) | Телефон (Flutter) | Dashboard: max data density; mobile: key actions only |

---

### Breakpoint Strategy

| Breakpoint | Range | Layout | Navigation |
|-----------|-------|--------|------------|
| **Mobile S** | 320–374px | Single-column, 16px margins | Bottom nav (4 items) |
| **Mobile** | 375–767px | Single-column, 20px margins | Bottom nav (4 items) |
| **Tablet** | 768–1023px | Single/Two-column хибрид | NavigationRail (Flutter) / Side tabs (PWA) |
| **Desktop** | 1024–1439px | Multi-column, sidebar | Left sidebar, content area + right panel |
| **Desktop L** | 1440px+ | Max-width 1280px, centered | Same as Desktop |

**Критични breakpoint решения:**

**OCR Wizard:** Вертикален stack < 768px (full-screen camera → form overlay). Split view ≥ 768px (камера вляво 60% / форма вдясно 40%). При tablet + confidence < 0.85: overlay hint преди split.

**Offers Screen:** Single card stack < 768px (swipeable). Grid 2-up ≥ 768px. Grid 3-up ≥ 1024px. Offer cards използват `minHeight` (не fixed height) — при text scale factor > 1.3 картата расте вертикално, не overflow-ва.

**Broker Dashboard:** Скрит на < 768px — мобилните брокери ползват Flutter app с опростен изглед (само today's sales + quick actions). Full dashboard ≥ 768px.

**Flutter Material 3 Breakpoints (dp):**
- Compact: 0–599dp → BottomNavigationBar
- Medium: 600–839dp → NavigationRail
- Expanded: 840dp+ → NavigationDrawer (за Dashboard only)

---

### Accessibility Strategy

**Target: WCAG 2.1 Level AA** — industry standard, законово препоръчителен за финансови услуги.

Радка (62г.) е нашият accessibility baseline: ако тя може да завърши OCR flow без помощ, всеки може.

**Цветове и контраст:**

| Елемент | Foreground | Background | Ratio | AA? |
|---------|-----------|-----------|-------|-----|
| Body text | #111827 | #FFFFFF | 16.1:1 | ✅ |
| Indigo CTA | #FFFFFF | #6366F1 | 5.7:1 | ✅ |
| Teal accent | #FFFFFF | #0D9488 | 5.1:1 | ✅ |
| Placeholder text | #9CA3AF | #FFFFFF | 2.9:1 | ⚠️ decorative only |
| Error text | #DC2626 | #FFFFFF | 5.8:1 | ✅ |
| Amber warning | #92400E | #FEF3C7 | 7.2:1 | ✅ |

Placeholder е декоративен — никога не носи единствен informational content. **ПРАВИЛО:** `<input placeholder="Рег. номер" />` е ЗАБРАНЕНО без видим `<label>` или `aria-label`. Задължителен visible label за всеки input.

**Typography:**

| Контекст | Min Size | Target Size |
|----------|---------|-------------|
| Body (всички) | 16px / 1rem | 16–18px |
| Labels, hints | 14px | 14px |
| Legal text (collapsed) | **14px** | 14px (expand за четене) |
| Legal text (expanded) | 14px | 16px |
| CTA buttons | 16px medium | 16px semibold |
| Heading H1 | 24px | 28–32px |

**Touch Targets:** Minimum 48×48px (Android Material) / 44×44pt (iOS HIG). Всички бутони, иконки, ссилки — спазват.

**Специфични Branivo accessibility requirements:**

1. **OCR Wizard:** `Semantics()` widget за всяка камера стъпка с ясна инструкция. При VoiceOver/TalkBack: spoken guidance "Насочи камерата към горния ляв ъгъл на талона." При tablet + confidence < 0.85: overlay hint се анонсира като `liveRegion`.

2. **OTP полета:** 6 отделни input box-а → `autofillHints: [AutofillHints.oneTimeCode]`. SMS auto-fill работи нативно на iOS/Android.

3. **Offer cards:** Screen reader чете: "[Застраховател] — [Цена] лева годишно. [Ако е recommended: Препоръчан — причина]." Cards използват `minHeight` + `LayoutBuilder` за extreme text scaling (1.5x, 2.0x) — текстът не overflow-ва.

4. **Progress indicators:** Всеки step в OCR wizard → `Semantics(label: 'Стъпка 1 от 3')`.

5. **Error messages:** Всяка грешка → `aria-live: assertive` (Next.js) / Flutter `Semantics(liveRegion: true)`.

6. **Two-layer legal text:** Минимум 14px дори в collapsed вид. "Виж условията" expand — `Semantics(button: true, label: 'Разгъни пълните условия')`.

7. **Dynamic type support:** Flutter — `MediaQuery.textScaleFactor` respect (не override). При scale > 1.3 → `LayoutBuilder` + `FittedBox` като fallback за Offer Card и OCR wizard steps. При scale > 1.5 → layout adjusts вертикално, не truncate.

8. **Reduced motion:** `MediaQuery.disableAnimations` → OCR progress animation → simple color change вместо lottie. Offer reveal → instant показване без stagger.

---

### Testing Strategy

**Responsive Testing:**

| Test | Устройства | Инструмент |
|------|-----------|-----------|
| Flutter golden tests | Pixel 6, iPhone 15, iPad Air | `flutter_test` + `golden_toolkit` |
| Flutter golden tests (text scale) | textScaleFactor 1.0, 1.5, 2.0 | `flutter_test` — в CI pipeline |
| PWA responsive | Chrome DevTools device emulation | Playwright |
| Real device | 3 физически устройства (Android entry, iPhone Pro, таблет) | Manual — prelaunch sanity |
| Network throttling | 3G simulation за quote flow | Chrome DevTools |

**Accessibility Testing:**

| Test | Инструмент | Приоритет |
|------|-----------|----------|
| Automated a11y audit | `axe-core` в Playwright suite | P1 — CI pipeline gate |
| Flutter a11y | `flutter_test` Semantics assertions | P1 — unit tests |
| Color contrast | Colour Contrast Analyser / Stark | P1 — design review |
| VoiceOver (iOS) | Manual — iPhone + iPad | P1 — prelaunch |
| TalkBack (Android) | Manual — Pixel device | P1 — prelaunch |
| Screen reader (web) | NVDA + Chrome | P2 — prelaunch |
| Keyboard navigation | Manual + Playwright keyboard events | P1 — web Dashboard |
| Color blindness | Sim Daltonism / Chrome DevTools | P2 — design review |

**CI Gate:** `axe-core` violations → build fail за level AA issues. Flutter golden tests с textScaleFactor 1.5x и 2.0x → задължителни в CI.

**Prelaunch Accessibility Day:** 1 ден dedicated a11y testing преди Phase 1 launch. Checklist: VoiceOver (iOS) + TalkBack (Android) + keyboard navigation на Dashboard + OCR wizard end-to-end с screen reader.

---

### Implementation Guidelines

**Flutter:**

```dart
// Breakpoint helper — използвай навсякъде, не hardcode размери
extension ScreenType on BuildContext {
  bool get isMobile => MediaQuery.of(this).size.width < 600;
  bool get isTablet => MediaQuery.of(this).size.width >= 600
                    && MediaQuery.of(this).size.width < 840;
  bool get isDesktop => MediaQuery.of(this).size.width >= 840;
}

// Touch target wrapper — задължителен за всички иконки
SizedBox(
  width: 48, height: 48,
  child: IconButton(icon: ..., onPressed: ...),
)

// Offer Card с dynamic text scaling
LayoutBuilder(
  builder: (context, constraints) {
    final scale = MediaQuery.of(context).textScaleFactor;
    return ConstrainedBox(
      constraints: BoxConstraints(
        minHeight: scale > 1.3 ? 180 : 140, // grows with text
      ),
      child: OfferCardContent(...),
    );
  },
)

// Semantic labeling — задължително за OCR wizard steps
Semantics(
  label: 'Стъпка ${step} от 3: ${stepName}',
  child: OcrStepIndicator(...),
)

// Respect dynamic type — НИКОГА не фиксирай textScaleFactor
Text(label, style: Theme.of(context).textTheme.bodyLarge)
// ЗАБРАНЕНО: Text(label, style: TextStyle(fontSize: 16))
```

**Next.js / Tailwind:**

```css
/* Mobile-first breakpoints */
/* Default: mobile (<768px) | md: tablet (768px) | lg: desktop (1024px) */

/* Offer grid */
.offer-grid {
  @apply grid grid-cols-1 gap-4;
  @apply md:grid-cols-2;
  @apply lg:grid-cols-3;
}

/* Touch targets — задължителни */
.btn, a, [role="button"] {
  @apply min-h-[48px] min-w-[48px];
}
```

**Accessibility checklist за всеки нов компонент:**
1. ☐ Semantic HTML tag (не `<div>` за interactive елементи)
2. ☐ Visible `<label>` или `aria-label` за всеки input — **placeholder не е достатъчен**
3. ☐ `role` + `aria-expanded` за accordion/collapsible (legal text, FAQ)
4. ☐ `aria-live="assertive"` за error messages и OCR confidence warnings
5. ☐ Focus indicator видим (не `outline: none` без замяна)
6. ☐ Keyboard navigable (Tab order = visual order)
7. ☐ Contrast ratio ≥ 4.5:1 проверен с инструмент
8. ☐ Минимален font size 14px (16px за body) — legal text 14px дори collapsed
9. ☐ Touch target ≥ 48×48px
10. ☐ Flutter: `Semantics()` wrapper за всички custom widgets

---

## Phase 2 UX Flows

Този раздел документира UX flows за новите Phase 2 модули (Epics 13–21). Всички flows следват съществуващите design principles: app-first, white-label illusion, offline-first където е приложимо, WCAG 2.1 AA.

---

### Flow 1: Каско Questionnaire (Epic 13)

**Trigger:** Клиентът избира "Каско застраховка" от главното меню (видимо само при `features.casco = true`).

**Screen: Каско въпросник**

```
┌─────────────────────────────────────┐
│  [←]  Каско застраховка            │
│  [tenant logo]                      │
├─────────────────────────────────────┤
│  Toyota Corolla · EK1234AB          │  ← auto-filled от vehicle
│  [Промени МПС]                      │
├─────────────────────────────────────┤
│  Пазарна стойност на МПС            │
│  ──●──────────────── 18 500 лв.    │  ← slider + ръчно въвеждане
│  [< 5 000]              [> 100 000] │
├─────────────────────────────────────┤
│  Клаузи (изберете всички приложими) │
│  ☑ Пълно Каско                     │
│  ☐ Частично Каско                  │
│  ☑ Кражба                          │
│  ☐ Стъкла                          │
├─────────────────────────────────────┤
│  Паркиране                          │
│  ○ Гараж  ● Охраняем  ○ Улица      │
├─────────────────────────────────────┤
│  Алармена система   [Да]  [Не]     │
│  Брой водачи        [1]  [2]  [3+] │
├─────────────────────────────────────┤
│  [Виж оферти →]                    │
└─────────────────────────────────────┘
```

**UX правила:**
- МПС данни (марка, модел, рег. номер) се зареждат **автоматично** — клиентът не въвежда отново
- Slider стойност < 1 000 лв. или > 500 000 лв. → inline error, бутонът е disabled
- Минимум 1 клауза задължителна — иначе бутонът е disabled с tooltip "Изберете поне 1 клауза"
- Анонимните данни от questionnaire се съхраняват в сесията — мигрират при регистрация (същия pattern като OCR данните)

**Каско Quote List — разлики от ГО:**
- Карта показва **покрити клаузи** като chips под цената
- `is_recommended` badge с tooltip: "Най-добър баланс цена/покритие"
- Без "Стикер" секция в confirmation screen

---

### Flow 2: Разширени методи на плащане (Epic 14)

**Apple Pay / Google Pay:**

```
┌─────────────────────────────────────┐
│  Плащане                            │
│                                     │
│  [   Pay  ]  ← Apple Pay / Google Pay
│                (native OS button,   │
│                само ако device      │
│                го поддържа)         │
│  ─────── или ───────               │
│  [Плати с карта]                   │
│                                     │
│  [Borica]  ← само ако features.borica│
└─────────────────────────────────────┘
```

**UX правила:**
- Apple Pay / Google Pay бутони се показват **само** ако устройството ги поддържа (Stripe auto-detection) — без manual detection код
- При Apple Pay: нативен Apple Pay sheet се отваря от OS — UX е изцяло на Apple, не на платформата
- При Borica: redirect към hosted Borica page → след завършване → redirect обратно с резултат
- **Graceful degradation:** При неподдържащо устройство — само card form, без error message за "липсващи" методи
- Payment method selection се запомня per session (не per user — privacy)

---

### Flow 3: Биометричен и социален вход (Epic 15)

**Биометричен вход — Flutter:**

```
App launch:
┌─────────────────────────────────────┐
│  [tenant logo]                      │
│                                     │
│  Добре дошли, Стоян 👋             │
│                                     │
│       [  Face ID  ]                │  ← native iOS prompt
│                                     │
│  [Влезте с SMS код]                │  ← fallback, always visible
└─────────────────────────────────────┘
```

**Активиране при първи login:**
```
┌─────────────────────────────────────┐
│  Бързо влизане с Face ID?          │
│                                     │
│  Влизайте само с Face ID при       │
│  следващи посещения.                │
│                                     │
│  [Активирай]    [Не сега]          │
└─────────────────────────────────────┘
```

**UX правила:**
- Биометричен prompt се показва **само** ако биометрията е активирана от клиента (не при първо отваряне)
- 3 неуспешни биометрични опита → автоматичен fallback към SMS OTP (без допълнителен клик)
- Биометрията се деактивира автоматично ако потребителят я изключи в device settings → при следващо отваряне → SMS OTP без грешка
- "Не сега" запомня избора за 30 дни — не пита отново (avoid prompt fatigue)

**Социален вход — Registration screen:**
```
┌─────────────────────────────────────┐
│  Регистрация                        │
│                                     │
│  [G]  Продължи с Google            │
│  [🍎] Продължи с Apple             │  ← задължително за iOS App Store
│                                     │
│  ─────── или ───────               │
│  [+359 ___] [Въведи телефон]      │
└─────────────────────────────────────┘
```

**UX правила:**
- Sign in with Apple е задължителен за iOS (Apple Guideline 4.8) — **не може да се изключи**
- При "Hide My Email" Apple — UI показва само "Apple акаунт" без имейл
- При OAuth success: ако телефонен номер не е верифициран → следва phone verification step (required за КФН)

---

### Flow 4: ПТП Wizard — After-Service (Epic 20)

**Entry points:** Bottom nav "Помощ" tab → "При ПТП"; или бърз достъп от active policy card.

**Wizard screen (офлайн-first):**

```
┌─────────────────────────────────────┐
│  [←]  При пътен инцидент          │
│  Стъпка 2 от 7  ██████░░░░░       │
├─────────────────────────────────────┤
│                                     │
│  🔺  Сигнализирайте с              │
│       триъгълник                   │
│                                     │
│  Поставете аварийния триъгълник    │
│  на минимум 50м зад автомобила     │
│  при скорост до 90 км/ч.           │
│                                     │
│  При магистрала: минимум 100м.     │
│                                     │
├─────────────────────────────────────┤
│   [← Назад]          [Напред →]   │
└─────────────────────────────────────┘
```

**UX правила:**
- Wizard е достъпен **без интернет** — съдържанието е pre-cached (Hive / Service Worker)
- Progress bar показва текущата стъпка — не може да се "пропуска" напред (линеен flow)
- Стъпка с телефонен номер (напр. 112): tap → директно обаждане (tel: deep link)
- Стъпка 6 (ДКП): deep link към DKP wizard (Epic 10) ако е имплементиран, иначе описателен текст
- **Шрифт:** минимум 18px за body text в wizard — четимост при стрес ситуация

**Emergency Contacts screen:**

```
┌─────────────────────────────────────┐
│  Спешни контакти                   │
├─────────────────────────────────────┤
│  🚨 Спешна помощ                   │
│     112  [Обади се]                │
│                                     │
│  🚗 КАТ                            │
│     166  [Обади се]                │
├─────────────────────────────────────┤
│  ДЗИ · Активна полица              │
│  📞 0700 16 116  [Обади се]        │
│  📧 claims@dzi.bg                  │
│                                     │
│  🛣️  Пътна помощ (ДЗИ)            │
│     0700 10 010  [Обади се]        │
└─────────────────────────────────────┘
```

**UX правила:**
- Контактите за застрахователя се зареждат от **активната полица** (auto-detected)
- При множество активни полици (ГО + Каско) → expandable cards per застраховател
- **Офлайн достъп:** последно кешираните контакти (Hive TTL 7 дни) — date badge показва "Актуализирано преди X дни"

---

### Flow 5: BI Analytics Dashboard (Epic 19)

**Entry point:** Broker Dashboard → "Анализи" tab (само за Broker Admin и Agent с `can_view_analytics` permission).

**Sales Funnel Dashboard:**

```
┌─────────────────────────────────────┐
│  Анализи                           │
│  [7 дни] [30 дни] [3 мес] [Custom]│  ← period picker
├─────────────────────────────────────┤
│  Общ приход         Конверсия       │
│  12 450 лв.         18.4%          │
│  ↑ +8% vs миналия период           │
├─────────────────────────────────────┤
│  Оферти → Покупки                  │
│  ████████████░░░░  847 оферти      │
│  ██░░░░░░░░░░░░░░  156 покупки     │
├─────────────────────────────────────┤
│  По продукт:                       │
│  ГО  ████████████  128 полици      │
│  Каско  ████░░░░░░   28 полици      │
├─────────────────────────────────────┤
│  [Изтегли CSV]  [Изтегли Excel]   │
└─────────────────────────────────────┘
```

**UX правила:**
- Period picker е persistent — запомня се в localStorage между сесии
- Стрелки ↑↓ с % промяна спрямо предишния период — винаги видими
- Export бутоните са disabled ако данните се зареждат (loading state)
- Dashboard зарежда в **< 3 секунди** (NFR6) — skeleton loading state за всеки chart

**Retention tab:**

```
┌─────────────────────────────────────┐
│  Retention                          │
│                                     │
│  Renewal rate          Churn risk   │
│  73.2%                 14 клиента  │
├─────────────────────────────────────┤
│  Клиенти с риск от churn:          │
│  Иван П. · ГО изтича 18.04        │
│  [Изпрати напомняне]               │
│                                     │
│  Мария С. · ГО изтича 22.04       │
│  [Изпрати напомняне]               │
└─────────────────────────────────────┘
```

---

### Flow 6: Referral & Loyalty (Epic 21)

**Referral screen:**

```
┌─────────────────────────────────────┐
│  Покани приятел                    │
│                                     │
│  Вземи 50 лв. отстъпка при         │
│  следващото ти подновяване!         │
├─────────────────────────────────────┤
│  branivo.bg/r/a1b2c3d4             │
│  [📋 Копирай]                      │
│                                     │
│  [WhatsApp]  [Viber]  [Имейл]     │
├─────────────────────────────────────┤
│  Твоите покани                     │
│  Изпратени: 5                      │
│  Регистрирани: 3                   │
│  Покупки: 1  ✓  Спечелени: 50 лв. │
└─────────────────────────────────────┘
```

**Loyalty points в checkout:**

```
┌─────────────────────────────────────┐
│  Плащане                            │
│                                     │
│  Сума: 245.00 лв.                  │
│                                     │
│  💎 Loyalty точки: 120 т. = 12 лв. │
│  [✓ Използвай точките]             │
│                                     │
│  Сума след отстъпка: 233.00 лв.   │
│                                     │
│  [   Pay  ]                        │
└─────────────────────────────────────┘
```

**UX правила:**
- Referral линкът е **копиран с един клик** — toast "Линкът е копиран" (2 сек)
- Share бутоните отварят native share sheet — не custom modal
- Loyalty balance се показва в **profile header** като постоянен индикатор (напр. "💎 120 т.")
- Loyalty toggle в checkout е pre-checked ако balance > 10 т. (configurable per tenant)
- При redemption: ясно показва старата цена (зачеркната) и новата цена

---

### Phase 2 UX — Accessibility Checklist Extensions

Добавя се към съществуващия Accessibility Checklist:

- [ ] Каско slider: `aria-label="Пазарна стойност"` + `aria-valuemin/max/now`
- [ ] Apple Pay / Google Pay бутони: `aria-label` с payment method name
- [ ] Биометричен prompt: `Semantics(label: "Влезте с Face ID")` в Flutter
- [ ] ПТП Wizard: `aria-live="polite"` за progress indicator при стъпка смяна
- [ ] Emergency contacts: `role="link"` за tel: href елементи
- [ ] Charts (BI Dashboard): `aria-label` с text summary на данните (напр. "18.4% конверсия за 30 дни")

---

## Onboarding Experience — Мобилно приложение

> **Ревизия:** 2026-03-25 — Нова секция, описва всички entry screens за Flutter app.
> **Принцип:** "Оферта преди акаунт." Потребителят достига до OCR scan преди регистрация.
> **Референс дизайн:** Dribbble Phone OTP Auth UI (light sage theme) + ux-login-flow-spec.md

---

### Design Language (Onboarding)

Onboarding screens използват **същата design система** като auth flow-а (вж. `ux-login-flow-spec.md`):

| Token | Hex | Употреба |
|-------|-----|---------|
| `kBgColor` | `#E0EAF0` | Фон на ВСИЧКИ onboarding екрани |
| `kDarkCard` | `#1A2D3A` | Heading текст, Dark info card |
| `kBlueMid` | `#3EA8E5` | Primary CTA, focus ring, accent |
| `kBlueLight` | `#6CC4F5` | Gradient start за бутони |
| `kFieldBg` | `#F5F8FC` | Input fill |
| White | `#FFFFFF` | Card surfaces, OTP boxes |

**Типография:**

| Роля | Size | Weight |
|------|------|--------|
| Hero heading | 36px | w800 |
| Screen heading | 32px | w800 |
| Subtitle | 15px | w400, opacity 55% |
| Caption / hint | 13px | w400, opacity 45% |
| Button | 16px | w700, letter-spacing 0.3 |

**Shared компоненти (от auth):**
- `_CircleButton` — 40×40px бял кръг, back navigation
- `_DarkInfoCard` — тъмна контекстна карта
- `_BranivoTextField` — fill input без outline
- `_GradientButton` — 56px height, gradient + glow shadow

---

### Екран 1: Splash Screen

**Файл:** `lib/features/onboarding/screens/splash_screen.dart`
**Trigger:** Студено стартиране на приложението
**Duration:** 1.8 сек → автоматичен redirect

#### Layout
```
Scaffold(backgroundColor: kBgColor)
└── Center
    └── Column(mainAxisAlignment: center)
        ├── AnimatedOpacity (duration: 600ms → opacity 0→1)
        │   └── TenantLogoWidget (max 160×80px, object-fit: contain)
        ├── SizedBox(16)
        └── AnimatedOpacity (delay: 400ms, duration: 500ms)
            └── Text(tenantName, style: heading32, color: kDarkCard)
```

#### Animation Sequence
```
0ms      → Черен/kBgColor фон
0–600ms  → Logo fade-in + subtle scale (0.85 → 1.0)
400–900ms → Tenant name fade-in
900–1600ms → Пауза (logo видим)
1600–1800ms → Fade-out целия екран (opacity 1→0)
1800ms   → Navigate → EntryGateScreen (или HomeScreen ако логнат)
```

#### Logic (Router Decision)
```dart
// Изпълнява се след анимацията
if (hasValidSession) {
  // Логнат потребител → директно към home
  router.replace('/home');
} else if (isFirstLaunch) {
  // Първо стартиране → value proposition slides
  router.replace('/onboarding/slides');
} else {
  // Познат потребител, но не логнат → entry gate
  router.replace('/onboarding/entry');
}
```

**White-label:** `TenantLogoWidget` зарежда лого от `tenantConfig.logoUrl`. Fallback = Branivo лого (никога не се показва на краен клиент в production бранд).

---

### Екран 2: Value Proposition Slides (само при първо стартиране)

**Файл:** `lib/features/onboarding/screens/onboarding_slides_screen.dart`
**Trigger:** `isFirstLaunch == true` (SharedPreferences flag)
**Брой слайдове:** 2 (не повече — "super елементарен")

#### Layout — обща структура
```
Scaffold(backgroundColor: kBgColor)
└── SafeArea
    └── Column
        ├── TopBar
        │   ├── [Spacer]
        │   └── TextButton "Пропусни" (tertiary, opacity 60%)
        ├── Expanded
        │   └── PageView (horizontal swipe)
        │       ├── _OnboardingSlide(index: 0)
        │       └── _OnboardingSlide(index: 1)
        └── BottomBar
            ├── DotsIndicator (2 dots, kBlueMid active, kBlueMid@30% inactive)
            ├── SizedBox(24)
            └── _GradientButton
                ├── [Slide 0] label: "Напред →"
                └── [Slide 1] label: "Започни →"
```

#### Slide 0: "30 секунди до оферта"
```
┌─────────────────────────────────────┐
│                       [Пропусни]    │
│                                     │
│   ┌───────────────────────────┐     │
│   │  🚗                       │     │  ← Illustrated card (kDarkCard bg)
│   │  [Scan frame animation]   │     │     120×120px illustration
│   │  Намерихме Toyota Corolla │     │
│   └───────────────────────────┘     │
│                                     │
│   Оферта за 30 секунди              │  ← Heading 32px w800 kDarkCard
│                                     │
│   Снимай талона на колата си и      │  ← Subtitle 15px opacity 55%
│   получи оферти от водещите         │
│   застрахователи веднага.           │
│                                     │
│           ● ○                       │  ← Dots
│   ┌─────────────────────────────┐   │
│   │         Напред →            │   │  ← GradientButton
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

#### Slide 1: "Плати с Face ID"
```
┌─────────────────────────────────────┐
│                       [Пропусни]    │
│                                     │
│   ┌───────────────────────────┐     │
│   │  🔒                       │     │
│   │  [Face ID icon + shield]  │     │
│   │  Сигурно и бързо          │     │
│   └───────────────────────────┘     │
│                                     │
│   Плати за секунди                  │
│                                     │
│   Apple Pay, Google Pay или карта.  │
│   Твоите данни са защитени.         │
│                                     │
│           ○ ●                       │
│   ┌─────────────────────────────┐   │
│   │          Започни →          │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**UX правила:**
- "Пропусни" е **винаги видим** — никога не трапваме потребителя
- Swipe gesture работи; бутонът е само помощен
- При натискане на "Започни" → Navigate → EntryGateScreen
- `SharedPreferences.setBool('onboarding_completed', true)` при излизане

---

### Екран 2.5: Quick Interest Selector (след слайдовете, само при първо стартиране)

**Файл:** `lib/features/onboarding/screens/interest_selector_screen.dart`
**Trigger:** Само при `isFirstLaunch == true`, след OnboardingSlides
**Goal:** 1 въпрос, 1 tap, auto-advance — разбираме фокуса на клиента без да го бавим

#### Принцип на дизайна

```
1 въпрос → visual cards → auto-advance след избор
```
Потребителят **не натиска "Напред"** — изборът е достатъчен. Максимална скорост.
Данните отиват в `UserInterest` state → персонализираме home screen CTA.

#### Layout
```
Scaffold(backgroundColor: kBgColor)
└── SafeArea
    └── Column
        ├── TopBar
        │   ├── _CircleButton (back → slides или skip)
        │   └── TextButton "Пропусни" → EntryGateScreen
        ├── SizedBox(32)
        ├── Padding(px: 24)
        │   ├── Text "Какво те интересува?" (heading 32px, kDarkCard)
        │   └── Text "Избери и ще намерим най-добрите оферти за теб."
        │            (subtitle 15px, opacity 55%)
        ├── SizedBox(32)
        └── Expanded
            └── Padding(px: 16)
                └── GridView.count(crossAxisCount: 2, spacing: 12)
                    ├── _InterestCard(type: InsuranceType.go)
                    ├── _InterestCard(type: InsuranceType.casco)
                    ├── _InterestCard(type: InsuranceType.travel)
                    └── _InterestCard(type: InsuranceType.property)
```

#### `_InterestCard` компонент
```
Container(
  decoration: BoxDecoration(
    color: isSelected ? kBlueMid.withAlpha(20) : Colors.white,
    borderRadius: 20px,
    border: isSelected
      ? Border.all(kBlueMid, 2.0)
      : Border.all(Colors.transparent, 2.0),
    boxShadow: soft shadow (y:4, blur:12, kDarkCard@8%),
  ),
  child: Padding(16)
    └── Column(crossAxisAlignment: start)
        ├── Container(48×48, decoration: CircleAvatar kBlueMid@15%)
        │   └── Icon(insuranceIcon, color: kBlueMid, size: 24)
        ├── SizedBox(12)
        ├── Text(label, 15px, w700, kDarkCard)
        └── Text(sublabel, 12px, opacity 45%)
```

#### Карти (4 опции)
| Тип | Икона | Label | Sublabel |
|-----|-------|-------|---------|
| ГО (задължителна) | `directions_car` | "Гражданска отг." | "За всяко МПС" |
| Каско | `car_crash` | "Каско" | "Пълно покритие" |
| Пътуване | `flight_takeoff` | "Пътуване" | "За чужбина" |
| Имущество | `home_outlined` | "Имущество" | "Дом и офис" |

**Поведение:**
- Tap → `isSelected = true` + `HapticFeedback.lightImpact()`
- **Auto-advance след 300ms** → animate out → EntryGateScreen
- Изборът се записва в `SharedPreferences('user_interest')` → персонализира Home screen CTA
- "Пропусни" записва `user_interest = 'go'` (default — най-честото) и навигира

#### Персонализация след избор

| Избор | Home Screen Primary CTA | _DarkInfoCard на Entry Gate |
|-------|-------------------------|-----------------------------|
| ГО | "Сканирай талона" | "ГО застраховка за минути" |
| Каско | "Вземи Каско оферта" | "Намери Каско покритие" |
| Пътуване | "Оферти за пътуване" | "Застраховай пътуването си" |
| Имущество | "Защити дома си" | "Имуществена застраховка" |

**Note:** Персонализацията е **tenant-feature-gated** — ако tenant не поддържа Каско/Travel/Property, тези карти не се показват. При само 1 тип → Interest Selector се пропуска изцяло.

---

### Екран 3: Entry Gate (Главен избор)

**Файл:** `lib/features/onboarding/screens/entry_gate_screen.dart`
**Принцип:** Максимум 3 действия. Anonymous scan е **доминиращото** — то е MVP.

#### Layout
```
Scaffold(backgroundColor: kBgColor)
└── SafeArea
    └── SingleChildScrollView (px: 24)
        ├── SizedBox(48)
        ├── TenantLogoWidget (centered, 120×60px)
        ├── SizedBox(32)
        ├── _DarkInfoCard
        │   icon: shield_outlined
        │   title: "Застрахователни оферти"
        │   subtitle: "Сравни и купи за минути"
        ├── SizedBox(40)
        │
        │   ─── PRIMARY ACTION ───────────────
        ├── _GradientButton (full width)
        │   label: "Сканирай без акаунт"
        │   icon: camera_alt_outlined (leading)
        │   onTap: → /scanner (anonymous mode)
        │
        ├── SizedBox(16)
        │
        │   ─── SECONDARY ──────────────────
        ├── OutlinedButton (full width, 56px, radius 16)
        │   style: border kBlueMid 1.5px, text kBlueMid
        │   label: "Влез в профила си"
        │   onTap: → /auth/login
        │
        ├── SizedBox(12)
        │
        │   ─── TERTIARY ────────────────────
        ├── TextButton (centered)
        │   label: "Нямаш акаунт? Регистрирай се"
        │   color: kDarkCard, opacity 55%
        │   onTap: → /auth/register
        │
        ├── SizedBox(32)
        └── Text("Продължавайки, приемаш условията ни.",
                 style: caption 13px, opacity 40%, centered)
```

#### Visual Hierarchy

```
Hero CTA   → "Сканирай без акаунт"  [gradient, glow, dominant]
Secondary  → "Влез в профила си"    [outlined, same width, subdued]
Tertiary   → "Регистрирай се"       [text only, smallest]
```

**Ключово решение:** Primary CTA е anonymous scan, НЕ login. Целта е клиентът да влезе в OCR flow преди всичко. Регистрацията се случва inline при "Купи" (Journey 5).

---

### Екран 4: Login

> Вж. пълна спецификация в `ux-login-flow-spec.md` — Раздел 2 (Екран: Login).
> Вж. имплементация в `lib/features/auth/screens/login_screen.dart` ✅

**Навигация от Entry Gate:** `OutlinedButton "Влез в профила си"` → `/auth/login`

**Допълнение към съществуващия spec:**

На Login screen, след формата, добави:
```
└── FormCard
    ├── _BranivoTextField "Имейл"
    ├── _BranivoTextField "Парола"
    ├── SizedBox(8)
    ├── Align(right) TextButton "Забравена парола?" → /auth/reset-password
    ├── SizedBox(16)
    └── _GradientButton "Влез"
```

---

### Екран 5: Reset Password (3-стъпков flow)

**Файл:** `lib/features/auth/screens/reset_password_screen.dart`
**Trigger:** TextButton "Забравена парола?" от Login screen

#### Стъпка 1 — Email Input
```
Scaffold(backgroundColor: kBgColor)
└── SafeArea
    └── SingleChildScrollView (px: 24, py: 32)
        ├── TopBar: _CircleButton (back → login)
        ├── SizedBox(40)
        ├── StepIndicator "Стъпка 1 от 3" (caption, opacity 55%)
        ├── SizedBox(8)
        ├── Text "Нулиране на парола" (heading 32px)
        ├── SizedBox(24)
        ├── _DarkInfoCard
        │   icon: email_outlined
        │   title: "Въведи имейл адрес"
        │   subtitle: "Ще изпратим 6-цифрен код за потвърждение"
        ├── SizedBox(24)
        └── FormCard (white, radius 20)
            ├── _BranivoTextField "Имейл адрес" (emailAddress keyboard)
            ├── SizedBox(24)
            └── _GradientButton "Изпрати код"
```

#### Стъпка 2 — OTP Verification
> Reuse на `_OtpBox` компонентите от `two_fa_screen.dart`

```
        ├── StepIndicator "Стъпка 2 от 3"
        ├── Text "Въведи кода"
        ├── _DarkInfoCard
        │   icon: mark_email_read_outlined
        │   title: "Кодът е изпратен"
        │   subtitle: "Провери имейл: {email} (TTL: 10 мин)"
        ├── SizedBox(32)
        ├── OtpBoxesRow (6× _OtpBox) — same as 2FA screen
        ├── HiddenTextField
        ├── SizedBox(16)
        ├── Center → TextButton "Изпрати нов код" (disabled ако < 60 сек)
        │   └── CountdownTimer ("Изпрати нов код след {N}с")
        ├── SizedBox(24)
        └── _GradientButton "Потвърди" (disabled ако < 6 цифри)
```

**State mapping:**
| State | UI |
|-------|----|
| `initial` | OTP boxes empty, button disabled |
| `loading` | Button spinner |
| `error` | Red banner "Невалиден или изтекъл код" |
| `success` | Navigate → Стъпка 3 |

#### Стъпка 3 — New Password
```
        ├── StepIndicator "Стъпка 3 от 3"
        ├── Text "Нова парола"
        ├── _DarkInfoCard
        │   icon: lock_reset_outlined
        │   title: "Въведи нова парола"
        │   subtitle: "Минимум 8 символа"
        └── FormCard
            ├── _BranivoTextField "Нова парола" (obscure + toggle)
            ├── SizedBox(12)
            ├── _BranivoTextField "Потвърди парола" (obscure + toggle)
            ├── SizedBox(8)
            ├── PasswordStrengthIndicator (4 dots: слаба/средна/добра/силна)
            ├── SizedBox(24)
            └── _GradientButton "Смени паролата"
```

**Password Strength Indicator:**
```dart
// Визуален индикатор — 4 сегмента
// 1 активен (red): < 8 chars
// 2 активни (amber): 8+ chars, само букви
// 3 активни (yellow-green): 8+ chars + цифра
// 4 активни (kBlueMid): 8+ chars + цифра + специален символ
```

**Success → Navigate:** `pushReplacementNamed('/auth/login')` + SnackBar "Паролата е сменена успешно. Влез с новата парола."

---

### Екран 6: Register

**Файл:** `lib/features/auth/screens/register_screen.dart`
**Trigger:** TextButton "Регистрирай се" от Entry Gate

#### Layout
```
Scaffold(backgroundColor: kBgColor)
└── SafeArea
    └── SingleChildScrollView (px: 24, py: 32)
        ├── TopBar
        │   ├── _CircleButton (back → entry gate)
        │   └── TextButton "Вход" → /auth/login
        ├── SizedBox(40)
        ├── Text "Създай акаунт" (heading 32px)
        ├── Text "Бърза регистрация в 2 стъпки" (subtitle 15px)
        ├── SizedBox(24)
        ├── _DarkInfoCard
        │   icon: person_add_outlined
        │   title: "Само основни данни"
        │   subtitle: "Пълният профил се допълва след покупка"
        ├── SizedBox(24)
        └── FormCard (white, radius 20)
            ├── _BranivoTextField "Имейл адрес"
            ├── SizedBox(12)
            ├── _BranivoTextField "Телефон" (+359 prefix fixed, numeric keyboard)
            ├── SizedBox(12)
            ├── _BranivoTextField "Парола" (obscure + toggle)
            ├── SizedBox(8)
            ├── PasswordStrengthIndicator
            ├── SizedBox(16)
            ├── Row
            │   ├── Checkbox (kBlueMid checked color)
            │   └── RichText
            │       ├── "Приемам " (opacity 55%)
            │       └── TextSpan "Условията за ползване" (kBlueMid, underline)
            │           └── onTap → legal modal
            ├── SizedBox(24)
            └── _GradientButton "Регистрирай се"
```

**State mapping:**
| State | UI |
|-------|----|
| `initial` | Form clean, button disabled (terms unchecked) |
| `loading` | Button spinner |
| `error_email_taken` | Inline: "Имейлът вече е регистриран. [Влез →]" |
| `error_weak_password` | PasswordStrengthIndicator pulse + inline text |
| `success` | → OTP Phone Verification → `/home` |

**Note:** След успешна регистрация платформата изпраща OTP на телефона за верификация (reuse на `_OtpBox` widget). Само след верификация → `/home`.

---

### Екран 7: Anonymous Scan Entry Point

**Поведение:** Потребителят натиска "Сканирай без акаунт" → отива директно в OCR wizard в `anonymous mode`.

**Промяна в Router/State:**
```dart
// Подава anonymousMode: true към OCR wizard
router.push('/scanner', extra: {'anonymousMode': true});
```

**Post-Purchase Prompt (след успешна покупка с anonymous акаунт):**

```
┌─────────────────────────────────────┐
│  Запази полицата си                 │  ← BottomSheet (не modal!)
│                                     │
│  ✅ Купи ГО · Toyota Corolla        │
│                                     │
│  Регистрирай се за да:              │
│  • Получиш PDF на имейл             │
│  • Виждаш полиците си               │
│  • Подновиш с едно докосване        │
│                                     │
│  [Телефонен номер поле]             │
│  [_GradientButton "Запази акаунта"] │
│                                     │
│  [TextButton "Не сега, изпрати PDF] │
└─────────────────────────────────────┘
```

**UX правила:**
- BottomSheet (НЕ modal) — може да се свали с swipe down
- "Не сега" е винаги видим — без натиск, изпращаме PDF на имейл (ако е въведен при плащане)
- Данните от anonymous сесията мигрират към новия акаунт без повторно въвеждане

---

### Onboarding Navigation Map

```
App Launch
    │
    ▼
SplashScreen (1.8с)
    │
    ├── [hasValidSession] ──────────────→ HomeScreen
    │
    ├── [isFirstLaunch] ─────────────→ OnboardingSlides (2 slides)
    │                                        │
    │                                        ▼
    │                               InterestSelector (1 tap, auto-advance)
    │                                        │
    │                                        ▼
    │                                   EntryGateScreen
    │
    └── [returning, not logged in] ──→ EntryGateScreen
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
          "Сканирай без акаунт"      "Влез в профила"        "Регистрирай се"
                    │                       │                       │
                    ▼                       ▼                       ▼
             OCR Scanner              LoginScreen            RegisterScreen
          (anonymous mode)                 │                       │
                    │                ────────────                   │
                    │               │            │                  │
                    │           success    "Забравена парола"      OTP Verify
                    │               │            │                  │
                    ▼               ▼            ▼                  ▼
           PurchaseFlow        HomeScreen  ResetPassword        HomeScreen
                    │                      (3 стъпки)
                    ▼
         PostPurchasePrompt
         (BottomSheet: запази акаунт)
```

---

### Consistency Rules (Onboarding)

| Правило | Описание |
|---------|---------|
| **Фон** | Всички онбординг екрани = `kBgColor` (`#E0EAF0`) |
| **Back navigation** | `_CircleButton` на всеки екран без SplashScreen |
| **Primary CTA** | Максимум 1 `_GradientButton` на екран, винаги в долната thumb zone |
| **Info card** | `_DarkInfoCard` на всеки auth/onboarding екран — дава контекст |
| **No redirects** | Registration prompt е BottomSheet inline, не нов route |
| **Skip always visible** | Onboarding slides имат "Пропусни" бутон винаги |
| **Progress indicator** | Multi-step flows (Reset PW, Register) имат "Стъпка X от Y" |

---

### Файлова структура (Onboarding)

```
lib/features/onboarding/
├── screens/
│   ├── splash_screen.dart
│   ├── onboarding_slides_screen.dart
│   ├── interest_selector_screen.dart
│   └── entry_gate_screen.dart
├── widgets/
│   └── interest_card.dart

lib/features/auth/
├── screens/
│   ├── login_screen.dart          ✅ Implemented
│   ├── two_fa_screen.dart         ✅ Implemented
│   ├── register_screen.dart       TODO
│   └── reset_password_screen.dart TODO
├── widgets/
│   └── password_strength_indicator.dart TODO

lib/core/widgets/
└── auth_widgets.dart              TODO (extract shared: _CircleButton,
                                         _DarkInfoCard, _BranivoTextField,
                                         _GradientButton, _OtpBox)
```

---

### Accessibility (Onboarding)

- [ ] Splash Screen: `Semantics(label: '{tenantName} се зарежда')` + `excludeSemantics: true` за лого
- [ ] Onboarding Slides: `PageView` с `Semantics(label: 'Слайд {i} от 2')` + swipe gesture hint
- [ ] Entry Gate: Трите бутона имат ясни `Semantics` labels; йерархия е семантична (heading, не само визуална)
- [ ] Reset Password: `aria-live="polite"` за countdown timer; `aria-live="assertive"` за OTP error
- [ ] PasswordStrengthIndicator: `Semantics(label: 'Силата на паролата: {слаба|средна|добра|силна}')` + `liveRegion: true`
- [ ] Anonymous Prompt BottomSheet: `aria-modal: false` — фонът остава достъпен

---

## GO Quote Wizard — Web Portal Flow

> **Revision:** 2026-04-02 — Нова секция: 5-стъпков wizard за уеб портала, вдъхновен от Boleron workflow анализ.

### Обзор

Текущата `/quotes` страница е flat form — няма стъпки, няма прогрес, няма streaming. Новият wizard заменя цялата страница с guided multi-step experience, идентичен по логика с мобилния app flow.

**Маршрут:** `/[locale]/quotes/go` → 5 стъпки → `/[locale]/quotes/go/payment`

**URL структура (query-based, без отделни route сегменти):**
```
/quotes/go?step=vehicle        ← Стъпка 1
/quotes/go?step=details        ← Стъпка 2
/quotes/go?step=offers         ← Стъпка 3
/quotes/go?step=dates          ← Стъпка 4
/quotes/go?step=owner          ← Стъпка 5
```

State се пази в `sessionStorage` (анонимна сесия) — при презареждане wizard се връща на последната попълнена стъпка.

---

### Layout Shell (всички стъпки)

```
┌────────────────────────────────────────────────────────┐
│  ← НАЗАД    ГРАЖДАНСКА ОТГОВОРНОСТ          ≡ МЕНЮ     │  ← Header (gradient bg: primary → accent)
├────────────────────────────────────────────────────────┤
│                                                        │
│   ╔══════════════════════════════╗  ╔════════════╗    │
│   ║                              ║  ║  Sidebar   ║    │  ← Sidebar само на стъпка 3 (Оферти)
│   ║    White card (shadow-lg)    ║  ║  (reviews) ║    │
│   ║                              ║  ╚════════════╝    │
│   ╚══════════════════════════════╝                     │
└────────────────────────────────────────────────────────┘
```

**Header:**
- Gradient background: `from-[var(--color-primary)] to-[var(--color-accent)]`
- Бял текст, bold, letter-spacing
- "← НАЗАД" — навигира към предишната стъпка (или излиза от wizard при стъпка 1)
- "ГРАЖДАНСКА ОТГОВОРНОСТ" — центриран заглавен текст
- "≡ МЕНЮ" — хамбургер (tenant брандинг)

**White card:**
- `bg-white rounded-2xl shadow-lg p-8 mx-auto max-w-xl`
- Centered на страницата вертикално и хоризонтално
- На мобилно: full-width с `mx-4`

**Step progress indicator (не е видим при Boleron, но Branivo го добавя):**
- 5 точки, горе вдясно в card-а, само активната е запълнена с primary color

---

### Стъпка 1 — ДАННИ ЗА АВТОМОБИЛ

**URL:** `?step=vehicle`

```
┌─────────────────────────────────┐
│  ДАННИ ЗА АВТОМОБИЛ             │  ← bold, primary color, center
│  Използваме тези данни само...  │  ← subtitle, gray, center
│                                 │
│  Регистриран ли е в КАТ?        │
│  ┌──────────────┐ ┌──────────┐  │
│  │ ✓  Да       │ │    Не    │  │  ← Pill toggle: selected = primary border + bg-primary/10
│  └──────────────┘ └──────────┘  │
│                                 │
│  Регистрационен номер:          │
│  ┌───────────────────────────┐  │
│  │  CA1234AB                 │  │  ← rounded-full border input
│  └───────────────────────────┘  │
│                                 │
│  Номер на малък талон:  ⓘ       │  ← tooltip: "8-цифрен номер от талона"
│  ┌───────────────────────────┐  │
│  │  000000002                │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │        ПРОДЪЛЖИ           │  │  ← FilledButton, primary, rounded-full, w-full
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Pill Toggle компонент:**
- Две опции едно до друго, 50/50 ширина
- Селектирано: `border-2 border-primary bg-primary/10 text-primary font-semibold` + checkmark icon
- Неселектирано: `border border-gray-300 text-gray-500`
- `border-radius: 9999px` (pill форма)

**Поведение:**
- Ако КАТ = "Не" → скрива полето за рег. номер и талон, показва ръчен VIN + марка/модел/година
- Ако КАТ = "Да" → регистрационен номер е задължителен; талон е препоръчителен (не блокира)
- Валидация: рег. номер pattern `[А-Я]{1,2}\d{4}[А-Я]{2}` (кирилица)

**Subtitle:** "Използваме тези данни само за изчисляване на оферта и ги споделяме единствено със застрахователите"

---

### Стъпка 2 — ДОПЪЛНИТЕЛНИ ДАННИ

**URL:** `?step=details`

```
┌─────────────────────────────────┐
│  ДОПЪЛНИТЕЛНИ ДАННИ             │
│                                 │
│  Шофьорски стаж:                │
│  ┌─────────────────────────▼─┐  │
│  │  3-5 години               │  │  ← Select dropdown
│  └───────────────────────────┘  │
│                                 │
│  Автомобилът се използва за:    │
│  ┌─────────────────────────▼─┐  │
│  │  Лични нужди              │  │
│  └───────────────────────────┘  │
│                                 │
│  Автомобилът с ляв волан ли е?  │
│  ┌──────────────┐ ┌──────────┐  │
│  │ ✓  Да       │ │    Не    │  │  ← Pill Toggle (same component)
│  └──────────────┘ └──────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │        ПРОДЪЛЖИ           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Dropdown опции:**

*Шофьорски стаж:*
- "До 1 година", "1-3 години", "3-5 години", "5-10 години", "Над 10 години"

*Автомобилът се използва за:*
- "Лични нужди", "Работа/Бизнес", "Таксиметров превоз", "Отдаване под наем"

**Поведение:**
- Всички полета са задължителни
- Default: стаж = "3-5 години", употреба = "Лични нужди", ляв волан = "Да"
- При submit: извиква `POST /quotes/sessions/{token}/request` и минава на стъпка 3

---

### Стъпка 3 — ОФЕРТИ

**URL:** `?step=offers`

**Layout на тази стъпка е двуколонен (desktop):**

```
┌─────────────────────────────────┐  ┌──────────────────┐
│  ОФЕРТИ                         │  │ ⭐ 4.9 Google     │
│  Сравнете и изберете най-доброто│  │ 50 000+ клиента  │
│                                 │  ├──────────────────┤
│  [ЕДНОКРАТНО] [2 ВНОСКИ] [4...]│  │ 👤 Nikolay N.    │
│                                 │  │ ★★★★★           │
│  ┌──────────────────────────┐   │  │ "Страхотни и..." │
│  │ [logo] Булинс  182.53€   │   │  ├──────────────────┤
│  │         357.00 лв.  ИЗБЕРИ│  │  │ 👤 Иван Б.       │
│  ├──────────────────────────┤   │  │ ★★★★★           │
│  │ [logo] Euroins 198.94€   │   │  │ "Склонихме комб..│
│  │         389.09 лв.  ИЗБЕРИ│  │  └──────────────────┘
│  ├──────────────────────────┤   │
│  │ [logo] Allianz            │   │
│  │         ⟳ Зареждане...   │   │  ← Spinner докато тече polling
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

**Tab Switcher (ЕДНОКРАТНО / 2 ВНОСКИ / 4 ВНОСКИ):**
- Pill-shaped container, `bg-gray-100 rounded-full`
- Активен tab: `bg-primary text-white rounded-full`
- При смяна → офертите се рендерират с новите суми (без нова заявка)

**Offer Row (при ЕДНОКРАТНО):**
```
[Insurer Logo]    182.53 € / 357.00 лв.    [ИЗБЕРИ]
```

**Offer Row (при 2 ВНОСКИ):**
```
[Insurer Logo]    1-ва: 95.26 € / 186.31 лв.
                  2-ра: 86.76 € / 169.69 лв.
                  182.02 € / 356.00 лв. общо    [ИЗБЕРИ]
```

**Loading state per row:**
- Лого на застрахователя е видимо веднага
- Вместо цена: `⟳ Зареждане на цени` (сив текст + spinner)
- При получаване на цена: плавна fade-in анимация на числата
- Polling interval: 1.5 сек към `GET /quotes/sessions/{token}/offers`

**Препоръчана оферта:**
- `border-2 border-primary` на целия row
- Badge "⭐ Препоръчано" горе вдясно в primary color

**Недостъпна оферта:**
- Сив, `opacity-50`, иконка ℹ + "Временно недостъпен"

**Social Proof Sidebar (само desktop, само на тази стъпка):**
- Sticky sidebar вдясно, `max-w-xs`
- Google rating card: 4.9 ⭐, "50 000+ клиенти"
- 2-3 Google review карти с аватар, 5 звезди, цитат
- Отзивите са tenant-configurable (от брокерския dashboard)
- На мобилно: сайдбарът се скрива (`hidden md:block`)

---

### Стъпка 4 — НАЧАЛО НА ЗАСТРАХОВКАТА

**URL:** `?step=dates`

```
┌─────────────────────────────────┐
│  НАЧАЛО НА ЗАСТРАХОВКАТА        │
│  Избери начална дата:           │
│                                 │
│  ┌─────────────────────────┐   │
│  │ Назад  Април 2026  Напред│   │
│  │ Пн  Вт  Ср  Чт  Пт  Сб  Нд│  │
│  │ 30  31   1  [2]  3   4   5│  │  ← Днешна дата е selected by default
│  │  6   7   8   9  10  11  12│  │
│  │ ...                      │  │
│  └─────────────────────────┘   │
│                                 │
│  ┌────────────────────────────┐ │
│  │ ℹ  Застраховката ще бъде   │ │  ← Info box, bg-blue-50
│  │    валидна след 2 часа.     │ │
│  └────────────────────────────┘ │
│                                 │
│  📅 Валидна от:   02.04.2026    │  ← Read-only display rows
│  📅 Валидна до:   01.04.2027    │
│  ✓  Срок:         12 месеца     │
│                                 │
│  ┌───────────────────────────┐  │
│  │        ПРОДЪЛЖИ           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Calendar поведение:**
- Default: днешна дата (highlight с primary color pill)
- Минимум: днес; максимум: +30 дни
- "Валидна до" = избрана дата + 12 месеца - 1 ден (автоматично)
- Weekends: червен текст (само визуален hint, не блокира избора)

**Timezone:** Всички дати в EET/EEST (Europe/Sofia)

---

### Стъпка 5 — СОБСТВЕНИК НА АВТОМОБИЛА

**URL:** `?step=owner`

```
┌─────────────────────────────────┐
│  СОБСТВЕНИК НА АВТОМОБИЛА       │
│                                 │
│  Собственик:                    │
│  ┌─────────────────────────▼─┐  │
│  │  Физическо лице           │  │  ← "Физическо лице" | "Юридическо лице"
│  └───────────────────────────┘  │
│                                 │
│  Име:                           │
│  ┌───────────────────────────┐  │
│  │  Използвай кирилица       │  │  ← placeholder
│  └───────────────────────────┘  │
│                                 │
│  Презиме:                       │
│  ┌───────────────────────────┐  │
│  │  Използвай кирилица       │  │
│  └───────────────────────────┘  │
│                                 │
│  Фамилия:                       │
│  ┌───────────────────────────┐  │
│  │  Използвай кирилица       │  │
│  └───────────────────────────┘  │
│                                 │
│  ЕГН/ЛНЧ:                       │
│  ┌───────────────────────────┐  │
│  │  7703041122               │  │  ← 10 цифри, Luhn-style валидация
│  └───────────────────────────┘  │
│                                 │
│  ☑  Собственикът на автомобила  │  ← Checkbox, checked by default
│     е застраховащ               │
│  (застраховащ е лицето,         │  ← caption, gray
│   сключващо договора)           │
│                                 │
│  ┌───────────────────────────┐  │
│  │        ПРОДЪЛЖИ           │  │  → навигира към /payment
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Поведение при "Юридическо лице":**
- Скрива "Презиме" и "ЕГН/ЛНЧ"
- Показва "Наименование на фирма" + "ЕИК" + "МОЛ"

**Кирилица валидация:**
- Pattern: `/^[А-яЁё\s\-]+$/` (позволява тире и интервал)
- Inline error: "Моля, използвай кирилица"

**Checkbox "Собственикът е застраховащ":**
- Checked by default
- Когато е unchecked → появява се втора форма "ЗАСТРАХОВАЩ" (идентична по полета)

---

### Wizard State Machine

```
vehicle → details → [API call: create quote request]
                         ↓
                      offers (polling until all loaded)
                         ↓
                    [user clicks ИЗБЕРИ]
                         ↓
                       dates
                         ↓
                       owner
                         ↓
                    [API call: finalize quote]
                         ↓
                      /payment
```

**State persistence:** `sessionStorage['go-wizard']` — JSON с всички попълнени полета + избрана оферта + стъпка

**Back navigation:** При "← НАЗАД" — само UI state се pop-ва; API заявки не се повтарят

---

### Responsive breakpoints

| Breakpoint | Layout |
|------------|--------|
| `< 768px` | Single column, card = full-width, без sidebar |
| `768px–1024px` | Single column, card = max-w-xl centered, без sidebar |
| `> 1024px` | Two column (card + sidebar), само на стъпка 3 |

---

### Typography & Colors (наследява tenant theme)

| Елемент | Клас |
|---------|------|
| Card title | `text-xl font-bold text-[var(--color-primary)] text-center tracking-wider uppercase` |
| Card subtitle | `text-sm text-gray-500 text-center` |
| Label | `text-sm font-medium text-gray-700` |
| Primary button | `bg-[var(--color-primary)] text-white rounded-full py-3 font-bold tracking-wide w-full` |
| Input | `border border-gray-300 rounded-full px-4 py-2.5 w-full focus:border-[var(--color-primary)]` |
| Select | `border border-gray-300 rounded-lg px-4 py-2.5 w-full` |

---

### Файлова структура (Next.js)

```
src/app/[locale]/(client)/quotes/go/
├── layout.tsx                     ← WizardShell (header + gradient bg)
├── page.tsx                       ← redirect → ?step=vehicle
├── components/
│   ├── wizard-shell.tsx           ← Header + card wrapper
│   ├── pill-toggle.tsx            ← Да/Не компонент
│   ├── step-vehicle.tsx           ← Стъпка 1
│   ├── step-details.tsx           ← Стъпка 2
│   ├── step-offers.tsx            ← Стъпка 3 + polling
│   ├── step-dates.tsx             ← Стъпка 4 + calendar
│   ├── step-owner.tsx             ← Стъпка 5
│   ├── offer-row.tsx              ← Single offer row (extracted from step-offers)
│   ├── social-proof-sidebar.tsx   ← Google reviews sidebar
│   └── mini-calendar.tsx          ← Calendar компонент (без external lib)
└── hooks/
    ├── use-wizard-state.ts        ← sessionStorage state management
    └── use-offers-polling.ts      ← Polling hook за streaming offers
```

---

### Accessibility

- [ ] Всяка стъпка: `<h1>` за заглавието в card-а
- [ ] Pill toggle: `role="radiogroup"` + `role="radio"` + `aria-checked`
- [ ] Calendar: `role="grid"`, дните са `role="gridcell"`, избраната дата `aria-selected="true"`
- [ ] Offer rows: `role="list"` + `role="listitem"`, loading state `aria-busy="true"`
- [ ] ПРОДЪЛЖИ button: `aria-disabled` при невалидна форма (не `disabled` — запазва focus)
- [ ] Step progress dots: `aria-label="Стъпка {n} от 5"` + `aria-current="step"` за активната
- [ ] Loyalty toggle: `aria-checked` + `aria-label="Използвай 120 loyalty точки за 12 лв. отстъпка"`
