#!/bin/sh
# Menjalankan uji Paddoc Host.
#   sh tests/run.sh            semua: logika, mode demo, browser
#   sh tests/run.sh unit       logika saja (cepat, tanpa browser/server)
#   sh tests/run.sh e2e [pola] uji browser, mis. "sh tests/run.sh e2e power" hanya 11-power-cup
#   sh tests/run.sh demo       mode demo (index.html tanpa server)
# Hasil (screenshot, video podium, log server) di $PADDOC_TEST_OUT (bawaan /tmp/paddoc-tests, di luar repo). Keluar dengan kode 1 bila ada yang gagal.
T=$(cd "$(dirname "$0")" && pwd); OUT=${PADDOC_TEST_OUT:-${TMPDIR:-/tmp}/paddoc-tests}; export PADDOC_TEST_OUT=$OUT; mkdir -p "$OUT"
export NODE_PATH="$T/node_modules:${NODE_PATH:-}:$(npm root -g 2>/dev/null)"
WHAT=${1:-all}; PAT=${2:-}
PASS=0; FAIL=0; BAD=""
run() { # $1 file
  name=$(basename "$1" .js); log="$OUT/$name.txt"
  (cd "$T" && timeout 900 node "$1" > "$log" 2>&1); code=$?
  p=$(grep -c '✓' "$log"); f=$(grep -c '✗' "$log")
  [ $code -ne 0 ] && [ "$f" -eq 0 ] && f=1
  PASS=$((PASS + p)); FAIL=$((FAIL + f))
  if [ "$f" -gt 0 ]; then BAD="$BAD $name"; echo "✗ $name: $p lulus, $f gagal (lihat $OUT/$name.txt)"; else echo "✓ $name: $p lulus"; fi
}
if [ "$WHAT" = all ] || [ "$WHAT" = unit ]; then echo "• uji logika"; for f in "$T"/unit/*.js; do run "$f"; done; fi
if [ "$WHAT" = all ] || [ "$WHAT" = demo ]; then echo "• mode demo"; for f in "$T"/demo/*.js; do run "$f"; done; fi
if [ "$WHAT" = all ] || [ "$WHAT" = e2e ]; then
  echo "• uji browser (server uji dinyalakan ulang sebelum tiap file)"
  for f in "$T"/e2e/*.js; do
    case "$(basename "$f")" in *"$PAT"*) ;; *) continue ;; esac
    sh "$T/server.sh" > /dev/null || { echo "✗ server uji tidak menyala"; FAIL=$((FAIL + 1)); break; }
    run "$f"
  done
  for p in $(ps -eo pid,args | grep -E "[w]orkerd serve|[w]rangler[^ ]* dev --port 8789|[n]ode [^ ]*tests/mock/" | awk '{print $1}'); do kill "$p" 2>/dev/null; done
fi
echo "Total: $PASS lulus, $FAIL gagal${BAD:+ —$BAD}"
[ "$FAIL" -eq 0 ]
