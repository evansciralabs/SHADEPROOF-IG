// server.js
// SRC // EVANSCIRA LABS - SHADEPROOF-IG Host
const express = require('express');
const app = express();
const PORT = 8080;

// Force Cross-Origin Isolation to allow SharedArrayBuffer for ffmpeg.wasm
app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});

// Serve the static SPA
app.use(express.static('./'));

app.listen(PORT, () => {
    console.log(`[SYSTEM] SHADEPROOF-IG Initialized`);
    console.log(`[SYSTEM] Access via: http://localhost:${PORT}`);
    console.log(`[SYSTEM] Cross-Origin Isolation: ACTIVE`);
});
