# Deployment: Google Cloud Run + Neon

How the app reaches a public URL (spec §13–14). This is a **one-time setup by the owner**; after it, every merge to `master` deploys to dev automatically, and production waits for your approval in GitHub.

| | Dev | Production |
|---|---|---|
| Cloud Run service | `atlas-dev` | `atlas-prod` |
| Neon branch | `dev` | `main` |
| Secret with the database URL | `DATABASE_URL_DEV` | `DATABASE_URL_PROD` |
| Data | Demo dog, reseeded on every deploy | Demo dog only (seeded once) |
| Deployed by | CI, automatically on `master` | CI, after you approve the `production` environment |

> **Privacy:** there is no login, so a public deployment must only ever hold the demo dog. Keep your own dog's records in a local run (`make up`).

## What you need

- A Google account with a billing account (Cloud Run requires one even inside the free tier; this setup stays within it at demo traffic).
- A [Neon](https://neon.tech) account (free plan is enough).
- The [gcloud CLI](https://cloud.google.com/sdk/docs/install) and the GitHub CLI (`gh`, already logged in).

Pick the names once and reuse them below. Run the commands in Git Bash or Cloud Shell:

```bash
PROJECT=canine-health-atlas-<something-unique>   # GCP project IDs are global
REGION=us-west1                                  # Cloud Run region close to you (spec §23)
REPO=nghuixin/ai-dev-tools-zoomcamp-2026-project-2
```

## 1. Google Cloud project and APIs

```bash
gcloud auth login
gcloud projects create "$PROJECT" --name="Canine Health Atlas"
gcloud billing accounts list                      # copy your billing account ID
gcloud billing projects link "$PROJECT" --billing-account=<BILLING_ACCOUNT_ID>
gcloud config set project "$PROJECT"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudtrace.googleapis.com monitoring.googleapis.com \
  logging.googleapis.com pubsub.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
```

Optional but recommended: a budget alert at a few dollars (Billing → Budgets & alerts).

## 2. Image registry

```bash
gcloud artifacts repositories create atlas --repository-format=docker --location="$REGION" \
  --description="Canine Health Atlas images"
```

CI pushes `REGION-docker.pkg.dev/PROJECT/atlas/atlas:<commit sha>`. One image is built per commit and the same image goes to dev and then to production.

## 3. Service accounts

Two identities, each with only what it needs:

```bash
# Runs the app on Cloud Run: reads its database secret, writes traces, logs and metrics.
gcloud iam service-accounts create atlas-runtime --display-name="Atlas runtime"
for role in roles/secretmanager.secretAccessor roles/cloudtrace.agent roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --role="$role" \
    --member="serviceAccount:atlas-runtime@$PROJECT.iam.gserviceaccount.com" --condition=None
done

# Used by GitHub Actions: pushes images, deploys, reads the database URLs to run migrations.
gcloud iam service-accounts create atlas-deployer --display-name="Atlas deployer (GitHub Actions)"
for role in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" --role="$role" \
    --member="serviceAccount:atlas-deployer@$PROJECT.iam.gserviceaccount.com" --condition=None
done
# The deployer may run services as the runtime account (and only that account).
gcloud iam service-accounts add-iam-policy-binding "atlas-runtime@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:atlas-deployer@$PROJECT.iam.gserviceaccount.com"
```

## 4. Let GitHub Actions sign in without keys (Workload Identity Federation)

No service-account key ever leaves Google. GitHub proves which repository is calling, and only this repository may act as the deployer:

```bash
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github --location=global \
  --workload-identity-pool=github --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO'"

gcloud iam service-accounts add-iam-policy-binding "atlas-deployer@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

## 5. Neon database

1. In the Neon console, create a project (e.g. `canine-health-atlas`) in the region **closest to your Cloud Run region** (spec §23). The default branch is `main`: that is production.
2. Create a branch `dev` from `main`.
3. For each branch, open **Connect**, choose the **pooled** connection, and copy the URL. It looks like `postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`.
4. Store both in Secret Manager. Paste the URL when prompted, so it never lands in your shell history:

```bash
read -rs DEV_URL  && printf %s "$DEV_URL"  | gcloud secrets create DATABASE_URL_DEV  --data-file=- && unset DEV_URL
read -rs PROD_URL && printf %s "$PROD_URL" | gcloud secrets create DATABASE_URL_PROD --data-file=- && unset PROD_URL
```

Neon suspends idle databases and Cloud Run scales to zero, so the first request after a quiet spell takes a few seconds. That is expected.

## 6. GitHub settings

```bash
gh variable set GCP_PROJECT_ID   --repo "$REPO" --body "$PROJECT"
gh variable set GCP_REGION       --repo "$REPO" --body "$REGION"
gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
gh variable set GCP_DEPLOY_SA    --repo "$REPO" --body "atlas-deployer@$PROJECT.iam.gserviceaccount.com"
```

These are variables, not secrets: none of them grants access on its own.

Then in **GitHub → Settings**:

1. **Environments → New environment `development`.** No rules needed.
2. **Environments → New environment `production`.** Tick **Required reviewers** and add yourself. Under *Deployment branches*, allow `master` only. This is the manual approval gate (and it also guards the `rollback` workflow).
3. **Branches → Add rule for `master`:** require a pull request before merging, and require the `backend`, `frontend`, `compose` and `test-all` checks to pass. This is also the server-side guard that stops the on-call agent from ever pushing to `master` (docs/permissions.md).

Until the four variables exist, CI runs the tests and skips the deploy jobs, so nothing breaks before setup.

## 7. First deploy

Merge anything to `master` (or re-run the latest `ci-cd` run). Then:

1. `build` pushes the image, and `deploy-dev` migrates and reseeds the Neon `dev` branch, deploys `atlas-dev` and health-checks it. Its URL is shown on the run page.
2. `deploy-prod` waits. Open the run, click **Review deployments**, approve `production`.
3. Production migrates the Neon `main` branch, seeds the demo dog if the database is empty, deploys a **candidate revision with no traffic**, health-checks the candidate URL, and only then moves 100% of traffic to it. If the health check fails, traffic stays on the previous revision and the job fails.

The first production deploy skips the no-traffic step (Cloud Run can't create a service without traffic); every later one uses it.

## 8. Alerting in production

After the first production deploy, create the log-based metric and the `RecordSaveFailing` policy (spec §16):

```bash
PROJECT="$PROJECT" ALERT_EMAIL=you@example.com bash ops/gcp/setup-monitoring.sh
# Optional, for the on-call agent in production (spec §23):
gcloud pubsub topics create atlas-alerts
gcloud pubsub subscriptions create atlas-alerts-oncall --topic=atlas-alerts
gcloud pubsub topics add-iam-policy-binding atlas-alerts --role=roles/pubsub.publisher \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-monitoring-notification.iam.gserviceaccount.com"
PROJECT="$PROJECT" ALERT_EMAIL=you@example.com PUBSUB_TOPIC=atlas-alerts bash ops/gcp/setup-monitoring.sh
```

## Rollback

If production misbehaves after a deploy: **Actions → rollback → Run workflow**. Leave the input as `previous`, or paste a revision name from `gcloud run revisions list --service atlas-prod --region "$REGION"`. After your approval it moves all traffic back in seconds, with no rebuild. Migrations are kept backward compatible (spec §6), so the older revision works against the newer schema.

## Costs, roughly

At demo traffic everything stays inside the free tiers: Cloud Run (min instances 0, max 2), Artifact Registry (0.5 GB free; delete old images now and then), Secret Manager, Cloud Logging/Trace/Monitoring, and Neon's free plan.

## Tearing it down

`gcloud projects delete "$PROJECT"` removes everything on Google Cloud. Delete the Neon project from its console.
