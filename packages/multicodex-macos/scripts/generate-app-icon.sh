#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
appiconset_dir="${1:-${root_dir}/Assets/AppIcon.appiconset}"
out_icns="${2:-${root_dir}/Assets/AppIcon.icns}"
svg_path="${appiconset_dir}/icon-master.svg"

if [[ ! -d "${appiconset_dir}" ]]; then
  echo "App icon set directory not found: ${appiconset_dir}" >&2
  exit 1
fi

if [[ ! -f "${svg_path}" ]]; then
  echo "App icon SVG source not found: ${svg_path}" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick is required (missing 'magick' command)." >&2
  exit 1
fi

if ! command -v iconutil >/dev/null 2>&1; then
  echo "macOS iconutil is required (missing 'iconutil' command)." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
iconset_dir="${tmp_dir}/AppIcon.iconset"
master_png="${tmp_dir}/icon_1024x1024.png"

cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

mkdir -p "${iconset_dir}"
mkdir -p "${appiconset_dir}"

magick -background none -density 512 "${svg_path}" -resize 1024x1024 "${master_png}"

for size in 16 32 128 256 512; do
  filename="icon_${size}x${size}.png"
  retina_filename="icon_${size}x${size}@2x.png"

  magick "${master_png}" -resize "${size}x${size}" "${appiconset_dir}/${filename}"
  magick "${master_png}" -resize "$((size * 2))x$((size * 2))" "${appiconset_dir}/${retina_filename}"

  cp "${appiconset_dir}/${filename}" "${iconset_dir}/${filename}"
  cp "${appiconset_dir}/${retina_filename}" "${iconset_dir}/${retina_filename}"
done

mkdir -p "$(dirname "${out_icns}")"
iconutil -c icns "${iconset_dir}" -o "${out_icns}"
echo "Generated ${out_icns} from ${svg_path}"
