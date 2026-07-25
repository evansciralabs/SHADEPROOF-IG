const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8070;

// Single-threaded ffmpeg core in the client — no SharedArrayBuffer, so no COOP/COEP
// required. That is what lets SHADEPROOF run inside the SRC-D2 tool-glyph sandbox
// iframe as well as standalone on GitHub Pages or file://.
//
// The page ships its own Content-Security-Policy in a meta tag so the protections
// travel with the file. These headers add what a meta tag cannot express.

app.use(express.static(path.join(__dirname), {
  setHeaders(res) {
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
