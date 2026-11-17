# Deploy ILAMED Taskflow with Coolify

This repository includes a Node.js 24 Dockerfile. It builds Next.js without
production database credentials, runs `prisma migrate deploy` when the container
starts, and then serves the app on `0.0.0.0:3000` as a non-root user. Coolify
manages the container, reverse proxy, and HTTPS.

## 1. Push the deployment files

Commit and push the Dockerfile, `.dockerignore`, health endpoint, and this guide
to the branch you want Coolify to deploy in:

`https://github.com/DEVILAMED/ILAMED-TASKFLOW.git`

## 2. Create PostgreSQL in Coolify

1. Open your Coolify project and production environment.
2. Select **New Resource → PostgreSQL**.
3. Choose the VPS and Docker destination network that will also run the app.
4. Use a standard PostgreSQL image, for example PostgreSQL 17. Set the initial
   database to `taskflow` and keep a strong generated password.
5. Start the database and wait until it is healthy.
6. Copy **Postgres URL (internal)** for the app's `DATABASE_URL`. Enter it directly
   in Coolify; keep it out of Git. Keep database public access disabled.

A new database starts empty. Startup migrations create the schema, but do not
copy accounts or tasks from your development database. Configure scheduled
database backups in Coolify before storing important data.

## 3. Add the application

In the same project and environment, choose **New Resource** and a Git repository
source. For a private repository, connect a GitHub App with access to this
repository or configure a read-only deploy key.

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/DEVILAMED/ILAMED-TASKFLOW.git` |
| Branch | The branch containing these deployment files |
| Build pack / Build strategy | `Dockerfile` |
| Base directory | `/` |
| Dockerfile location | `/Dockerfile` |
| Build stage target | Leave empty to use the final `runtime` stage |
| Ports exposes | `3000` |
| Host port mappings | Leave empty; Coolify's proxy routes to port 3000 |
| Install / build / start overrides | Leave empty; the Dockerfile handles them |

Use the same destination network as PostgreSQL so its internal hostname resolves.
In versions that offer **Build arguments → Managed manually in Dockerfile**, use
that setting. The image does not need production build arguments.

## 4. Configure runtime environment variables

Open **Environment Variables** and add:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@DATABASE_CONTAINER:5432/taskflow
PG_CONNECTION_TIMEOUT_MS=15000
PG_POOL_MAX=1
```

Replace the entire example database URL with Coolify's internal connection URL.
For each variable, enable **Available at Runtime** and disable **Available at
Buildtime**. Set secret values as literal values if they contain `$` characters.

The Dockerfile already sets `NODE_ENV=production`, `PORT=3000`, and
`NEXT_TELEMETRY_DISABLED=1`. Production secrets belong only in Coolify's runtime
configuration. The build uses a placeholder URL and does not connect to the
production database. Sentry source-map upload credentials are not required for
this deployment; runtime error reporting remains configured in the application.

## 5. Connect a domain and deploy

1. Create an **A** DNS record for your app domain or subdomain pointing to the
   VPS IPv4 address. Add an **AAAA** record only if the VPS has working IPv6.
2. In the application's **Domains** settings (or the Domains field in older
   versions), add `https://tasks.example.com` and select internal port `3000`.
3. Allow inbound HTTP and HTTPS traffic on ports `80` and `443` in the VPS
   firewall. Coolify's proxy handles the certificate.
4. Save the settings and select **Deploy**.
5. Check the deployment and application logs. Migrations must complete before
   Next.js starts. Do not add another migration command to the build or a
   pre-deployment hook; startup already applies the pending migrations.

Authentication uses secure cookies in production, so use the HTTPS app URL when
testing registration and login.

## 6. Health check and first administrator

The image includes a health check for `GET /api/health`, which returns HTTP 200
with `{"status":"ok"}` once Next.js is running. This checks the application
process; it does not query PostgreSQL. Verify registration and login separately
to check the database connection.

Leave Coolify's dashboard health check disabled to use the Dockerfile check. If
you enable a dashboard HTTP check instead, use port `3000`, path `/api/health`,
method `GET`, expected status `200`, and a start period of at least `120` seconds.

Normal registration creates an employee account. To create the first admin:

1. Add these runtime-only variables and redeploy:

   ```dotenv
   ADMIN_EMAIL=admin@example.com
   ADMIN_BOOTSTRAP_TOKEN=REPLACE_WITH_A_LONG_RANDOM_SECRET
   ```

2. On a trusted computer, run the following in PowerShell. Use an email address
   that has not already registered. The password must have at least 12 characters
   and include uppercase, lowercase, a number, and a symbol.

   ```powershell
   $adminPassword = Read-Host "New administrator password" -AsSecureString
   $bootstrapToken = Read-Host "Admin bootstrap token from Coolify" -AsSecureString
   $body = @{
     name = "Administrator"
     email = "admin@example.com"
     password = [System.Net.NetworkCredential]::new("", $adminPassword).Password
     adminSetupToken = [System.Net.NetworkCredential]::new("", $bootstrapToken).Password
   } | ConvertTo-Json
   Invoke-RestMethod -Uri "https://tasks.example.com/api/auth/register" `
     -Method Post -ContentType "application/json" -Body $body
   Remove-Variable body, adminPassword, bootstrapToken
   ```

   Replace the email and URL with your actual values. Enter the bootstrap token
   through the prompt, rather than including it in the command history.

3. Remove `ADMIN_BOOTSTRAP_TOKEN` from Coolify and redeploy after the account has
   been created. Sign in through the app to open the administrator workspace.

For later deployments, push your changes and deploy the new commit. Migrations
run before startup each time. For rolling updates, keep schema changes compatible
with the previous app version until its container has stopped. Database changes
are not reverted by an application image rollback.

## Task completion images

The `20261117133000_add_task_submission_images` migration adds optional private
images to task submissions. The Dockerfile applies it automatically on startup.
Employees can attach up to five JPEG, PNG, or WebP images, 5 MB each. The app
re-encodes and resizes images before storing them in PostgreSQL, so no upload
directory, persistent app volume, or additional storage credentials are required.
Include the image table in database backups and monitor database disk usage.

If you configure an additional proxy or CDN with a request-body limit, allow
at least 26 MiB for this app's multipart task submissions. The application enforces
its own upload and per-image limits.

## References

- [Coolify Dockerfile deployments](https://coolify.io/docs/applications/builds/dockerfile)
- [Coolify PostgreSQL](https://coolify.io/docs/databases/postgresql)
- [Coolify environment variables](https://coolify.io/docs/applications/configuration/environment-variables)
- [Coolify health checks](https://coolify.io/docs/applications/configuration/health-checks)
