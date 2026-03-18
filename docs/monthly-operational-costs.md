# Месечни Оперативни Разходи — Branivo Платформа
## Оценка по фази на растеж

---

**Дата:** 18 март 2026 г.
**Тип документ:** Оперативен бюджет (информативен)
**Забележка:** Всички суми са без ДДС и са оценки — реалните разходи зависят от трафика и броя активни брокери.

---

## Обобщение по фази

| Фаза | Период | Активни брокери | Прогнозни разходи/месец |
|------|--------|----------------|------------------------|
| Фаза 1 — MVP | Q2–Q3 2026 (май–окт 2026) | ~25 | **€270 – €350** |
| Фаза 2 — Growth | Q4 2026–Q1 2027 (ноем 2026–апр 2027) | ~65 | **€450 – €600** |
| Фаза 3 — Балкани | Q2–Q4 2027 (май–ноем 2027) | ~140 | **€850 – €1,100** |

---

## Фаза 1 — MVP (~25 брокера, България, продукт ГО)

### AWS Infrastructure

| Услуга | Конфигурация | €/месец |
|--------|-------------|---------|
| ECS Fargate (API) | 2 tasks × 0.5 vCPU / 1 GB RAM | €55 |
| RDS PostgreSQL 16 | db.t3.medium, Single-AZ, 100 GB SSD | €60 |
| ElastiCache Redis 7 | cache.t3.micro, Single node | €25 |
| Application Load Balancer | 1 ALB | €20 |
| NAT Gateway | 1 AZ | €35 |
| S3 (PDF-и, снимки, логота) | ~50 GB storage + requests | €10 |
| CloudFront CDN | ~100 GB transfer/месец | €15 |
| Secrets Manager | ~10 secrets | €5 |
| CloudWatch Logs & Metrics | Structured logs, dashboards | €15 |
| ECR (Docker images) | ~5 GB storage | €5 |
| Route 53 (DNS) | 1 hosted zone | €5 |
| **AWS Subtotal** | | **€250** |

### Трети страни (SaaS услуги)

| Услуга | Използване | €/месец |
|--------|-----------|---------|
| Google Vision OCR | ~500–1,000 скана/месец | €5 |
| AWS Textract (fallback) | Рядко използван | €2 |
| Twilio SMS (BG) | ~500 SMS/месец (renewal reminders) | €20 |
| AWS SES (имейл) | ~5,000 имейла/месец | €5 |
| Firebase Cloud Messaging | Push notifications | **€0** |
| GitHub (private repos) | Team план | €10 |
| **Трети страни Subtotal** | | **€42** |

### Stripe такси

> Stripe таксите са **% от приходите** — не фиксирани месечни разходи.

| Stripe такса | Ставка |
|-------------|--------|
| Processing fee (EU карти) | 1.4% + €0.25 / транзакция |
| Connect platform fee | Включена в горното |
| Payouts към брокери | €0.25 / payout |

*При средна полица €150 и 200 продажби/месец → Stripe такси ≈ €470/месец (платени от клиентите чрез platform fee).*

---

### Общо Фаза 1: ~€292/месец (фиксирани) + Stripe % от приходи

---

## Фаза 2 — Growth (~65 брокера, България, Каско + Fleet + API)

### AWS Infrastructure (промени спрямо Фаза 1)

| Услуга | Конфигурация | €/месец |
|--------|-------------|---------|
| ECS Fargate (API) | 4 tasks × 1 vCPU / 2 GB RAM (повече трафик) | €120 |
| RDS PostgreSQL 16 | db.t3.large, Multi-AZ (production reliability) | €150 |
| ElastiCache Redis 7 | cache.t3.small, 2 nodes | €50 |
| Application Load Balancer | 1 ALB | €20 |
| NAT Gateway | 1 AZ | €35 |
| S3 (PDF-и, Каско снимки, претенции) | ~200 GB storage | €20 |
| CloudFront CDN | ~300 GB transfer/месец | €30 |
| Secrets Manager | ~15 secrets | €8 |
| CloudWatch | Повече logs и dashboards | €25 |
| ECR | ~10 GB | €8 |
| Route 53 | 2 hosted zones | €8 |
| **AWS Subtotal** | | **€474** |

### Трети страни (SaaS услуги)

