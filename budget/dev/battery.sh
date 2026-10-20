#!/bin/bash
# The parity battery: the books day by day and random tapping in lockstep, on the sample data, a fresh setup and
# every saved-data file given. Three jobs at a time; one line per job in $OUT/summary.txt.
# Usage: OUT=dir bash battery.sh data1.json data2.json ...   (env: DAYS, STEPS, SEEDS)
cd "$(dirname "$0")"
OUT=${OUT:-/tmp/parity}; mkdir -p $OUT; : > $OUT/summary.txt
DAYS=${DAYS:-45}; STEPS=${STEPS:-150}; SEEDS=${SEEDS:-"1 2"}
jobs=()
for s in $SEEDS; do
  jobs+=("REDUCED=1 node sim.js demo $DAYS $s" "node sim.js demo $DAYS $((s+10))" "node fuzz.js demo $STEPS $s" "node fuzz.js setup $STEPS $s" "MOTION=1 node fuzz.js demo $STEPS $((s+20))")
  for f in "$@"; do jobs+=("REDUCED=1 node sim.js $f $DAYS $s" "node fuzz.js $f $STEPS $s"); done
done
run() { local n=$1; shift; local log=$OUT/job$n.log; ( eval "timeout 2400 env $*" ) > $log 2>&1; echo "rc=$? | $* | $(grep -v 'proxy\|^- \|For details' $log | tail -1 | cut -c1-200)" >> $OUT/summary.txt; }
n=0; for j in "${jobs[@]}"; do n=$((n+1)); run $n "$j" & while [ $(jobs -r | wc -l) -ge ${PAR:-3} ]; do sleep 1; done; done; wait
echo done >> $OUT/summary.txt
