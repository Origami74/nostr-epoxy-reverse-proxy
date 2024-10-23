# syntax=docker/dockerfile:1
FROM denoland/deno:latest

WORKDIR /app
COPY . .

RUN deno cache src/index.ts

EXPOSE 8000

ENTRYPOINT [ "deno", "run", "--allow-net", "--allow-env", "--allow-read", "./src/index.ts" ]
