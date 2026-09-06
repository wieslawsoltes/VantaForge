import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8080);
const host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(e.code==='ENOENT'?'Not found':'Server error');}}).listen(port,host,()=>console.log(`Vanta Forge: http://localhost:${port}\nEditor: / · Portable editor: /vanta-forge.html`));
