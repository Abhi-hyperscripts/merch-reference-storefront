#!/bin/sh
# `node --check merch.js` lazily parses function bodies and PASSES a duplicate
# `const` inside one. Checking a .mjs copy parses it as a real module and
# catches it. Use this, never `node --check merch.js`.
cp merch.js /tmp/_merch_check.mjs && node --check /tmp/_merch_check.mjs && echo "merch.js parses clean" ; rc=$?; rm -f /tmp/_merch_check.mjs; exit $rc
