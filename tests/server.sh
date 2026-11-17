#!/bin/sh
# Menyalakan server uji dengan data kosong: wrangler dev di port 8789, OpenAI tiruan (9911), pencarian alamat tiruan (9912).
# Dipanggil run.sh sebelum setiap uji browser. Data uji disimpan di $PADDOC_TEST_OUT/state (bawaan /tmp/paddoc-tests, di luar repo) (dihapus setiap kali).
T=$(cd "$(dirname "$0")" && pwd); ROOT=$(dirname "$T"); OUT=${PADDOC_TEST_OUT:-${TMPDIR:-/tmp}/paddoc-tests}; export PADDOC_TEST_OUT=$OUT
mkdir -p "$OUT"
for p in $(ps -eo pid,args | grep -E "[w]orkerd serve|[w]rangler[^ ]* dev --port 8789|[n]ode [^ ]*tests/mock/" | awk '{print $1}'); do kill "$p" 2>/dev/null; done
sleep 1
rm -rf "$OUT/state" "$OUT/openai.log"
WR="$T/node_modules/.bin/wrangler"; [ -x "$WR" ] || WR="npx --yes wrangler@4"
(nohup node "$T/mock/openai.mjs" "$T/fixtures/pro.jpg" "$T/fixtures/chibi.webp" "$OUT/openai.log" > "$OUT/mock-openai.txt" 2>&1 &)
(nohup node "$T/mock/nominatim.mjs" > "$OUT/mock-geo.txt" 2>&1 &)
cd "$ROOT" && (nohup $WR dev --port 8789 --ip 127.0.0.1 --persist-to "$OUT/state" --var APP_PIN:2468 --var OPENAI_API_KEY:sk-test \
  --var OPENAI_BASE_URL:http://127.0.0.1:9911/v1 --var NOMINATIM_URL:http://127.0.0.1:9912 > "$OUT/wrangler.txt" 2>&1 &)
for i in $(seq 1 60); do
  curl -s -m 2 -X POST http://127.0.0.1:8789/api -d '{"fn":"status","req":{}}' | grep -q '"ok":true' && { echo "server uji siap"; exit 0; }
  sleep 1
done
echo "server uji gagal menyala, lihat $OUT/wrangler.txt"; exit 1
