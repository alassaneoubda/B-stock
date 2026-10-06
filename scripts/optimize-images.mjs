// B-Stock — recompression des images publiques (à relancer quand on en ajoute).
//
//   node scripts/optimize-images.mjs
//
// Les photos sont redimensionnées (largeur max 1920 px) et recompressées en
// JPEG progressif ; le logo est ramené à 512 px. Les fichiers sont réécrits en
// place (mêmes noms) et seulement si le résultat est plus léger.
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next')] }))

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images')

const jobs = [
  ...['landing-consignes', 'landing-equipe', 'landing-gerant', 'landing-hero-depot', 'landing-livraison'].map(
    (name) => ({ file: `landing/${name}.jpg`, run: (img) => img.resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 72, progressive: true, mozjpeg: true }) })
  ),
  { file: 'b-stock-logo.png', run: (img) => img.resize({ width: 512, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 85 }) },
  { file: 'presentation.png', run: (img) => img.resize({ width: 1600, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 80 }) },
]

for (const { file, run } of jobs) {
  const path = join(root, file)
  const before = statSync(path).size
  const output = await run(sharp(readFileSync(path))).toBuffer()
  if (output.length < before) {
    writeFileSync(path, output)
    console.log(`${file}: ${(before / 1024).toFixed(0)} Ko → ${(output.length / 1024).toFixed(0)} Ko`)
  } else {
    console.log(`${file}: déjà optimisé (${(before / 1024).toFixed(0)} Ko)`)
  }
}
