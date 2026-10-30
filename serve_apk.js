const http = require('http');
const fs = require('fs');
const path = require('path');

const APK_PATH = 'd:/recoverright/RecoverRight-Companion.apk';
const PORT = 8888;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/RecoverRight-Companion.apk' || req.url.endsWith('.apk')) {
    if (fs.existsSync(APK_PATH)) {
      const stat = fs.statSync(APK_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="RecoverRight-Companion.apk"'
      });
      fs.createReadStream(APK_PATH).pipe(res);
      console.log(`[${new Date().toLocaleTimeString()}] Served APK to ${req.socket.remoteAddress} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('APK not found on disk');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`APK download server running at http://0.0.0.0:${PORT}/RecoverRight-Companion.apk`);
});
