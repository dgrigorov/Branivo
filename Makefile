# ─────────────────────────────────────────────────────────────────────────────
# Branivo — Developer Makefile
# Usage: make <target>
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help \
        up down restart logs \
        api web \
        test test-api test-web test-cov \
        lint lint-api lint-web \
        migrate build \
        kill-stockcrm \
        status \
        flutter-pub-get flutter-test flutter-analyze

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

seed-reset: ## Force re-seed: removes demo tenant so SeedService re-inserts on next API restart
	docker exec branivo-postgres psql -U branivo -d branivo_dev \
	  -c "DELETE FROM users WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';" \
	  -c "DELETE FROM tenant_domains WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';" \
	  -c "DELETE FROM tenant_configs WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';" \
	  -c "DELETE FROM tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';"
	@echo "Demo data removed. Restart API to re-seed."

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

# ── Utilities ─────────────────────────────────────────────────────────────────

kill-stockcrm: ## Stop all StockCRM/DanioDashboard processes
	@pids=$$(pgrep -f "DanioDashboard|stockcrm" 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Stopping StockCRM processes: $$pids"; \
		kill $$pids; \
	else \
		echo "No StockCRM processes running."; \
	fi
