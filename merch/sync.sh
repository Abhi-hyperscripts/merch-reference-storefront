#!/bin/sh
# merch/merch.js is the source of truth. Each template carries its OWN copy so
# that a folder can be uploaded on its own and work — which is the whole point
# of the layout. That means four copies, and four copies drift.
#
#   ./merch/sync.sh          copy the source of truth into every template
#   ./merch/sync.sh --check  fail if any template's copy has drifted
#
# Run the check in CI, or before a release, so an edit made inside a template
# folder cannot quietly become the odd one out.
set -e
cd "$(dirname "$0")/.."
SRC=merch/merch.js
THEMES="grocery jewellery electronic fashion"

if [ "$1" = "--check" ]; then
  rc=0
  for t in $THEMES; do
    if [ ! -f "$t/merch.js" ]; then echo "MISSING  $t/merch.js"; rc=1; continue; fi
    if cmp -s "$SRC" "$t/merch.js"; then echo "ok       $t/merch.js"
    else echo "DRIFTED  $t/merch.js  (diff $SRC $t/merch.js)"; rc=1; fi
  done
  [ $rc -eq 0 ] && echo "every template matches $SRC"
  exit $rc
fi

for t in $THEMES; do cp "$SRC" "$t/merch.js"; echo "updated  $t/merch.js"; done
echo "all templates now carry $SRC"
