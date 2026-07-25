const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8070;
const VENDOR_DIR = path.join(__dirname, 'vendor');

/* ---------------------------------------------------------------------------
   ffmpeg.wasm 0.12 spawns a helper worker (814.ffmpeg.js) that lives next to
   ffmpeg.js, then that worker importScripts() the core. A Worker cannot be
   built from a cross-origin URL, and the blob: workaround makes importScripts
   fail inside the sandbox. The configuration that actually works is the boring
   one: serve every ffmpeg file from this origin.

   These are fetched once and cached on disk. Commit ./vendor to your repo and
   the hosted build works the same way, offline included.
--------------------------------------------------------------------------- */
const VENDOR = [
  ['ffmpeg.js',        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js'],
  ['814.ffmpeg.js',    'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js'],
  ['ffmpeg-util.js',   'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js'],
  ['ffmpeg-core.js',   'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js'],
  ['ffmpeg-core.wasm', 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm'],
  ['tf.min.js',        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'],
  // Modern nsfwjs bundles the detection models INSIDE the package, so load()
  // needs no network at all. 2.4.2 did not — it chased an S3 bucket that now
  // returns 403. New filename so an existing 2.4.2 copy cannot shadow it.
  ['nsfwjs.bundle.js', 'https://cdn.jsdelivr.net/npm/nsfwjs/dist/nsfwjs.min.js'],
  ['nsfwjs.min.js',    'https://cdn.jsdelivr.net/npm/nsfwjs@2.4.2/dist/nsfwjs.min.js'],
];

/* The nsfwjs weights.

   Every hardcoded URL for this model is now dead: the old S3 bucket returns 403
   (locked down), and the repo/demo paths 404. Rather than guess again, read the
   URLs out of the vendored nsfwjs.min.js — whatever the library itself defaults
   to is a literal string inside that file. Then verify by parsing model.json and
   fetching exactly the shards its weightsManifest names.

   Override any time with:   SHADEPROOF_MODEL_URL=https://.../model/ node server.js
   Or just drop a model into  vendor/nsfw-model/  by hand; the app looks there first.

   None of this affects video processing — it only gates the explicit-content check. */

function modelBasesFromLibrary() {
  const lib = path.join(VENDOR_DIR, 'nsfwjs.min.js');
  if (!fs.existsSync(lib)) return [];
  let txt = '';
  try { txt = fs.readFileSync(lib, 'utf8'); } catch (_) { return []; }
  const found = new Set();
  const re = /https?:\/\/[^"'`\s\\)]+/g;
  let m;
  while ((m = re.exec(txt))) {
    let u = m[0];
    if (!/model|nsfw|tfhub|tfjs|storage|s3|cdn/i.test(u)) continue;
    if (/\.(js|css|html|png|jpg|svg|md)$/i.test(u)) continue;
    if (u.endsWith('model.json')) u = u.slice(0, -'model.json'.length);
    if (!u.endsWith('/')) u += '/';
    found.add(u);
  }
  return [...found];
}

async function vendorModel() {
  const dir = path.join(VENDOR_DIR, 'nsfw-model');
  const manifestPath = path.join(dir, 'model.json');

  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const want = (m.weightsManifest || []).flatMap(g => g.paths || []);
      if (want.length && want.every(f => fs.existsSync(path.join(dir, f)))) {
        console.log(`[SHADEPROOF] nsfw model: complete (${want.length + 1} files)`);
        return;
      }
      console.log('[SHADEPROOF] nsfw model: incomplete, refetching');
    } catch (_) { console.log('[SHADEPROOF] nsfw model: model.json unreadable, refetching'); }
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const bases = [];
  if (process.env.SHADEPROOF_MODEL_URL) {
    let u = process.env.SHADEPROOF_MODEL_URL;
    if (u.endsWith('model.json')) u = u.slice(0, -'model.json'.length);
    if (!u.endsWith('/')) u += '/';
    bases.push(u);
    console.log('[SHADEPROOF] nsfw model: using SHADEPROOF_MODEL_URL');
  }
  // real paths in the repo, confirmed from the project README
  bases.push('https://cdn.jsdelivr.net/gh/infinitered/nsfwjs@master/models/mobilenet_v2/');
  bases.push('https://cdn.jsdelivr.net/gh/infinitered/nsfwjs@master/example/nsfw_demo/public/quant_nsfw_mobilenet/');
  const fromLib = modelBasesFromLibrary();
  if (fromLib.length) {
    console.log(`[SHADEPROOF] nsfw model: ${fromLib.length} candidate URL(s) read from nsfwjs.min.js`);
    bases.push(...fromLib);
  }

  if (!bases.length) {
    console.log('[SHADEPROOF] nsfw model: no candidate URLs available');
  }

  for (const base of bases) {
    const label = base.replace(/^https?:\/\//, '').slice(0, 52);
    try {
      const res = await fetch(base + 'model.json');
      if (!res.ok) { console.log(`[SHADEPROOF] nsfw model: ${label} -> HTTP ${res.status}`); continue; }
      const text = await res.text();
      let manifest;
      try { manifest = JSON.parse(text); }
      catch (_) { console.log(`[SHADEPROOF] nsfw model: ${label} -> not JSON`); continue; }
      const shards = (manifest.weightsManifest || []).flatMap(g => g.paths || []);
      if (!shards.length) { console.log(`[SHADEPROOF] nsfw model: ${label} -> no weightsManifest`); continue; }

      fs.writeFileSync(manifestPath, text);
      let ok = 0;
      for (const f of shards) {
        try {
          const r = await fetch(base + f);
          if (!r.ok) { console.log(`[SHADEPROOF] nsfw model: ${f} -> HTTP ${r.status}`); continue; }
          const buf = Buffer.from(await r.arrayBuffer());
          if (!buf.length) continue;
          fs.writeFileSync(path.join(dir, f), buf);
          ok++;
        } catch (err) { console.log(`[SHADEPROOF] nsfw model: ${f} -> ${err.message}`); }
      }
      if (ok === shards.length) {
        console.log(`[SHADEPROOF] nsfw model: vendored from ${label} (${ok + 1} files)`);
        return;
      }
      console.log(`[SHADEPROOF] nsfw model: ${label} -> ${ok}/${shards.length} shards, trying next`);
      try { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    } catch (err) {
      console.log(`[SHADEPROOF] nsfw model: ${label} -> ${err.message}`);
    }
  }

  console.log('[SHADEPROOF] nsfw model: not installed — content check is OFF, everything else works.');
  console.log('             To enable it, put a TensorFlow.js model in vendor/nsfw-model/');
  console.log('             (model.json + its shards), or run with SHADEPROOF_MODEL_URL=<base-url>');
}

async function vendor() {
  if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });
  for (const [name, url] of VENDOR) {
    const dest = path.join(VENDOR_DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) continue;
    try {
      process.stdout.write(`[SHADEPROOF] fetching ${name} ... `);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log('ok');
    } catch (err) {
      console.log('FAILED (' + err.message + ')');
      console.log('           download it manually to vendor/' + name);
      console.log('           from ' + url);
    }
  }
}

app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript');

    if (/index\.html$|sw\.js$|manifest\.json$/.test(filePath) || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes('vendor') || filePath.includes('ffmpeg-core')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
}));

vendor().then(vendorModel).then(() => {
  app.listen(PORT, () => {
    const have = VENDOR.filter(([n]) => fs.existsSync(path.join(VENDOR_DIR, n))).length;
    console.log('[EVANSCIRA LABS // SRC-D2]');
    console.log(`[SHADEPROOF] vendor: ${have}/${VENDOR.length} files present`);
    console.log(`[SHADEPROOF] http://localhost:${PORT}`);
  });
});
