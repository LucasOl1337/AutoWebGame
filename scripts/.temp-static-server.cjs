const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve('output/esm');
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json', '.svg':'image/svg+xml' };
http.createServer((req,res)=>{
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath.startsWith(root)) { res.statusCode=403; return res.end('forbidden'); }
  fs.stat(filePath, (err, st)=>{
    if (!err && st.isDirectory()) filePath = path.join(filePath,'index.html');
    fs.readFile(filePath, (e,data)=>{
      if (e) { res.statusCode=404; return res.end('not found'); }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      res.end(data);
    });
  });
}).listen(4173,'127.0.0.1');
