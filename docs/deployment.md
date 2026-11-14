# Canine Health Atlas: Google Cloud Run + Neon Deployment

**Environment:** Windows 11 + WSL Ubuntu + Conda  
**Google Cloud project:** `canine-health-atlas-ng-2026`  
**Region:** `us-west1`  
**GitHub repository:** `nghuixin/ai-dev-tools-zoomcamp-2026-project-2`

### How to use this guide

- Run everything in your **WSL Ubuntu terminal**, not PowerShell or Git Bash.
- Copy commands one line at a time. Do not add backslashes to join lines.
- Finish each verification checkpoint before proceeding.
- Skip resource-creation commands when the resource already exists.
- Never paste database passwords or connection strings into GitHub source files or chat.

Your target architecture remains:

| Resource | Development | Production |
|---|---|---|
| Cloud Run service | `atlas-dev` | `atlas-prod` |
| Neon branch | `dev` | `main` |
| Database secret | `DATABASE_URL_DEV` | `DATABASE_URL_PROD` |
| Deployment | Automatic on `master` | GitHub approval |
| Data | Demo dog, reseeded | Demo dog, seeded once |

**Privacy requirement:** The public app has no login. Only demo data should be present in either hosted database.

---

## 0. Prepare your WSL terminal

**Why:** Your original Conda Python 3.9 and Ubuntu Python 3.8 were too old for Google Cloud CLI. You've since configured Python 3.11.

Activate the existing Conda environment:

```bash
conda activate gcloud-env
```

Tell `gcloud` to use the environment's Python:

```bash
export CLOUDSDK_PYTHON="$(command -v python)"
```

Verify:

```bash
python --version
gcloud --version
gh auth status
```

A Python 3.11 future-compatibility warning is okay. An `ERROR` is not.

**Set project variables separately:**

```bash
export PROJECT="canine-health-atlas-ng-2026"
export REGION="us-west1"
export REPO="nghuixin/ai-dev-tools-zoomcamp-2026-project-2"
```

Verify:

```bash
echo "$PROJECT"
echo "$REGION"
echo "$REPO"
```

These variables last only for the current terminal session. Re-enter them after opening a new terminal.

### Checkpoint

- [ ] Python 3.11 works
- [ ] `gcloud --version` works
- [ ] GitHub CLI is authenticated
- [ ] All three variables print correctly

---

## 1. Google Cloud project, billing, and APIs

**Why:** Google needs a project to hold all your cloud resources. Cloud Run also requires an active billing account.

Check Google authentication:

```bash
gcloud auth list
```

If no active account is shown:

```bash
gcloud auth login
```

### 1A. Verify or create your project

```bash
gcloud projects describe "$PROJECT"
```

If the project doesn't exist, create it:

```bash
gcloud projects create "$PROJECT" --name="Canine Health Atlas"
```

If the ID is already owned by someone else, choose a different globally unique project ID and update `PROJECT`.

Set the default project:

```bash
gcloud config set project "$PROJECT"
```

Verify:

```bash
gcloud config get-value project
```

You should see:

```text
canine-health-atlas-ng-2026
```

### 1B. Link billing

List billing accounts:

```bash
gcloud billing accounts list
```

Find an account marked as open. Enter its ID when prompted:

```bash
read -r -p "Enter billing account ID: " BILLING_ACCOUNT_ID
```

Link it:

```bash
gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT_ID"
```

Verify:

```bash
gcloud billing projects describe "$PROJECT"
```

Look for `billingEnabled: true`.

If your Google Cloud free trial expired, you must activate a usable billing account before deploying. This does not necessarily mean your demo will incur charges, but it makes charges possible.

