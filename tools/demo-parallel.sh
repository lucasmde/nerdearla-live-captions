#!/usr/bin/env bash
# Feeds sample talks into several sessions at once to demo parallel stages.
#   ./tools/demo-parallel.sh [server] [token]
set -e
cd "$(dirname "$0")/.."
SERVER=${1:-ws://localhost:8080}; TOKEN=${2:-$INGEST_TOKEN}
i=0
for s in gran-sala auditorio sala-abasto container-gris; do
  f=demo/talk_en.mp3; [ "$s" = "sala-abasto" ] && f=demo/talk_es.mp3
  node tools/ingest.js --session "$s" --input "$f" --server "$SERVER" ${TOKEN:+--token "$TOKEN"} &
  i=$((i+1))
done
echo "feeding $i sessions in parallel — open $SERVER/ (http) and pick one"
wait
