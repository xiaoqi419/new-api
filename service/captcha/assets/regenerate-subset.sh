#!/usr/bin/env bash
# Regenerate the click-captcha font subset.
#
# The subset must cover exactly the runes in CharacterPool (service/captcha/pool.go).
# If the pool and the subset drift apart, sfnt silently returns glyph index 0 and
# the captcha renders blank boxes, so TestFontCoversPool guards the invariant.
#
# Usage: ./regenerate-subset.sh   (run from this directory)
set -euo pipefail

UPSTREAM='https://cdn.jsdelivr.net/gh/notofonts/noto-cjk/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo '==> extracting the character pool from pool.go'
python3 - > "$WORK/pool.txt" <<'PYEOF'
import re, pathlib
src = pathlib.Path('../pool.go').read_text(encoding='utf-8')
body = src.split('const CharacterPool')[1].split('var poolRunes')[0]
pool = ''.join(re.findall(r'"([^"]*)"', body))
assert pool and '\ufffd' not in pool, 'could not read CharacterPool from pool.go'
print(''.join(sorted(set(pool))), end='')
PYEOF
echo "pool characters: $(python3 -c "print(len(open('$WORK/pool.txt', encoding='utf-8').read()))")"

echo '==> downloading upstream Noto Sans SC (8.3 MB, resumable)'
curl -fL -C - --retry 5 --retry-delay 3 -o "$WORK/noto.otf" "$UPSTREAM"

echo '==> subsetting'
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" -q install fonttools brotli
"$WORK/venv/bin/python" -m fontTools.subset "$WORK/noto.otf" \
  --text-file="$WORK/pool.txt" \
  --output-file=NotoSansSC-captcha-subset.otf \
  --layout-features='' --no-hinting --desubroutinize \
  --drop-tables+=DSIG,BASE,VORG,GDEF,GPOS,GSUB \
  --name-IDs='0,1,2,3,5,6,13,14' --notdef-outline --recalc-bounds

ls -l NotoSansSC-captcha-subset.otf
echo '==> verifying coverage'
cd ../../.. && go test ./service/captcha/ -run TestFontCoversPool -v
