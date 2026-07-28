#!/bin/sh

set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo '未找到 Docker，请先在 ECS 上安装 Docker Engine。' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo '未找到 Docker Compose 插件，请先安装 docker-compose-plugin。' >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.docker.example .env
  echo '已根据 .env.docker.example 创建 .env。'
  echo '请先填写 NEXT_PUBLIC_SITE_URL，然后再次执行 sh deploy-ecs.sh。' >&2
  exit 1
fi

docker compose up --detach --build --remove-orphans
docker compose ps
