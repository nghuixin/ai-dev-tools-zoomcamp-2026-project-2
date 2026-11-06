#!/usr/bin/env bash
# One-time: the production version of RecordSaveFailing (spec §16), in Cloud Monitoring.
#
# The API writes one JSON log line per request with record_type and outcome (never content).
# A log-based counter turns those lines into a metric, and a PromQL alert policy applies the
# same rule as ops/observability/alerts.yml.
#
#   PROJECT=my-project ALERT_EMAIL=me@example.com bash ops/gcp/setup-monitoring.sh
set -euo pipefail
: "${PROJECT:?set PROJECT}" "${ALERT_EMAIL:?set ALERT_EMAIL}"

gcloud logging metrics create atlas_record_saves --project "$PROJECT" \
  --description="Record saves by type and outcome (Canine Health Atlas)" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="atlas-prod" AND jsonPayload.record_type:*' \
  --config-from-file=<(cat <<'JSON'
{
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      {"key": "type", "valueType": "STRING"},
      {"key": "outcome", "valueType": "STRING"}
    ]
  },
  "labelExtractors": {
    "type": "EXTRACT(jsonPayload.record_type)",
    "outcome": "EXTRACT(jsonPayload.outcome)"
  }
}
JSON
) || echo "metric atlas_record_saves already exists"

CHANNEL="$(gcloud beta monitoring channels create --project "$PROJECT" \
  --display-name="Atlas owner" --type=email --channel-labels="email_address=$ALERT_EMAIL" \
  --format='value(name)')"
# Optional (spec §23): a Pub/Sub channel the on-call poller reads in production.
if [ "${PUBSUB_TOPIC:-}" != "" ]; then
  PUBSUB="$(gcloud beta monitoring channels create --project "$PROJECT" --display-name="Atlas on-call agent" \
    --type=pubsub --channel-labels="topic=projects/$PROJECT/topics/$PUBSUB_TOPIC" --format='value(name)')"
  CHANNEL="$CHANNEL,$PUBSUB"
fi

gcloud alpha monitoring policies create --project "$PROJECT" --policy-from-file=<(cat <<JSON
{
  "displayName": "RecordSaveFailing",
  "documentation": {
    "content": "More than 5% of record saves returned 5xx for over a minute: the owner's care is not being recorded. Mitigate with the rollback workflow if a deploy caused it. Runbook: docs/observability.md#recordsavefailing-runbook",
    "mimeType": "text/markdown"
  },
  "severity": "CRITICAL",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx share of record saves > 5% (2m window, sustained 1m)",
    "conditionPrometheusQueryLanguage": {
      "query": "sum(rate(logging_googleapis_com:user_atlas_record_saves{outcome=\"server_error\"}[2m])) / clamp_min(sum(rate(logging_googleapis_com:user_atlas_record_saves[2m])), 1e-9) > 0.05",
      "duration": "60s",
      "evaluationInterval": "30s"
    }
  }],
  "notificationChannels": [$(echo "$CHANNEL" | sed 's/[^,]*/"&"/g')]
}
JSON
)
echo "Created RecordSaveFailing in $PROJECT"