Set up a low budget alert in the [Google Cloud Billing console](https://console.cloud.google.com/billing).

### 1C. Enable APIs

Run this complete command on one line:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudtrace.googleapis.com monitoring.googleapis.com logging.googleapis.com pubsub.googleapis.com --project="$PROJECT"
```

Get your project number:

```bash
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
```

Verify:

```bash
echo "$PROJECT_NUMBER"
```

This should display a numeric project identifier, not the project name.

### Checkpoint

- [ ] Project exists
- [ ] Default project is correct
- [ ] Billing is enabled
- [ ] APIs are enabled
- [ ] Project number is available

---

## 2. Create Artifact Registry

**Why:** GitHub Actions needs somewhere to store your app's Docker images before deploying them.

Check whether the registry already exists:

```bash
gcloud artifacts repositories list --project="$PROJECT" --location="$REGION"
```

If `atlas` is absent, create it:

```bash
gcloud artifacts repositories create atlas --project="$PROJECT" --repository-format=docker --location="$REGION" --description="Canine Health Atlas images"
```

Verify:

```bash
gcloud artifacts repositories describe atlas --project="$PROJECT" --location="$REGION"
```

Expected:

```text
Repository: atlas
Format: DOCKER
Location: us-west1
```

If you see `ALREADY_EXISTS`, do not create another repository. Verify the existing one.

### Checkpoint

- [ ] Docker repository `atlas` exists in `us-west1`

---

## 3. Create service accounts

**Why:** Google Cloud should distinguish between the application running and GitHub Actions deploying it.

We need:

- `atlas-runtime`: Identity used by the running application.
- `atlas-deployer`: Identity used by GitHub Actions.

Set their email addresses:

```bash
export RUNTIME_SA="atlas-runtime@$PROJECT.iam.gserviceaccount.com"
export DEPLOY_SA="atlas-deployer@$PROJECT.iam.gserviceaccount.com"
```

### 3A. Runtime identity

Check existing accounts:

```bash
gcloud iam service-accounts list --project="$PROJECT"
```

If `atlas-runtime` is absent:

```bash
gcloud iam service-accounts create atlas-runtime --project="$PROJECT" --display-name="Atlas runtime"
```

Grant runtime permissions using this single-line loop:

```bash
for ROLE in roles/secretmanager.secretAccessor roles/cloudtrace.agent roles/logging.logWriter roles/monitoring.metricWriter; do gcloud projects add-iam-policy-binding "$PROJECT" --role="$ROLE" --member="serviceAccount:$RUNTIME_SA" --condition=None || break; done
```

### 3B. Deployment identity

If `atlas-deployer` is absent:

```bash
gcloud iam service-accounts create atlas-deployer --project="$PROJECT" --display-name="Atlas deployer"
```

Grant deployment permissions:

```bash
for ROLE in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor; do gcloud projects add-iam-policy-binding "$PROJECT" --role="$ROLE" --member="serviceAccount:$DEPLOY_SA" --condition=None || break; done
```

Allow the deployer to run Cloud Run services using the runtime account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT" --role=roles/iam.serviceAccountUser --member="serviceAccount:$DEPLOY_SA"
```

Verify:

```bash
gcloud iam service-accounts list --project="$PROJECT"
```

**Security note:** These commands preserve your original guide's project-level IAM permissions. They are convenient for initial deployment, but broader than strict least privilege. In particular, the runtime and deployer can access both database secrets. Restrict secret permissions further before hosting sensitive or real-world data.

### Checkpoint

- [ ] `atlas-runtime` exists
- [ ] `atlas-deployer` exists
- [ ] Permission commands completed without errors

---

## 4. Connect GitHub Actions securely to Google Cloud

**Why:** GitHub needs permission to deploy your application, but you should not create permanent Google service-account keys.

Workload Identity Federation provides this connection.

### 4A. Create the identity pool

```bash
gcloud iam workload-identity-pools create github --project="$PROJECT" --location=global --display-name="GitHub Actions"
```

If `github` already exists, skip creation.

### 4B. Create the GitHub provider

```bash
gcloud iam workload-identity-pools providers create-oidc github --project="$PROJECT" --location=global --workload-identity-pool=github --display-name="GitHub" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" --attribute-condition="assertion.repository=='$REPO'"
```

This restricts the provider to tokens associated with your GitHub repository.

### 4C. Allow GitHub to impersonate the deployer

Refresh your project number if necessary:

```bash
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
```

Grant access:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --project="$PROJECT" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

Verify the provider:

```bash
gcloud iam workload-identity-pools providers describe github --project="$PROJECT" --location=global --workload-identity-pool=github
```

The provider's status should be active.

GitHub's deployment jobs must also have `id-token: write` permission in their workflow YAML. Verify that this is already configured.

### Checkpoint

- [ ] Workload identity pool exists
- [ ] GitHub OIDC provider exists
- [ ] Deployer account has federation permissions

---

## 5. Create Neon databases

**Why:** Cloud Run runs your application, but Neon provides persistent PostgreSQL storage.

Open the [Neon Console](https://console.neon.tech).

### 5A. Create your Neon project

Create a project named `canine-health-atlas` in a region near `us-west1`.

Set up two branches:

- `main` — production database
- `dev` — development database

Check the default branch name in the Neon console. If it is not `main`, rename or create the required branch according to your deployment scripts.

Both branches should initially contain no real dog records.

### 5B. Get the database connection strings

For each Neon branch:

1. Select the branch.
2. Open **Connect**.
3. Select the pooled connection option.
4. Copy the PostgreSQL connection URL.

A typical URL begins with:

```text
postgresql://...
```

Do not paste real URLs into source code.

### 5C. Store the development URL securely

Run:

```bash
read -r -s -p "Paste Neon DEV URL: " DEV_URL; echo
```

Paste the URL and press Enter. The text will not appear in the terminal.

Create the secret:

```bash
printf '%s' "$DEV_URL" | gcloud secrets create DATABASE_URL_DEV --project="$PROJECT" --replication-policy=automatic --data-file=-
```

Clear the shell variable:

```bash
unset DEV_URL
```

### 5D. Store the production URL

```bash
read -r -s -p "Paste Neon PROD URL: " PROD_URL; echo
```

```bash
printf '%s' "$PROD_URL" | gcloud secrets create DATABASE_URL_PROD --project="$PROJECT" --replication-policy=automatic --data-file=-
```

```bash
unset PROD_URL
```

If a secret already exists, do not run `create` again. To replace its value, use `gcloud secrets versions add SECRET_NAME --data-file=-` with the same secure input method.

Verify secret names without printing their values:

```bash
gcloud secrets list --project="$PROJECT"
```

You should see both `DATABASE_URL_DEV` and `DATABASE_URL_PROD`.

**Migration compatibility:** Your original runbook uses pooled URLs for migrations as well as normal database access. Keep that configuration initially, but if your migration tool reports a pooling or session-state error, check whether it requires a direct Neon connection instead.

### Checkpoint

- [ ] Neon project exists
- [ ] Both database branches exist
- [ ] Both secrets exist in Google Secret Manager
- [ ] No real dog records have been uploaded

---

## 6. Configure GitHub

**Why:** GitHub Actions must know your Google project, region, identity provider, and deployer account.

Confirm GitHub authentication:

```bash
gh auth status
```

Verify the repository and its default branch:

```bash
gh repo view "$REPO" --json visibility,defaultBranchRef
```

Your deployment guide assumes GitHub's default branch is `master`.

### 6A. Configure GitHub variables

Run each command:

```bash
gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT"
```

```bash
gh variable set GCP_REGION --repo "$REPO" --body "$REGION"
```

```bash
gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

```bash
gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$DEPLOY_SA"
```

Verify:

```bash
gh variable list --repo "$REPO"
```

These are configuration variables, not passwords.

### 6B. Create environments

Open your GitHub repository.

Navigate to **Settings → Environments**.

Create `development` with no required reviewers.

Create `production` and configure:

- Required reviewer: your GitHub account
- Deployment branch restriction: `master`
- Prevent self-review: disabled if you must approve your own deployments

**Important:** GitHub Free, Pro, and Team support required reviewers for public repositories, but not private repositories. If your repository is private, your original manual-approval design may require a different plan or deployment mechanism.

### 6C. Protect the `master` branch

Navigate to **Settings → Rules → Rulesets**, or the branch-protection settings available for your repository.

Require pull requests before merging.

Require successful CI checks, using the actual names emitted by your workflow. Your specification lists:

- `backend`
- `frontend`
- `compose`
- `test-all`

Only select names that exist as actual status checks.

### Checkpoint

- [ ] Four GitHub variables exist
- [ ] Development environment exists
- [ ] Production environment exists
- [ ] Production approval rule works with your plan
- [ ] `master` protection is configured

---

## 7. Run the first deployment

**Why:** Everything is now connected, so GitHub should be able to build and deploy the application.

Open your repository in GitHub and select **Actions**.

Find your `ci-cd` workflow.

If the workflow offers **Run workflow**, you can trigger it there. Otherwise, use a new merge to `master` or rerun an eligible existing workflow run.

### 7A. Confirm development succeeds

Check that:

1. Tests pass.
2. The Docker image builds and is uploaded to Artifact Registry.
3. The development database migration succeeds.
4. The demo dog is seeded.
5. `atlas-dev` deploys.
6. The health check passes.

You can retrieve the development URL:

```bash
gcloud run services describe atlas-dev --project="$PROJECT" --region="$REGION" --format='value(status.url)'
```

Open that URL in your browser.

You should see the application with demo data only.

### 7B. Approve production

In the GitHub workflow run, find the production job.

Choose **Review deployments**, select `production`, and approve.

Verify:

1. The production database migration succeeds.
2. The demo dog is seeded if needed.
3. `atlas-prod` deploys.
4. Production health checks succeed.

Retrieve the URL:

```bash
gcloud run services describe atlas-prod --project="$PROJECT" --region="$REGION" --format='value(status.url)'
```

Open it in your browser.

The first production deployment creates the initial service. Later deployments should use your configured candidate-revision and traffic-switching process.

### Checkpoint

- [ ] Development URL works
- [ ] Development database contains only demo data
- [ ] Production approval works
- [ ] Production URL works
- [ ] Production database contains only demo data

---

## 8. Monitoring, billing protection, and rollback

**Why:** Once an application is public, you need to know whether it is healthy and how to recover from a bad deployment.

### 8A. Prepare your local repository

If you haven't cloned it already:

```bash
cd ~
```

```bash
gh repo clone "$REPO"
```

Enter the project folder:

```bash
cd ~/ai-dev-tools-zoomcamp-2026-project-2
```

If you already cloned the repository elsewhere, use that existing folder instead.

Verify the monitoring script exists:

```bash
ls ops/gcp/setup-monitoring.sh
```

### 8B. Configure alerts

Enter an email address:

```bash
read -r -p "Monitoring alert email: " ALERT_EMAIL
```

Run the monitoring script:

```bash
PROJECT="$PROJECT" ALERT_EMAIL="$ALERT_EMAIL" bash ops/gcp/setup-monitoring.sh
```

This is the basic email-alert configuration. Your original runbook also includes an optional Pub/Sub configuration for the on-call agent. Set that up separately if needed; do not run the same monitoring script twice without checking whether its operations are idempotent.

### 8C. Test your rollback instructions

Your repository includes a `rollback` workflow.

To list production revisions:

```bash
gcloud run revisions list --service=atlas-prod --project="$PROJECT" --region="$REGION"
```

To roll back when necessary:

1. Go to GitHub → Actions → `rollback`.
2. Select **Run workflow**.
3. Choose `previous` or enter a known good revision.
4. Approve the production environment.
5. Verify the production URL again.

Rollback restores an earlier application revision, not an earlier database state. Your migrations must remain compatible with the restored revision.

### Checkpoint

- [ ] Alert email configured
- [ ] Billing safeguards reviewed
- [ ] Rollback workflow available
- [ ] You know where to find Cloud Run logs

---

## Troubleshooting reference

| Error | Likely cause | Fix |
|---|---|---|
| Python 3.9 unsupported | Old Conda Python | Activate `gcloud-env` and set `CLOUDSDK_PYTHON` |
| `unrecognized arguments` | Incorrect Bash spacing or escaping | Use the exact one-line command |
| `Failed to find attribute [project]` | No active project selected | Set `PROJECT`, run `gcloud config set project`, or use `--project` |
| `NOT_FOUND` on project | Project is missing or inaccessible | Check `gcloud projects list`, then create if needed |
| `PERMISSION_DENIED` | Wrong Google account or insufficient IAM access | Check `gcloud auth list` and project permissions |
| `billing is disabled` | No active billing linked to the project | Link an active billing account |
| `SERVICE_DISABLED` | API not enabled | Run the Step 1 API command |
| `ALREADY_EXISTS` | Resource already created | Verify and reuse it |
| Workload identity authentication failure | Provider, mapping, permissions, or token configuration mismatch | Check Step 4 and GitHub workflow permissions |
| No production approval button | Environment rule or GitHub plan issue | Check repository visibility and environment settings |
| Database connection failure | Incorrect branch URL, secret, or network connection | Verify Neon branch and secret configuration |
| Cloud Run deployment health check fails | Application startup, port, migration, or connectivity error | Inspect GitHub Actions and Cloud Run logs |

## Final deployment checklist

- [ ] Cloud project and billing ready
- [ ] Artifact Registry created
- [ ] Runtime and deployment identities created
- [ ] GitHub authentication configured
- [ ] Two Neon databases created
- [ ] Two database secrets stored
- [ ] GitHub deployment environments configured
- [ ] Development deployment successful
- [ ] Production deployment successful
- [ ] Alerts and rollback available

**Done means:** A merge to `master` automatically deploys development, and production deployment waits for your GitHub approval. Both hosted environments contain only demo data.
