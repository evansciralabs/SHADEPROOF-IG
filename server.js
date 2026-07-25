const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8070;

app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
}));

app.listen(PORT, () => {
  console.log('[EVANSCIRA LABS // SRC-D2]');
  console.log('[SHADEPROOF] engine v3 — MP4/QuickTime + WebM/Matroska');
  console.log('[SHADEPROOF] deep walk · mdat coverage · attachment inspection · entropy · hazard gating · decode watchdog');
  console.log(`[SHADEPROOF] http://localhost:${PORT}`);
});
