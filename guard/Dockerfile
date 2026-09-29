# dlprevent-guard: build from the repository root,
#   docker build -f guard/Dockerfile -t dlprevent-guard .
# Only upstream's engine and the guard go in — no dashboard, no Supabase.
FROM denoland/deno:2.9.7
WORKDIR /app
COPY supabase/functions/_shared/ supabase/functions/_shared/
COPY guard/deno.json guard/server.ts guard/agent_rules.ts guard/
WORKDIR /app/guard
# Everything the engine imports is fetched now, at build time; the running
# container reaches nothing but the model provider.
RUN deno cache server.ts
# Inside the container every interface; compose publishes it on 127.0.0.1.
ENV GUARD_HOST=0.0.0.0
EXPOSE 8787
CMD ["deno", "run", "--cached-only", "--allow-net", "--allow-env", "--allow-read=/app,/deno-dir,/etc/dlprevent-guard", "--allow-write=/var/log/dlprevent-guard", "server.ts"]
