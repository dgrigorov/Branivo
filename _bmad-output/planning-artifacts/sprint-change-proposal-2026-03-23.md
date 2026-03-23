# Sprint Change Proposal — Branivo Phase Gate Strategy
**Дата:** 2026-03-23
**Тип на промяната:** Sprint Reprioritization — Phase Gate enforcement преди Phase 2

---

## Раздел 1: Issue Summary

### Проблем
При стратегически преглед на sprint-status.yaml (2026-03-23) беше установено, че **Phase 1 и Phase 2 функционалности са разработвани паралелно** — без ясна фазова граница и без UAT checkpoint.

### Конкретни факти

| Факт | Детайл |
|------|--------|
| Epic 14 (Phase 2) частично done | `14-1-apple-pay-and-google-pay: done` — имплементирана по време на Phase 1 работа |
| Epic 22 (Phase 1) незавършен | `22-3: review`, `22-4/5/6: backlog` |
| Epic 11 (Phase 1) незавършен | само `11-1: done`, 16 stories в backlog |
| Липса на UAT checkpoint | Phase 1 нямаше формален UAT gate преди Phase 2 старт |

### Стратегически риск
Без Phase Gate: Phase 2 разработка може да продължи докато Phase 1 има незатворени compliance/GDPR изисквания (Epic 11). Това носи регулаторен риск (КФН, КЗЛД).

---

## Раздел 2: Impact Analysis

### Artifact Impact
| Артефакт | Промяна | Причина |
|----------|---------|---------|
| `sprint-status.yaml` | **3 коментарни промени** | Phase Gate enforcement |
| PRD | Незасегнат | Фазовото разделение вече е документирано |
| Architecture | Незасегнат | — |
| UX Design | Незасегнат | — |

### Story Impact
- Нулева промяна на individual story статуси
- `14-1: done` остава done — кодът е реален, не се rollback-ва
- Редът на изпълнение на всички останали stories е непроменен

### Technical Impact
- Нулев impact върху код
- Нулев impact върху infrastructure

---

## Раздел 3: Recommended Approach

**Option 1: Direct Adjustment — Phase Gate коментари** (избран)

Три конкретни промени само в `sprint-status.yaml`:
1. Phase 1 хедър: добавен UAT checkpoint в success criteria
2. Phase 2 хедър: добавен ⛔ PHASE GATE LOCK коментар
3. Epic 14: добавена историческа бележка за 14-1

**Effort:** Low | **Risk:** Нулев | **Timeline impact:** Нулев

---

## Раздел 4: Промени в sprint-status.yaml

### Промяна 1 — Phase 1 success criteria
```yaml
# ПРЕДИ:
# Phase 1 приключва когато: epic-22: done AND epic-11: done

# СЛЕД:
# Phase 1 приключва когато: epic-22: done AND epic-11: done AND UAT: approved
# ВАЖНО: Не се стартира НИКАКВА Phase 2 story преди Phase 1 UAT е преминат.
```

### Промяна 2 — Phase 2 PHASE GATE LOCK
```yaml
# ПРЕДИ:
# Започва след: epic-22: done AND epic-11: done

# СЛЕД:
# ⛔ PHASE GATE LOCK: НЕ ЗАПОЧВАЙ Phase 2 stories докато:
#    epic-22: done AND epic-11: done AND UAT: approved
```

### Промяна 3 — Epic 14 историческа бележка
```yaml
# БЕЛЕЖКА: 14-1 (Apple Pay/Google Pay) е имплементирана по
# време на Phase 1 период — исторически факт, не се rollback-ва.
# Следващата story (14-2) не се стартира преди Phase 1 UAT.
```

---

## Раздел 5: Phase 1 Completion Roadmap

**Phase 1 приключва след тези стъпки в следния ред:**

### Epic 22 — Production Hardening
| Story | Статус | Приоритет |
|-------|--------|-----------|
| `22-3` gdpr-client-data-export | review → soon done | Законово задължително |
| `22-4` pwa-browser-push-notifications | backlog | FR42 |
| `22-5` guarantee-fund-api-integration | backlog | FR20 |
| `22-6` terraform-iac-infrastructure | backlog | NFR38 |

### Epic 11 — Compliance, GDPR & Legal Pages
**Wave 1 (Foundation & Legal Blockers):**
`11-11` → `11-12` → `11-13` → `11-4` → `11-16`

**Wave 2 (Core Compliance Infrastructure):**
`11-2` → `11-5` → `11-14` → `11-10` → `11-6`

**Wave 3 (Individual Rights):**
`11-7` → `11-8` → `11-9` → `11-17`

**Wave 4 (Operational Excellence):**
`11-15` → `11-3`

### Phase Gate
```
epic-22: done
epic-11: done
    ↓
UAT: Даниел провежда UAT и одобрява Phase 1
    ↓
Phase 2 старт (Epic 9, 10, 12, 13, 14-2, 15–21)
```

---

## Раздел 6: Implementation Handoff

**Scope: Minor** — директна промяна на sprint-status.yaml (вече приложена)

**Статус на приложените промени:** ✅ Имплементирани на 2026-03-23

**Success criteria:**
- `epic-22: done` + `epic-11: done` → Даниел провежда UAT
- UAT одобрен → Phase 1 officially closed
- Phase 2 стартира само след UAT approval