| Услуга | Използване | €/месец |
|--------|-----------|---------|
| Google Vision OCR | ~2,000 скана/месец | €12 |
| AWS Textract (fallback) | ~200 скана/месец | €5 |
| Twilio SMS (BG) | ~1,500 SMS/месец | €55 |
| AWS SES (имейл) | ~20,000 имейла/месец | €10 |
| Firebase Cloud Messaging | Push notifications | **€0** |
| GitHub (Team) | CI/CD minutes увеличени | €15 |
| **Трети страни Subtotal** | | **€97** |

---

### Общо Фаза 2: ~€571/месец (фиксирани) + Stripe % от приходи

---

## Фаза 3 — Балкани (~140 брокера, 3 нови пазара, Property + Travel)

### AWS Infrastructure (промени спрямо Фаза 2)

| Услуга | Конфигурация | €/месец |
|--------|-------------|---------|
| ECS Fargate (API) | 6 tasks × 1 vCPU / 2 GB RAM | €185 |
| RDS PostgreSQL 16 | db.t3.xlarge, Multi-AZ + Read Replica | €280 |
| ElastiCache Redis 7 | cache.t3.medium, cluster mode | €90 |
| Application Load Balancer | 2 ALB (BG + Балкани) | €40 |
| NAT Gateway | 2 AZ | €70 |
| S3 | ~500 GB storage (4 пазара) | €40 |
| CloudFront CDN | ~700 GB transfer/месец | €65 |
| Secrets Manager | ~30 secrets | €15 |
| CloudWatch | Multi-region logs | €40 |
| ECR | ~15 GB | €10 |
| Route 53 | 5 hosted zones (BG + RO + MK + GR + admin) | €15 |
| **AWS Subtotal** | | **€850** |

### Трети страни (SaaS услуги)

| Услуга | Използване | €/месец |
|--------|-----------|---------|
| Google Vision OCR | ~5,000 скана/месец (4 пазара) | €25 |
| AWS Textract (fallback) | ~500 скана/месец | €10 |
| Twilio SMS (BG + RO + MK + GR) | ~4,000 SMS/месец | €150 |
| AWS SES (имейл) | ~50,000 имейла/месец | €20 |
| Firebase Cloud Messaging | Push notifications | **€0** |
| GitHub (Team) | CI/CD за 4 пазара | €20 |
| **Трети страни Subtotal** | | **€225** |

---

### Общо Фаза 3: ~€1,075/месец (фиксирани) + Stripe % от приходи

---

## Важни бележки

### Какво НЕ е включено в тези оценки

| Разход | Пояснение |
|--------|-----------|
| Stripe такси | % от транзакциите — зависят от обема на продажбите |
| Apple Developer Program | €99/година — за публикуване в App Store |
| Google Play | €25 еднократно — за публикуване в Play Store |
| Домейн имена | €10–50/година/домейн (per tenant white-label домейни) |
| SSL сертификати | Включени в AWS ACM — **безплатни** |
| Поддръжка и мониторинг | Ако се изисква SLA от разработчиците — договаря се отделно |

### Оптимизационни бележки

- **Фаза 1:** RDS Single-AZ е допустим за MVP; препоръчваме Multi-AZ от Фаза 2 нагоре (downtime риск)
- **NAT Gateway** е значителен разход (€35+/месец) — алтернатива е VPC endpoints за S3/DynamoDB
- **CloudFront** цената расте с трафика — при много активни брокери може да надхвърли оценката
- **ECS Fargate** може да се оптимизира с Spot instances за non-critical tasks (BullMQ workers) — спестява ~30%
- **RDS Reserved Instances** (1-годишен ангажимент) спестяват ~40% спрямо on-demand

### Прогноза за рентабилност

| Фаза | SaaS приходи (MRR) | Оперативни разходи | Нетна марж |
|------|-------------------|--------------------|-----------|
| Фаза 1 (25 брокера) | €11,750 | ~€300 | >97% от MRR покрива разходите |
| Фаза 2 (65 брокера) | €45,500 | ~€580 | >98% |
| Фаза 3 (140 брокера) | ~€100,000+ | ~€1,100 | >99% |

> Инфраструктурните разходи са **под 1.1% от приходите** при Фаза 2+. Платформата е изключително ефективна от гледна точка на инфраструктурни разходи.

---

*Оценките са базирани на текущите AWS ценови листи (us-east-1 / eu-central-1) и реалистично натоварване по брой брокери и транзакции. Реалните разходи могат да варират с ±20% в зависимост от трафика.*
