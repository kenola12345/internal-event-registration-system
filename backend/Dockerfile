# バックエンド(Express + Prisma)の開発用イメージ。ビルドコンテキストはリポジトリのルート。
# ソースは docker-compose.yml でボリュームマウントするため、ここでは依存関係だけを入れる。
FROM node:24

WORKDIR /app

# npm workspaces のため、ルートと各ワークスペースの package.json をすべてコピーしてから npm ci する
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# backend の postinstall(prisma generate)がスキーマと設定を読むため、先にコピーする
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/

# prisma.config.ts は DATABASE_URL を必須にしているが、generate 自体は DB に接続しないのでダミー値で足りる
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --no-audit --no-fund

WORKDIR /app/backend

EXPOSE 3000
