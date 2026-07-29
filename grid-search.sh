#!/bin/bash
# Busca comprehensive com grid scraping (cobre toda a área, não só um setor)
# Uso: ./grid-search.sh <palavra-chave> <lat> <lon> <raio_km>
# Ex:  ./grid-search.sh "advocacia" -16.6816 -49.2554 8

KEYWORD="$1"
LAT="$2"
LON="$3"
RADIUS_KM="${4:-8}"

if [ -z "$KEYWORD" ] || [ -z "$LAT" ] || [ -z "$LON" ]; then
  echo "Uso: $0 <palavra-chave> <lat> <lon> <raio_km>"
  echo "Ex:  $0 \"advocacia\" -16.6816 -49.2554 8"
  exit 1
fi

KM_PER_DEG=111.32
LAT_RAD=$(echo "$LAT * 3.14159 / 180" | bc -l 2>/dev/null || echo "0")
LON_KM_PER_DEG=$(echo "$KM_PER_DEG * c($LAT_RAD)" | bc -l 2>/dev/null || echo "$KM_PER_DEG")
if [ "$LON_KM_PER_DEG" = "0" ] || [ -z "$LON_KM_PER_DEG" ]; then
  LON_KM_PER_DEG=$KM_PER_DEG
fi

DELTA_LAT=$(echo "scale=6; $RADIUS_KM / $KM_PER_DEG" | bc -l 2>/dev/null || echo "0.072")
DELTA_LON=$(echo "scale=6; $RADIUS_KM / $LON_KM_PER_DEG" | bc -l 2>/dev/null || echo "0.075")

MIN_LAT=$(echo "scale=6; $LAT - $DELTA_LAT" | bc -l)
MAX_LAT=$(echo "scale=6; $LAT + $DELTA_LAT" | bc -l)
MIN_LON=$(echo "scale=6; $LON - $DELTA_LON" | bc -l)
MAX_LON=$(echo "scale=6; $LON + $DELTA_LON" | bc -l)

BBOX="$MIN_LAT,$MIN_LON,$MAX_LAT,$MAX_LON"
echo "Bounding box: $BBOX"
echo "Grid cell: 2km"
echo ""

echo "$KEYWORD" > /tmp/gms_query.txt
RESULTS="/tmp/gms_results_$(date +%s).csv"

~/go/bin/google-maps-scraper \
  -input /tmp/gms_query.txt \
  -results "$RESULTS" \
  -grid-bbox "$BBOX" \
  -grid-cell 2 \
  -lang pt \
  -c 2 \
  -depth 2

echo ""
echo "=== Resultados salvos em: $RESULTS ==="
wc -l "$RESULTS" 2>/dev/null
echo "Para abrir no app, use a planilha de leads (botão importar)"
