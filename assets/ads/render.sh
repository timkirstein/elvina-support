#!/bin/bash
# Renderar annonsbilder från src/ad.html med Chrome (headless). Kör från assets/ads/.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
D="$(cd "$(dirname "$0")" && pwd)"
render(){ # motiv format bredd höjd filnamn
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=$3,$4 --virtual-time-budget=6000 \
    --screenshot="$D/$5" "file://$D/src/ad.html?m=$1&f=$2" >/dev/null 2>&1
}
for m in A B C D E F G; do
  render $m wide 1200 628  "gave-$m-1200x628.png"
  render $m sq   1200 1200 "gave-$m-1200x1200.png"
  render $m port 960  1200 "gave-$m-960x1200.png"
done
