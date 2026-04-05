# ─────────────────────────────────────────────────────────────────────────────
# Branivo — Developer Makefile
# Usage: make <target>
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help \
        up down restart logs \
        api web dev dev-backend flutter dev-stop \
        test test-api test-web test-cov \
        lint lint-api lint-web \
        migrate build \
        kill-stockcrm \
        status \
        flutter-pub-get flutter-test flutter-analyze \
        flutter-run flutter-install flutter-run-clean flutter-clean \
        scrape-vehicles import-vehicles \
        ocr ocr-rebuild ocr-logs ocr-shell \
        ocr-test ocr-test-ci \
        gen-vapid-keys

# ── Default ──────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' \
		| sort

# ── Docker infra ─────────────────────────────────────────────────────────────

up: ## Start all infra containers (postgres, redis, pgadmin, mailhog)
	docker compose up -d

down: ## Stop all infra containers
	docker compose down

restart: ## Restart all infra containers
	docker compose restart

logs: ## Tail logs for all infra containers
	docker compose logs -f

status: ## Show status of all containers
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# ── Dev servers ───────────────────────────────────────────────────────────────

api: ## Start branivo-api in watch mode (localhost:3000)
	cd branivo-api && npm run start:dev

web: ## Start branivo-web dev server (localhost:3001)
	cd branivo-web && npm run dev

dev: ## Fresh start — Clean ports + Docker infra + API + web (background) + Flutter app (foreground)
	@echo "🧹 Cleaning up old processes..."
	@pkill -f "npm run start:dev" 2>/dev/null || true
	@pkill -f "next dev" 2>/dev/null || true
	@pkill -f "flutter run" 2>/dev/null || true
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	@echo "🐳 Starting Docker infrastructure..."
	docker compose up -d
	@echo "⏳ Waiting for services to be ready..."
	@sleep 3
	@echo "🚀 Starting API server..."
	(cd branivo-api && npm run start:dev) &
	@echo "⏳ Waiting for API to start..."
	@sleep 5
	@echo "🌐 Starting web server..."
	(cd branivo-web && npm run dev) &
	@echo "⏳ Waiting for web to start..."
	@sleep 3
	@echo "📱 Starting Flutter app..."
	cd branivo_app && flutter run --dart-define=API_BASE_URL=http://192.168.100.185:3000

dev-backend: ## Quick start — Clean ports + Docker infra + API + web (background only)
	@echo "🧹 Cleaning up old processes..."
	@pkill -f "npm run start:dev" 2>/dev/null || true
	@pkill -f "next dev" 2>/dev/null || true
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	@echo "🐳 Starting Docker infrastructure..."
	docker compose up -d
	@echo "⏳ Waiting for services to be ready..."
	@sleep 3
	@echo "🚀 Starting API server..."
	(cd branivo-api && npm run start:dev) &
	@echo "⏳ Waiting for API to start..."
	@sleep 5
	@echo "🌐 Starting web server..."
	(cd branivo-web && npm run dev) &
	@echo "✅ Backend ready! API: http://localhost:3000, Web: http://localhost:3001"
	@echo "💡 Run 'make flutter' to start the mobile app separately"

flutter: ## Start Flutter app with correct API config
	cd branivo_app && flutter run --dart-define=API_BASE_URL=http://192.168.100.185:3000

dev-stop: ## Stop all dev processes (API, web, Flutter) and Docker infra
	@pkill -f "npm run start:dev" 2>/dev/null || true
	@pkill -f "next dev" 2>/dev/null || true
	@pkill -f "flutter run" 2>/dev/null || true
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	docker compose down
	@echo "All dev processes stopped."

# ── Tests ─────────────────────────────────────────────────────────────────────

test: test-api test-web ## Run all tests (API + web)

test-api: ## Run branivo-api unit tests with coverage
	cd branivo-api && npm run test:cov

test-web: ## Run branivo-web component tests
	cd branivo-web && npm test

test-cov: test-api ## Alias for test-api (coverage report)

# ── Linting ───────────────────────────────────────────────────────────────────

lint: lint-api lint-web ## Lint both API and web

lint-api: ## Lint branivo-api (ESLint + auto-fix)
	cd branivo-api && npm run lint

lint-web: ## Lint branivo-web (Next.js ESLint)
	cd branivo-web && npm run lint

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run pending TypeORM migrations
	cd branivo-api && npx typeorm migration:run -d src/infrastructure/database/data-source.ts

migrate-revert: ## Revert last TypeORM migration
	cd branivo-api && npx typeorm migration:revert -d src/infrastructure/database/data-source.ts

