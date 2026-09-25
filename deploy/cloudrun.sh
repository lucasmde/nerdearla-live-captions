#!/usr/bin/env bash
# Deploy to Google Cloud Run in one command (needs gcloud and a project with billing).
#   GEMINI_API_KEY=... ./deploy/cloudrun.sh my-project southamerica-east1
set -euo pipefail
PROJECT=${1:?project id}; REGION=${2:-southamerica-east1}; SVC=live-captions
gcloud run deploy "$SVC" --source . --project "$PROJECT" --region "$REGION" --allow-unauthenticated \
  --min-instances 1 --max-instances 3 --cpu 1 --memory 512Mi --session-affinity --timeout 3600 \
  --set-env-vars "ENGINE=gemini,GEMINI_API_KEY=${GEMINI_API_KEY:?},INGEST_TOKEN=${INGEST_TOKEN:-$(openssl rand -hex 12)}"
URL=$(gcloud run services describe "$SVC" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
gcloud run services update "$SVC" --project "$PROJECT" --region "$REGION" --update-env-vars "PUBLIC_URL=$URL" >/dev/null
echo "Live at $URL"
