<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database migrations

Before writing any SQL migration in `supabase/migrations/` or applying schema changes via MCP, **read [supabase/MIGRATIONS.md](supabase/MIGRATIONS.md)**. It covers the rules that will break the app if ignored — most importantly, the explicit `GRANT` requirement for any table/view/function created after 2026-10-30.