seed-reset: ## Force re-seed: removes both demo tenants so SeedService re-inserts on next API restart
	docker exec branivo-postgres psql -U branivo -d branivo_dev -c "DO \$$\
	DECLARE tids UUID[] := ARRAY['aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003']::UUID[];\
	BEGIN\
	  DELETE FROM renewal_notification_log  WHERE tenant_id = ANY(tids);\
	  DELETE FROM tenant_renewal_config     WHERE tenant_id = ANY(tids);\
	  DELETE FROM fleet_pdf_exports         WHERE tenant_id = ANY(tids);\
	  DELETE FROM fleet_vehicles            WHERE tenant_id = ANY(tids);\
	  DELETE FROM shipments                 WHERE tenant_id = ANY(tids);\
	  DELETE FROM ocr_jobs                  WHERE tenant_id = ANY(tids);\
	  DELETE FROM policy_events             WHERE tenant_id = ANY(tids);\
	  DELETE FROM pending_commission_events WHERE tenant_id = ANY(tids);\
	  DELETE FROM policies                  WHERE tenant_id = ANY(tids);\
	  DELETE FROM invoices                  WHERE tenant_id = ANY(tids);\
	  DELETE FROM payments                  WHERE tenant_id = ANY(tids);\
	  DELETE FROM quotes                    WHERE tenant_id = ANY(tids);\
	  DELETE FROM vehicles                  WHERE tenant_id = ANY(tids);\
	  DELETE FROM end_clients               WHERE tenant_id = ANY(tids);\
	  DELETE FROM tenant_invitations        WHERE tenant_id = ANY(tids);\
	  DELETE FROM users                     WHERE tenant_id = ANY(tids);\
	  DELETE FROM system_notifications;\
	  DELETE FROM tenant_domains            WHERE tenant_id = ANY(tids);\
	  DELETE FROM tenant_configs            WHERE tenant_id = ANY(tids);\
	  DELETE FROM tenants                   WHERE id        = ANY(tids);\
	END \$$;"
	@echo "Seed data removed. Restart API to re-seed."

# ── Build ─────────────────────────────────────────────────────────────────────

build: ## Build both API and web for production
	cd branivo-api && npm run build
	cd branivo-web && npm run build

build-api: ## Build branivo-api only
	cd branivo-api && npm run build

build-web: ## Build branivo-web only
	cd branivo-web && npm run build

# ── CI checks (run before PR) ─────────────────────────────────────────────────

ci: lint test build ## Full CI pipeline: lint → test → build

# ── Flutter ───────────────────────────────────────────────────────────────────

flutter-pub-get: ## Install Flutter dependencies
	cd branivo_app && flutter pub get

flutter-test: ## Run Flutter tests
	cd branivo_app && flutter test

flutter-analyze: ## Analyze Flutter code (no fatal infos)
	cd branivo_app && flutter analyze --no-fatal-infos

flutter-run: ## Run Flutter app on physical device (hot reload enabled, no reinstall → no trust prompt)
	cd branivo_app && flutter run -d 00008110-000C75A92139801E --dart-define=API_BASE_URL=http://192.168.100.185:3000

flutter-install: ## Build & install on device without debug session (stable when Xcode debug fails)
	cd branivo_app && flutter build ios --debug --dart-define=API_BASE_URL=http://192.168.100.185:3000 && flutter install -d 00008110-000C75A92139801E

flutter-run-clean: ## Full clean → reinstall (use only after native/pubspec changes — triggers iOS trust prompt once)
	cd branivo_app && flutter clean && flutter pub get && flutter run -d 00008110-000C75A92139801E --dart-define=API_BASE_URL=http://192.168.100.185:3000 --uninstall-first

flutter-clean: ## Clean Flutter build cache only (no run)
	cd branivo_app && flutter clean
# ── Vehicle Catalog (autodata24) ─────────────────────────────────────────────

scrape-vehicles: ## Crawl bg.autodata24.com and save to scripts/output/autodata24-modifications.json
	npm run scrape

import-vehicles: ## Import scripts/output/autodata24-modifications.json into Branivo vehicle catalog
	npm run import

# ── branivo-ocr (Python OCR microservice) ─────────────────────────────────────

ocr: ## Start branivo-ocr container (port 8888 → /ocr/talon)
	docker compose up -d branivo-ocr

ocr-rebuild: ## Rebuild branivo-ocr image and restart
	docker compose build branivo-ocr && docker compose up -d branivo-ocr

ocr-logs: ## Tail branivo-ocr logs
	docker compose logs -f branivo-ocr

ocr-shell: ## Open shell inside running branivo-ocr container
	docker exec -it branivo-ocr bash

ocr-test: ## Run OCR end-to-end accuracy tests (requires branivo-ocr running)
	pip3 install -q -r branivo-ocr/requirements-test.txt
	pytest branivo-ocr/tests/ -v --api-url http://localhost:8888

ocr-test-ci: ## Run OCR tests without installing deps (for CI)
	pytest branivo-ocr/tests/ -v --api-url http://localhost:8888

# ── Web Push / VAPID ─────────────────────────────────────────────────────────

gen-vapid-keys: ## Генерира VAPID keys за web push (еднократно, per environment)
	cd branivo-api && npx web-push generate-vapid-keys

# ── Utilities ─────────────────────────────────────────────────────────────────

kill-stockcrm: ## Stop all StockCRM/DanioDashboard processes
	@pids=$$(pgrep -f "DanioDashboard|stockcrm" 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Stopping StockCRM processes: $$pids"; \
		kill $$pids; \
	else \
		echo "No StockCRM processes running."; \
	fi
