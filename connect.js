#!/data/data/com.termux/files/usr/bin/node

/*
 * PHONE BACKEND SERVER - CLOUDFLARE TUNNEL EDITION
 * Works from anywhere in the world via free Cloudflare tunnel
 *
 * FIRST TIME SETUP (run once):
 *   pkg install cloudflared
 *
 * USAGE:
 *   node connect.js your@email.com
 *
 * You'll get a permanent public URL like:
 *   https://your-name.trycloudflare.com
 * Or with your own domain:
 *   https://api.yourdomain.com
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { spawn, execSync } = require('child_process');

// ─── Config ────────────────────────────────────────────────────────────────────
const FIREBASE_PROJECT = 'harshitproto';
const FIREBASE_API_KEY = 'AIzaSyDiS42BJ1Ppc1z9UNrdyTKWtb8qmkKuQ_Y';
const PORT             = 8080;
const DATA_DIR         = path.join(os.homedir(), '.phonebackend');
const DB_DIR           = path.join(DATA_DIR, 'database');
const CONFIG_FILE      = path.join(DATA_DIR, 'config.json');

// ─── Colors ────────────────────────────────────────────────────────────────────
const C = {
    reset:'\x1b[0m', green:'\x1b[32m', blue:'\x1b[34m',
    yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m',
    gray:'\x1b[90m', bold:'\x1b[1m', magenta:'\x1b[35m'
};

// ─── Setup dirs ────────────────────────────────────────────────────────────────
[DATA_DIR, DB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); });

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getIp() {
    let ip = 'localhost';
    Object.values(os.networkInterfaces()).flat().forEach(i => {
        if (i.family === 'IPv4' && !i.internal) ip = i.address;
    });
    return ip;
}

function getEmail() {
    let email = process.argv[2];
    if (!email && fs.existsSync(CONFIG_FILE)) {
        try { email = JSON.parse(fs.readFileSync(CONFIG_FILE)).email; } catch(e){}
    }
    if (!email) {
        console.error(C.red + '❌ Please provide your email:' + C.reset);
        console.error('   node connect.js your@email.com\n');
        process.exit(1);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ email }, null, 2));
    return email;
}

function isCloudflaredInstalled() {
    try { execSync('which cloudflared', { stdio:'ignore' }); return true; }
    catch(e) { return false; }
}

// ─── Database helpers ──────────────────────────────────────────────────────────
function collFile(n)   { return path.join(DB_DIR, n + '.json'); }
function listColl()    { return fs.readdirSync(DB_DIR).filter(f=>f.endsWith('.json')).map(f=>f.replace('.json','')); }
function readColl(n)   { const f=collFile(n); if(!fs.existsSync(f)) return {}; try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){return {};} }
function writeColl(n,d){ fs.writeFileSync(collFile(n), JSON.stringify(d,null,2)); }
function delColl(n)    { const f=collFile(n); if(fs.existsSync(f)) fs.unlinkSync(f); }
function genId()       { return 'doc_'+Date.now()+'_'+Math.random().toString(36).substr(2,6); }

// ─── Firebase helpers ──────────────────────────────────────────────────────────
function firebaseRequest(docPath, data) {
    return new Promise((res, rej) => {
        const body = JSON.stringify(data);
        const opts = {
            hostname: 'firestore.googleapis.com', port: 443,
            path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}`,
            method: 'PATCH',
            headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) }
        };
        const req = https.request(opts, r => {
            let b=''; r.on('data',c=>b+=c);
            r.on('end', ()=> r.statusCode===200 ? res(JSON.parse(b)) : rej(new Error('HTTP '+r.statusCode+': '+b)));
        });
        req.on('error', rej);
        req.write(body); req.end();
    });
}

function buildPhoneDoc(email, ip, phoneId, publicUrl) {
    return {
        fields: {
            phoneId:     { stringValue: phoneId },
            userId:      { stringValue: email },
            userEmail:   { stringValue: email },
            deviceName:  { stringValue: os.hostname() || 'Phone' },
            model:       { stringValue: os.platform()+' '+os.arch() },
            ip:          { stringValue: ip },
            publicUrl:   { stringValue: publicUrl || '' },
            tunnelActive:{ booleanValue: !!publicUrl },
            os:          { stringValue: os.platform() },
            status:      { stringValue: 'online' },
            lastSeen:    { timestampValue: new Date().toISOString() },
            connectedAt: { timestampValue: new Date().toISOString() }
        }
    };
}

async function registerPhone(email, ip, phoneId, publicUrl) {
    await firebaseRequest(`phones/${phoneId}`, buildPhoneDoc(email, ip, phoneId, publicUrl));
}

function sendHeartbeat(phoneId, publicUrl) {
    const body = JSON.stringify({
        fields: {
            lastSeen:    { timestampValue: new Date().toISOString() },
            status:      { stringValue: 'online' },
            publicUrl:   { stringValue: publicUrl || '' },
            tunnelActive:{ booleanValue: !!publicUrl }
        }
    });
    const opts = {
        hostname:'firestore.googleapis.com', port:443,
        path:`/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=status&updateMask.fieldPaths=publicUrl&updateMask.fieldPaths=tunnelActive&key=${FIREBASE_API_KEY}`,
        method:'PATCH',
        headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    };
    const req = https.request(opts, r=>r.resume());
    req.on('error',()=>{});
    req.write(body); req.end();
}

// ─── Cloudflare Tunnel ─────────────────────────────────────────────────────────
function startCloudflaredTunnel(onUrl) {
    return new Promise((resolve) => {
        console.log(C.cyan + '\n🌐 Starting Cloudflare tunnel...' + C.reset);

        const cf = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:'+PORT], {
            stdio: ['ignore','pipe','pipe']
        });

        let resolved = false;

        function tryExtractUrl(data) {
            const text = data.toString();
            // Cloudflare prints the URL to stderr
            const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
            if (match && !resolved) {
                resolved = true;
                const url = match[0];
                resolve(url);
                onUrl(url);
            }
        }

        cf.stdout.on('data', tryExtractUrl);
        cf.stderr.on('data',  tryExtractUrl);

        cf.on('exit', (code) => {
            if (!resolved) resolve(null);
            console.log(C.yellow + '⚠️  Cloudflare tunnel exited (code ' + code + ')' + C.reset);
        });

        // Timeout after 30s
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(null);
                console.log(C.yellow + '⚠️  Cloudflare tunnel URL not detected. Continuing without tunnel.' + C.reset);
            }
        }, 30000);

        // Store ref for cleanup
        global._cfProcess = cf;
    });
}

// ─── HTTP Server ───────────────────────────────────────────────────────────────
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function json(res, status, data) {
    cors(res);
    res.writeHead(status, {'Content-Type':'application/json'});
    res.end(JSON.stringify(data));
}

function handleRequest(method, parts, urlObj, body, res) {
    // ── /_db/collections ─────────────────────────────────────────────────────
    if (parts[0]==='_db' && parts[1]==='collections') {
        return json(res, 200, listColl());
    }

    // ── /_db/<coll> ──────────────────────────────────────────────────────────
    if (parts[0]==='_db' && parts[1] && !parts[2]) {
        const coll = parts[1];
        if (method==='GET') {
            const data = readColl(coll);
            const docs = {};
            Object.entries(data).forEach(([k,v])=>{ if(k!=='_init') docs[k]=v; });
            return json(res, 200, { collection:coll, documents:docs, count:Object.keys(docs).length });
        }
        if (method==='POST') {
            const inc = body ? JSON.parse(body) : {};
            if (inc._init) { const e=readColl(coll); writeColl(coll,e); return json(res,200,{ok:true,collection:coll}); }
            const id = inc._id || genId();
            inc._id = id;
            const d = readColl(coll); d[id]=inc; writeColl(coll,d);
            return json(res, 201, { ok:true, id, data:inc });
        }
        if (method==='DELETE' && urlObj.searchParams.get('_deleteCollection')==='1') {
            delColl(coll);
            return json(res, 200, { ok:true, deleted:coll });
        }
        return json(res, 405, { error:'Method not allowed' });
    }

    // ── /_db/<coll>/<docId> ──────────────────────────────────────────────────
    if (parts[0]==='_db' && parts[1] && parts[2]) {
        const coll=parts[1], docId=parts[2];
        if (method==='GET') {
            const d=readColl(coll);
            return d[docId] ? json(res,200,d[docId]) : json(res,404,{error:'Not found'});
        }
        if (method==='POST' || method==='PUT') {
            const inc = body ? JSON.parse(body) : {};
            inc._id = docId;
            const d=readColl(coll); d[docId]=inc; writeColl(coll,d);
            return json(res,200,{ok:true,id:docId,data:inc});
        }
        if (method==='PATCH') {
            const inc = body ? JSON.parse(body) : {};
            const d=readColl(coll);
            if (!d[docId]) return json(res,404,{error:'Not found'});
            d[docId]={...d[docId],...inc,_id:docId}; writeColl(coll,d);
            return json(res,200,{ok:true,id:docId,data:d[docId]});
        }
        if (method==='DELETE') {
            const d=readColl(coll);
            if (!d[docId]) return json(res,404,{error:'Not found'});
            delete d[docId]; writeColl(coll,d);
            return json(res,200,{ok:true,deleted:docId});
        }
        return json(res,405,{error:'Method not allowed'});
    }

    // ── Custom API routes /<coll> and /<coll>/<docId> ────────────────────────
    if (parts[0] && parts[0]!=='_db') {
        const coll=parts[0], docId=parts[1];
        if (!docId) {
            if (method==='GET') {
                const d=readColl(coll);
                return json(res,200,Object.values(d).filter(v=>v&&v._id));
            }
            if (method==='POST') {
                const inc = body ? JSON.parse(body) : {};
                const id = inc.id || genId();
                inc.id=id; inc._id=id; inc.createdAt=new Date().toISOString();
                const d=readColl(coll); d[id]=inc; writeColl(coll,d);
                return json(res,201,inc);
            }
        } else {
            if (method==='GET') {
                const d=readColl(coll);
                return d[docId] ? json(res,200,d[docId]) : json(res,404,{error:'Not found'});
            }
            if (method==='PATCH'||method==='PUT') {
                const inc=body?JSON.parse(body):{};
                const d=readColl(coll);
                const ex=d[docId]||{_id:docId,id:docId};
                d[docId]={...ex,...inc}; writeColl(coll,d);
                return json(res,200,d[docId]);
            }
            if (method==='DELETE') {
                const d=readColl(coll); delete d[docId]; writeColl(coll,d);
                return json(res,200,{success:true});
            }
        }
        return json(res,405,{error:'Method not allowed'});
    }

    // ── Root ─────────────────────────────────────────────────────────────────
    if (!parts.length) {
        return json(res,200,{
            status:'running', version:'2.0',
            tunnel: global._publicUrl || null,
            collections: listColl(),
            docs: 'GET /_db/collections'
        });
    }

    json(res,404,{error:'Not found'});
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const email   = getEmail();
    const ip      = getIp();
    const phoneId = 'phone_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
    global._publicUrl = null;

    console.log('\n'+C.bold+C.blue+'╔══════════════════════════════════════╗'+C.reset);
    console.log(C.bold+C.blue+'║  📱 PHONE BACKEND — TUNNEL EDITION  ║'+C.reset);
    console.log(C.bold+C.blue+'╚══════════════════════════════════════╝'+C.reset+'\n');
    console.log(C.yellow+'Email:   '+C.reset+email);
    console.log(C.yellow+'Local:   '+C.reset+'http://'+ip+':'+PORT);
    console.log(C.yellow+'DB Path: '+C.reset+DB_DIR+'\n');

    // ── Start HTTP server first ────────────────────────────────────────────
    const server = http.createServer((req, res) => {
        cors(res);
        if (req.method==='OPTIONS') { res.writeHead(204); res.end(); return; }
        const urlObj = new URL(req.url, 'http://localhost');
        const parts  = urlObj.pathname.split('/').filter(Boolean);
        let body = '';
        req.on('data', c=>body+=c);
        req.on('end', ()=>{
            try { handleRequest(req.method, parts, urlObj, body, res); }
            catch(e) {
                console.error(C.red+'500 '+e.message+C.reset);
                json(res,500,{error:e.message});
            }
        });
    });

    await new Promise(r => server.listen(PORT, '0.0.0.0', r));
    console.log(C.green+'✅ HTTP server running on port '+PORT+C.reset);

    // ── Register with Firebase (local IP first) ───────────────────────────
    process.stdout.write(C.blue+'Registering with dashboard...'+C.reset+' ');
    try {
        await registerPhone(email, ip, phoneId, '');
        console.log(C.green+'✅'+C.reset);
    } catch(e) {
        console.log(C.red+'❌ '+e.message+C.reset);
    }

    // ── Start Cloudflare Tunnel ───────────────────────────────────────────
    if (isCloudflaredInstalled()) {
        const publicUrl = await startCloudflaredTunnel(async (url) => {
            global._publicUrl = url;
            console.log('\n'+C.bold+C.green+'╔══════════════════════════════════════════════╗'+C.reset);
            console.log(C.bold+C.green+'║  🌍 PUBLIC URL READY!                        ║'+C.reset);
            console.log(C.bold+C.green+'╚══════════════════════════════════════════════╝'+C.reset);
            console.log(C.bold+C.cyan+'\n  '+url+C.reset);
            console.log(C.gray+'\n  Share this URL with anyone — works worldwide!\n'+C.reset);
            // Update Firebase with the public URL
            try {
                await registerPhone(email, ip, phoneId, url);
                console.log(C.green+'✅ Dashboard updated with public URL!'+C.reset+'\n');
            } catch(e) {
                console.log(C.yellow+'⚠️  Could not update dashboard: '+e.message+C.reset);
            }
        });

        if (!publicUrl) {
            console.log(C.yellow+'\n⚠️  Running without tunnel (local network only)'+C.reset);
            console.log(C.gray+'   Install cloudflared: pkg install cloudflared'+C.reset+'\n');
        }
    } else {
        console.log('\n'+C.yellow+'⚠️  Cloudflare tunnel NOT installed.'+C.reset);
        console.log(C.gray+'   Your API is only accessible on local WiFi.'+C.reset);
        console.log(C.cyan+'   To enable public access, run:'+C.reset);
        console.log(C.bold+'   pkg install cloudflared\n'+C.reset);
        console.log(C.gray+'   Then restart: node connect.js '+email+C.reset+'\n');
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────
    setInterval(() => sendHeartbeat(phoneId, global._publicUrl||''), 15000);
    setTimeout(() => sendHeartbeat(phoneId, global._publicUrl||''), 2000);

    console.log(C.gray+'Press Ctrl+C to stop\n'+C.reset);

    // ── Graceful exit ─────────────────────────────────────────────────────
    process.on('SIGINT', async () => {
        console.log('\n'+C.yellow+'👋 Shutting down...'+C.reset);
        if (global._cfProcess) global._cfProcess.kill();
        const body = JSON.stringify({ fields: {
            status:   {stringValue:'offline'},
            lastSeen: {timestampValue: new Date().toISOString()},
            publicUrl:{stringValue:''},
            tunnelActive:{booleanValue:false}
        }});
        const opts = {
            hostname:'firestore.googleapis.com', port:443,
            path:`/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=status&updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=publicUrl&updateMask.fieldPaths=tunnelActive&key=${FIREBASE_API_KEY}`,
            method:'PATCH',
            headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
        };
        const req = https.request(opts, ()=>{ console.log(C.green+'✅ Marked offline'+C.reset+'\n'); process.exit(0); });
        req.on('error',()=>process.exit(0));
        req.write(body); req.end();
        setTimeout(()=>process.exit(0), 2000);
    });
}

main();
