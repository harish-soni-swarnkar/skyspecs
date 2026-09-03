.PHONY: help install lint typecheck test coverage bootstrap dev up down build

help:
	@echo "install    pnpm install"
	@echo "bootstrap  start Postgres (docker) + run migrations"
	@echo "dev        run API (:4000) + web (:5173)"
	@echo "lint       biome check"
	@echo "typecheck  tsc across all packages"
	@echo "test       unit + integration (integration needs the DB up)"
	@echo "coverage   test with coverage gates"
	@echo "build      build the web app"
	@echo "up / down  docker compose up -d / down"

install:
	pnpm install

bootstrap:
	pnpm bootstrap

dev:
	pnpm dev

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

coverage:
	pnpm test:coverage

build:
	pnpm build

up:
	docker compose up -d

down:
	docker compose down
