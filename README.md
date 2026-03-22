# Branivo — Developer Setup Guide

White-label, multi-tenant B2B2C SaaS платформа за застрахователни брокери.

**Stack:** NestJS 11 · Next.js 14 · Flutter 3.11 · PostgreSQL 16 · Redis 7 · AWS ECS Fargate · Stripe Connect · BullMQ

---

## Съдържание

1. [Предварителни изисквания](#1-предварителни-изисквания)
2. [Клониране на репото](#2-клониране-на-репото)
3. [Конфигурация на външните услуги](#3-конфигурация-на-външните-услуги)
4. [Environment файлове](#4-environment-файлове)
5. [Локална инфраструктура (Docker)](#5-локална-инфраструктура-docker)
6. [Branivo API (NestJS)](#6-branivo-api-nestjs)
7. [Branivo Web (Next.js)](#7-branivo-web-nextjs)
8. [Branivo App (Flutter / iOS / Android)](#8-branivo-app-flutter--ios--android)
9. [AWS Setup (Production / Staging)](#9-aws-setup-production--staging)
10. [Terraform Infrastructure](#10-terraform-infrastructure)
11. [Полезни команди (Makefile)](#11-полезни-команди-makefile)
12. [Dev инструменти и достъп](#12-dev-инструменти-и-достъп)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Предварителни изисквания

Инсталирай следните инструменти преди да започнеш:

| Инструмент | Минимална версия | Как да инсталираш |
|------------|-----------------|-------------------|
| **Node.js** | 20 LTS | `brew install node@20` или [nvm](https://github.com/nvm-sh/nvm) |
| **npm** | 10+ | идва с Node.js |
| **Docker Desktop** | 4.x | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Flutter SDK** | 3.11.1+ | `brew install --cask flutter` или [flutter.dev](https://flutter.dev/docs/get-started/install) |
| **Dart SDK** | 3.11.1+ | идва с Flutter |
| **Xcode** | 15+ | Mac App Store (само за iOS) |
| **Android Studio** | Hedgehog+ | [developer.android.com](https://developer.android.com/studio) (само за Android) |
| **AWS CLI** | 2.x | `brew install awscli` |
| **Terraform** | 1.7+ | `brew install terraform` |
| **gh (GitHub CLI)** | latest | `brew install gh` |
| **psql** | 16+ | `brew install postgresql@16` |

> **Hint — nvm препоръчано:**
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
> nvm install 20
> nvm use 20
> nvm alias default 20
> ```

---

## 2. Клониране на репото

```bash
git clone https://github.com/dgrigorov/Branivo.git
cd Branivo

# Инсталирай root dependencies (workspace scripts)
npm install
```

Структура на проекта:
```
branivo-api/        NestJS backend API (port 3000)
branivo-web/        Next.js broker portal (port 3001)
branivo_app/        Flutter мобилно приложение (iOS / Android)
branivo-infra/      Terraform AWS infrastructure
docker-compose.yml  Локална dev инфраструктура
Makefile            Централни developer команди
```

---

## 3. Конфигурация на външните услуги

Трябва да регистрираш акаунт и да вземеш credentials за следните услуги:

### 3.1 Stripe Connect

1. Регистрирай се на [dashboard.stripe.com](https://dashboard.stripe.com)
2. Включи **Test mode** (toggle горе вдясно)
3. Отиди в **Developers → API keys**:
   - `STRIPE_SECRET_KEY` = `sk_test_...`
   - `STRIPE_PUBLISHABLE_KEY` = `pk_test_...`
4. За webhook secret: **Developers → Webhooks → Add endpoint**
   - URL: `http://localhost:3000/api/v1/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`

> **Hint:** За локален dev използвай Stripe CLI за webhook forwarding:
> ```bash
> stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
> # Това ти дава whsec_... за STRIPE_WEBHOOK_SECRET
> ```

### 3.2 Twilio (SMS OTP)

1. Регистрирай се на [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. От **Console Dashboard**:
   - `TWILIO_ACCOUNT_SID` = `AC...`
   - `TWILIO_AUTH_TOKEN` = (от Console)
3. Купи/вземи trial номер: **Phone Numbers → Manage → Buy a number**
   - `TWILIO_PHONE_NUMBER` = `+1XXXXXXXXXX`

> **Hint:** Trial акаунт работи, но може да праща само към верифицирани номера. За dev — верифицирай своя номер в **Verified Caller IDs**.

### 3.3 SendGrid (Email)

1. Регистрирай се на [sendgrid.com](https://sendgrid.com)
2. **Settings → API Keys → Create API Key** (Full Access или Custom с Mail Send permission)
   - `SENDGRID_API_KEY` = `SG.xxx...`

> **Hint:** За локален dev MailHog (включен в docker-compose) прихваща всички emails на `http://localhost:8025` — може да сложиш фиктивен SendGrid ключ, ако конфигурираш emailService да използва MailHog SMTP.

### 3.4 Firebase Cloud Messaging (Push Notifications)

1. Отиди на [console.firebase.google.com](https://console.firebase.google.com)
2. Създай нов проект → **Project Settings → Service Accounts**
3. Кликни **Generate new private key** → изтегли JSON файла
4. Извади от JSON файла:
   - `FIREBASE_PROJECT_ID` = `project_id`
   - `FIREBASE_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_PRIVATE_KEY` = `private_key` (целия string с `\n`)

> **Hint:** Private key съдържа newlines. В `.env` файла го запиши в кавички:
> ```env
> FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
> ```

### 3.5 Google Cloud Vision API (OCR за документи)

1. Отиди на [console.cloud.google.com](https://console.cloud.google.com)
2. Създай проект или използвай Firebase проекта
3. **APIs & Services → Enable APIs** → включи **Cloud Vision API**
4. **APIs & Services → Credentials → Create Credentials → Service Account**
5. Изтегли JSON ключа и задай пътя:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-vision-key.json
   ```

> **Hint:** Ако имаш същия Google Cloud проект като Firebase, може да използваш същия service account. Просто добави `Cloud Vision API User` роля.

### 3.6 AWS (S3 за документи + Textract за OCR)

Виж [Секция 9 — AWS Setup](#9-aws-setup-production--staging) за пълна инструкция.

За локален dev ти трябват:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` = `eu-central-1`
- `DOCUMENTS_BUCKET_NAME` = `branivo-documents-dev`

### 3.7 Speedy / Econt (куриерски интеграции)

- **Speedy:** Регистрирай B2B акаунт на [speedy.bg](https://speedy.bg) → вземи API credentials от партньорски портал
  - `SPEEDY_API_URL` = `https://api.speedy.bg/v1`
  - `SPEEDY_USERNAME` = (от Speedy партньорски акаунт)
  - `SPEEDY_PASSWORD` = (от Speedy партньорски акаунт)

- **Econt:** Регистрирай B2B акаунт на [econt.com](https://econt.com) → вземи API credentials
  - `ECONT_API_URL` = `https://ee.econt.com/services`
  - `ECONT_USERNAME` = (от Econt акаунт)
  - `ECONT_PASSWORD` = (от Econt акаунт)

> **Hint:** За локален dev може да оставиш Speedy/Econt credentials празни — логистичните функции ще fail-нат gracefully, а основния flow работи без тях.

---

## 4. Environment файлове

### 4.1 `branivo-api/.env`

Създай файла:

```bash
cp branivo-api/.env.example branivo-api/.env  # ако съществува
# или ръчно:
touch branivo-api/.env
```

Съдържание:

```env
# ── App ────────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database (съвпада с docker-compose.yml) ────────────────────────────────
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=branivo
DATABASE_PASS=branivo
DATABASE_NAME=branivo_dev
DATABASE_POOL_SIZE=10

# ── Redis ──────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── JWT ────────────────────────────────────────────────────────────────────
# Генерирай с: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-32-char-minimum-random-secret-here
ONBOARDING_JWT_SECRET=another-32-char-random-secret-for-onboarding

# ── Encryption (за insurer API keys в DB) ──────────────────────────────────
# Задължително 64 hex символа (32 bytes):
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-hex-char-encryption-key-here

# ── Stripe ─────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── SendGrid ───────────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxx...

# ── Twilio (SMS OTP) ───────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# ── Firebase (Push Notifications) ──────────────────────────────────────────
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ── AWS ────────────────────────────────────────────────────────────────────
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
DOCUMENTS_BUCKET_NAME=branivo-documents-dev

# ── Google Cloud Vision ────────────────────────────────────────────────────
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-vision-key.json

# ── Logistics ──────────────────────────────────────────────────────────────
SPEEDY_API_URL=https://api.speedy.bg/v1
SPEEDY_USERNAME=
SPEEDY_PASSWORD=
ECONT_API_URL=https://ee.econt.com/services
ECONT_USERNAME=
ECONT_PASSWORD=
```

### 4.2 `branivo-web/.env.local`

```bash
touch branivo-web/.env.local
```

Съдържание:

```env
# API URL за server-side calls (SSR/API routes)
BRANIVO_API_URL=http://localhost:3000

# API URL за вътрешни Next.js API routes
API_INTERNAL_URL=http://localhost:3000

# Stripe publishable key (client-side)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 4.3 Flutter `.env`

Flutter app-ът чете API URL от конфигурация. Провери `branivo_app/lib/core/config/`:

```dart
// Промени base URL ако е нужно:
static const String apiBaseUrl = 'http://192.168.X.X:3000';
// Важно: използвай IP адреса на машината, не localhost — емулаторът/телефонът не може да достигне localhost на хоста
```

> **Hint за iOS устройство:** Намери IP адреса си с `ifconfig | grep "inet " | grep -v 127.0.0.1`. Обикновено е `192.168.X.X` или `10.X.X.X`.

---

## 5. Локална инфраструктура (Docker)

```bash
# Стартирай всички services
make up
# или: docker compose up -d

# Провери статуса
make status

# Спри всичко
make down
```

Services:

| Service | URL / Port | Credentials |
|---------|-----------|-------------|
| **PostgreSQL** | `localhost:5432` | user: `branivo`, pass: `branivo`, db: `branivo_dev` |
| **Redis** | `localhost:6379` | без парола |
| **pgAdmin** | [http://localhost:5050](http://localhost:5050) | email: `admin@branivo.bg`, pass: `admin` |
| **Redis Commander** | [http://localhost:8081](http://localhost:8081) | без парола |
| **MailHog** (email catch) | [http://localhost:8025](http://localhost:8025) | без парола |

> **Hint — pgAdmin setup:** Първи път добави server ръчно: **Servers → Add New Server**:
> - Host: `postgres` (service name в Docker network) или `host.docker.internal`
> - Port: `5432`, Username: `branivo`, Password: `branivo`

---

## 6. Branivo API (NestJS)

```bash
# Инсталирай dependencies
cd branivo-api && npm install

# Стартирай в dev режим (watch mode + auto-migrations)
make api
# или: cd branivo-api && npm run start:dev
```

API се стартира на **http://localhost:3000**

- **Swagger Docs:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **Health check:** [http://localhost:3000/health](http://localhost:3000/health)

> **Migrations:** Изпълняват се автоматично при стартиране (`migrationsRun: true`).
>
> За ръчно изпълнение: `make migrate`

> **Seed данни:** Seeder-ът се изпълнява автоматично при стартиране и добавя demo tenant, demo broker, mock застрахователи и т.н. Безопасен е — използва `ON CONFLICT DO NOTHING`.

### Тестове

```bash
make test-api           # unit тестове с coverage report
cd branivo-api && npm run test:e2e  # e2e тестове (изисква работеща DB)
```

---

## 7. Branivo Web (Next.js)

```bash
# Инсталирай dependencies
cd branivo-web && npm install

# Стартирай dev сървър
make web
# или: cd branivo-web && npm run dev
```

Web portal се стартира на **http://localhost:3001**

> **Multi-tenant routing:** Web-ът използва домейн-базиран tenant resolution. За локален dev tenant е достъпен на `localhost:3001` (fallback към demo тенанта).

### Тестове

```bash
make test-web           # component тестове
```

---

## 8. Branivo App (Flutter / iOS / Android)

### Инсталация на dependencies

```bash
make flutter-pub-get
# или: cd branivo_app && flutter pub get
```

### Стартиране на емулатор

```bash
# Виж достъпните устройства
flutter devices

# Стартирай iOS симулатор
open -a Simulator
flutter run -d "iPhone 15"

# Стартирай Android емулатор
flutter emulators --launch <emulator-id>
flutter run
```

### Deployment на физически iPhone

> **Важно:** Използвай `flutter run` от терминала, **НЕ** Xcode Build button.
> Xcode Build button fail-ва с "No such file or directory" за `flutter assemble` — това е известен проблем.

```bash
# 1. Свържи iPhone с кабел
# 2. Провери device ID
flutter devices

# 3. Стартирай на физическото устройство
flutter run -d 00008110-000C75A92139801E  # замени с твоя device ID

# За release build:
flutter run --release -d <device-id>
```

#### iOS Code Signing Setup (първи път)

1. Отвори `branivo_app/ios/Runner.xcworkspace` в Xcode (НЕ .xcodeproj)
2. **Runner target → Signing & Capabilities**
3. Включи **Automatically manage signing**
4. Избери твоя **Team** (личния Apple акаунт или Apple Developer Program акаунт)
5. Bundle ID: `bg.branivo.branivoApp`
6. Затвори Xcode и използвай `flutter run` от терминала

> **Hint — Apple Developer Program:** За deployment на физически устройства без Program акаунт работи само 7 дни. За по-дълготрайно тестване регистрирай [Apple Developer Program](https://developer.apple.com/programs/) ($99/год).

### Тестове

```bash
make flutter-test       # widget тестове
make flutter-analyze    # статичен анализ
```

---

## 9. AWS Setup (Production / Staging)

### 9.1 Регистрация в AWS

1. Отиди на [aws.amazon.com](https://aws.amazon.com) → **Create an AWS Account**
2. Избери **Free Tier** акаунт
3. Настрой billing alerts: **Billing → Budgets → Create Budget**

> **Hint — Security:** Никога не използвай root акаунта директно. Веднага след регистрация:
> - Включи MFA за root акаунта
> - Създай IAM user за ежедневна работа

### 9.2 Създаване на IAM User

```bash
# След инсталация на AWS CLI
aws configure  # ще те попита за Access Key ID, Secret, region, output format
```

В AWS Console:
1. **IAM → Users → Create user**
2. Attach policies: `AdministratorAccess` (за dev) или custom policies за prod
3. **Security credentials → Create access key** → избери "CLI"
4. Запази `Access key ID` и `Secret access key`

> **Hint:** Никога не commit-вай AWS credentials в git. Добави `*.env`, `.env*` в `.gitignore`.

### 9.3 Вземане на AWS credentials

```bash
# Провери текущата конфигурация
aws sts get-caller-identity

# Конфигурирай profile
aws configure --profile branivo-dev
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region name: eu-central-1
# Default output format: json

# Използвай profile
export AWS_PROFILE=branivo-dev
```

### 9.4 Създаване на S3 bucket за документи

```bash
# Създай bucket (eu-central-1 = Frankfurt)
aws s3api create-bucket \
  --bucket branivo-documents-dev \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1

# Блокирай публичен достъп
aws s3api put-public-access-block \
  --bucket branivo-documents-dev \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 9.5 Terraform State Bucket

```bash
# Bucket за Terraform state (само веднъж за цялото AWS акаунт)
aws s3api create-bucket \
  --bucket branivo-tfstate-dev \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1

# Включи versioning (за state recovery)
aws s3api put-bucket-versioning \
  --bucket branivo-tfstate-dev \
  --versioning-configuration Status=Enabled
```

---

## 10. Terraform Infrastructure

> Terraform е необходим само за cloud deployment. За локален dev — skip.

```bash
cd branivo-infra/environments/dev

# Инициализирай
terraform init

# Прегледай промените
terraform plan

# Приложи
terraform apply
```

> **Hint:** Terraform управлява: VPC, RDS PostgreSQL, ElastiCache Redis, ECS Fargate cluster, ECR, S3, ALB.

---

## 11. Полезни команди (Makefile)

```bash
make help               # Всички налични команди с описание

# Инфраструктура
make up                 # Стартирай Docker services
make down               # Спри Docker services
make status             # Покажи статуса на containers
make logs               # Tail logs

# Dev сървъри
make api                # Стартирай NestJS API (watch mode)
make web                # Стартирай Next.js web

# Тестове
make test               # Всички тестове (API + Web)
make test-api           # NestJS unit тестове с coverage
make test-web           # Next.js component тестове

# Lint
make lint               # Lint на API + Web
make lint-api           # Lint само API
make lint-web           # Lint само Web

# Database
make migrate            # Изпълни pending TypeORM миграции
make migrate-revert     # Откачи последната миграция
make seed-reset         # Изтрий demo data за ре-seed

# Build
make build              # Production build (API + Web)
make ci                 # Пълен CI pipeline: lint → test → build

# Flutter
make flutter-pub-get    # Инсталирай Flutter dependencies
make flutter-test       # Flutter тестове
make flutter-analyze    # Flutter статичен анализ
```

---

## 12. Dev инструменти и достъп

| Инструмент | URL | Credentials |
|------------|-----|-------------|
| **API Swagger** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Bearer token от login |
| **pgAdmin** | [http://localhost:5050](http://localhost:5050) | `admin@branivo.bg` / `admin` |
| **Redis Commander** | [http://localhost:8081](http://localhost:8081) | без auth |
| **MailHog** | [http://localhost:8025](http://localhost:8025) | без auth — всички emails се прихващат тук |
| **Web Portal** | [http://localhost:3001](http://localhost:3001) | demo broker credentials от seeder |

### Demo Credentials (от Seeder)

След стартиране на API seed-ерът създава автоматично:

- **Super Admin:** `admin@branivo.bg` / `Admin1234!`
- **Demo Broker:** `broker@demo.branivo.bg` / `Broker1234!`
- **Demo Tenant Domain:** `demo.branivo.bg` → маппва на `localhost` в dev

---

## 13. Troubleshooting

### API не стартира — "Cannot find module"

```bash
cd branivo-api && npm install
# Ако проблема продължи:
rm -rf node_modules && npm install
```

### Database connection refused

```bash
# Провери дали Docker е пуснат
make status
# Ако postgres не е running:
make up
# Изчакай 10 секунди за healthcheck да мине
```

### TypeORM migration error

```bash
# Виж pending миграции
cd branivo-api && npm run build && npx typeorm migration:show -d dist/infrastructure/database/data-source.js

# Откачи проблемна миграция
make migrate-revert
```

### Flutter — "No such file or directory" при Xcode Build

**Не използвай Xcode Build button.** Използвай CLI:

```bash
cd branivo_app && flutter run -d <device-id>
```

### Flutter — iPhone не се вижда

```bash
# Провери дали устройството е доверено
flutter devices
# Ако няма устройство: отключи телефона и натисни "Trust" на popups
# Ако проблема продължи: рестартирай usbmuxd
sudo killall -STOP -c usbd
```

### Flutter — Code signing error

1. Xcode → Runner target → Signing & Capabilities
2. Смени Team на твоя личен/developer акаунт
3. Затвори Xcode
4. `flutter clean && flutter run -d <device-id>`

### Stripe webhook не се получава локално

```bash
# Инсталирай Stripe CLI
brew install stripe/stripe-cli/stripe

# Логни се
stripe login

# Forward webhook events към локалния API
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
# Копирай whsec_... ключа в .env като STRIPE_WEBHOOK_SECRET
```

### SMS не се изпраща (Twilio)

За локален dev SMS-ите могат да се тестват с Twilio test credentials. Провери [Twilio Test Credentials](https://www.twilio.com/docs/iam/test-credentials) за тестови номера.

### Redis connection error

```bash
# Провери Redis
docker exec branivo-redis redis-cli ping
# Очакван отговор: PONG

# Ако Redis не е достъпен:
make down && make up
```

### `make` command not found (Windows)

Branivo е проектиран за macOS/Linux. На Windows използвай WSL2 + Ubuntu.

---

## Архитектурни бележки

- Всяка DB заявка **задължително** съдържа `tenant_id` scope (освен Super Admin)
- Полица се активира **само** след `payment_intent.succeeded` Stripe webhook
- `audit_log` и `policy_events` таблиците са **immutable** — без UPDATE/DELETE
- `insurer.api_key_enc` никога не се връща в GET отговори
- Feature flags се проверяват преди всяка feature-gated функционалност

---

*Branivo — Digital Insurance Platform | Изградено с BMAD Methodology*
