#!/bin/bash
# test_fx_b1 20连跑稳定性验证(AUDIT#21 防随机抖动回潮)
cd "$(dirname "$0")/.."
FAIL=0
for i in $(seq 1 20); do
  node tools/test_fx_b1.js > /dev/null 2>&1 || { echo "RUN $i FAIL"; FAIL=1; }
done
[ "$FAIL" = 0 ] && echo "20连跑全绿"
exit $FAIL
