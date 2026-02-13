#!/data/data/com.termux/files/usr/bin/node

/*
 * PHONE BACKEND SERVER - DATABASE EDITION
 * Runs a local HTTP server with Firebase-like database on your phone
 *
 * USAGE: node connect.js your@email.com
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Config ───────────────────────────────────────────────────────────────────
const FIREBASE_PROJECT = 'harshitproto';
const FIREBASE_API_KEY = 'AIzaSyDiS42BJ1Ppc1z9UNrdyTKWtb8qmkKuQ_Y';
const PORT = 8080;
const DATA_DIR = path.join(os.homedir(), '.phonebackend');
const DB_DIR = path.join(DATA_DIR, 'database');      // where collections live
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m', green: '\x1b[32m', blue: '\x1b[34m',
    yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

// ─── Setup dirs ───────────────────────────────────────────────────────────────
[DATA_DIR, DB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Get IP ───────────────────────────────────────────────────────────────────
function getIp() {
    let ip = 'localhost';
    Object.values(os.networkInterfaces()).flat().forEach(i => {
        if (i.family === 'IPv4' && !i.internal) ip = i.address;
    });
    return ip;
}

// ─── Get email ────────────────────────────────────────────────────────────────
function getEmail() {
    let email = process.argv[2];
    if (!email && fs.existsSync(CONFIG_FILE)) {
        try { email = JSON.parse(fs.readFileSync(CONFIG_FILE)).email; } catch(e){}
    }
    if (!email) {
        console.error(C.red + '❌ Please provide your email:' + C.reset);
        console.error('   node connect.js your@email.com');
        process.exit(1);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ email }, null, 2));
    return email;
}

// ─── Database helpers ─────────────────────────────────────────────────────────
// Each collection = one JSON file: DB_DIR/<collName>.json
// Structure: { "docId": { ...fields }, ... }

function collFile(collName) {
    return path.join(DB_DIR, collName + '.json');
}

function listCollections() {
    return fs.readdirSync(DB_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
}

function readCollection(collName) {
    const file = collFile(collName);
    if (!fs.existsSync(file)) return {};
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return {}; }
}

function writeCollection(collName, data) {
    fs.writeFileSync(collFile(collName), JSON.stringify(data, null, 2));
}

function deleteCollectionFile(collName) {
    const file = collFile(collName);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

function genId() {
    return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ─── Register phone in Firebase ───────────────────────────────────────────────
function registerPhone(email, ip, phoneId) {
    const data = JSON.stringify({
        fields: {
            phoneId:     { stringValue: phoneId },
            userId:      { stringValue: email },
            userEmail:   { stringValue: email },
            deviceName:  { stringValue: os.hostname() || 'Android Phone' },
            model:       { stringValue: os.platform() + ' ' + os.arch() },
            ip:          { stringValue: ip },
            os:          { stringValue: os.platform() },
            status:      { stringValue: 'online' },
            lastSeen:    { timestampValue: new Date().toISOString() },
            connectedAt: { timestampValue: new Date().toISOString() }
        }
    });
    const opts = {
        hostname: 'firestore.googleapis.com', port: 443,
        path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?key=${FIREBASE_API_KEY}`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    return new Promise((res, rej) => {
        const req = https.request(opts, r => {
            let body = '';
            r.on('data', c => body += c);
            r.on('end', () => r.statusCode === 200 ? res() : rej(new Error('Status ' + r.statusCode)));
        });
        req.on('error', rej);
        req.write(data); req.end();
    });
}

function sendHeartbeat(phoneId) {
    const data = JSON.stringify({
        fields: {
            lastSeen: { timestampValue: new Date().toISOString() },
            status:   { stringValue: 'online' }
        }
    });
    const opts = {
        hostname: 'firestore.googleapis.com', port: 443,
        path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=status&key=${FIREBASE_API_KEY}`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(opts, r => { r.resume(); });
    req.on('error', () => {});
    req.write(data); req.end();
}

// ─── CORS helper ──────────────────────────────────────────────────────────────
function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function json(res, status, data) {
    cors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const email = getEmail();
    const ip = getIp();
    const phoneId = 'phone_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    console.log('\n' + C.blue + '╔══════════════════════════════════════╗' + C.reset);
    console.log(C.blue + '║   📱 PHONE BACKEND - DATABASE MODE   ║' + C.reset);
    console.log(C.blue + '╚══════════════════════════════════════╝' + C.reset + '\n');
    console.log(C.yellow + 'Email:   ' + C.reset + email);
    console.log(C.yellow + 'Phone IP:' + C.reset + ' ' + ip);
    console.log(C.yellow + 'DB Path: ' + C.reset + DB_DIR);
    console.log();

    // Register in Firebase
    process.stdout.write(C.blue + 'Registering with dashboard...' + C.reset + ' ');
    try {
        await registerPhone(email, ip, phoneId);
        console.log(C.green + '✅' + C.reset);
    } catch(e) {
        console.log(C.red + '❌ ' + e.message + C.reset);
    }

    // Start heartbeat
    setInterval(() => sendHeartbeat(phoneId), 15000);
    setTimeout(() => sendHeartbeat(phoneId), 2000);

    // ─── HTTP Server ───────────────────────────────────────────────────────────
    const server = http.createServer((req, res) => {
        cors(res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        const url = new URL(req.url, 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);
        // parts: [] | ['_db'] | ['_db','collections'] | ['_db',collName] | ['_db',collName,docId]
        // or custom API routes: [collName] | [collName, docId]

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                handleRequest(req.method, parts, url, body, res);
            } catch(e) {
                console.error(C.red + '500 ' + e.message + C.reset);
                json(res, 500, { error: e.message });
            }
        });
    });

    function handleRequest(method, parts, url, body, res) {
        const log = C.cyan + method + ' /' + parts.join('/') + C.reset;

        // ── /_db/collections → list all collections ──────────────────────────
        if (parts[0] === '_db' && parts[1] === 'collections') {
            console.log(log);
            return json(res, 200, listCollections());
        }

        // ── /_db/<coll> ───────────────────────────────────────────────────────
        if (parts[0] === '_db' && parts[1] && !parts[2]) {
            const coll = parts[1];
            console.log(log);

            if (method === 'GET') {
                // Return all documents
                const data = readCollection(coll);
                const docs = {};
                Object.entries(data).forEach(([k, v]) => { if (k !== '_init') docs[k] = v; });
                return json(res, 200, { collection: coll, documents: docs, count: Object.keys(docs).length });
            }

            if (method === 'POST') {
                // Add document (auto-ID or use _id from body)
                const incoming = body ? JSON.parse(body) : {};
                if (incoming._init) {
                    // Just create empty collection
                    const existing = readCollection(coll);
                    writeCollection(coll, existing);
                    return json(res, 200, { ok: true, collection: coll });
                }
                const docId = incoming._id || genId();
                incoming._id = docId;
                const data = readCollection(coll);
                data[docId] = incoming;
                writeCollection(coll, data);
                console.log(C.green + '  → Created ' + docId + C.reset);
                return json(res, 201, { ok: true, id: docId, data: incoming });
            }

            if (method === 'DELETE' && url.searchParams.get('_deleteCollection') === '1') {
                deleteCollectionFile(coll);
                console.log(C.yellow + '  → Deleted collection ' + coll + C.reset);
                return json(res, 200, { ok: true, deleted: coll });
            }

            return json(res, 405, { error: 'Method not allowed' });
        }

        // ── /_db/<coll>/<docId> ───────────────────────────────────────────────
        if (parts[0] === '_db' && parts[1] && parts[2]) {
            const coll = parts[1];
            const docId = parts[2];
            console.log(log);

            if (method === 'GET') {
                const data = readCollection(coll);
                if (!data[docId]) return json(res, 404, { error: 'Document not found' });
                return json(res, 200, data[docId]);
            }

            if (method === 'POST' || method === 'PUT') {
                const incoming = body ? JSON.parse(body) : {};
                incoming._id = docId;
                const data = readCollection(coll);
                data[docId] = incoming;
                writeCollection(coll, data);
                console.log(C.green + '  → Saved ' + docId + C.reset);
                return json(res, 200, { ok: true, id: docId, data: incoming });
            }

            if (method === 'PATCH') {
                const incoming = body ? JSON.parse(body) : {};
                const data = readCollection(coll);
                if (!data[docId]) return json(res, 404, { error: 'Document not found' });
                data[docId] = { ...data[docId], ...incoming, _id: docId };
                writeCollection(coll, data);
                console.log(C.green + '  → Updated ' + docId + C.reset);
                return json(res, 200, { ok: true, id: docId, data: data[docId] });
            }

            if (method === 'DELETE') {
                const data = readCollection(coll);
                if (!data[docId]) return json(res, 404, { error: 'Document not found' });
                delete data[docId];
                writeCollection(coll, data);
                console.log(C.yellow + '  → Deleted ' + docId + C.reset);
                return json(res, 200, { ok: true, deleted: docId });
            }

            return json(res, 405, { error: 'Method not allowed' });
        }

        // ── Custom API routes: /<collName> and /<collName>/<docId> ─────────────
        // (backwards compatible with old connect.js API endpoints)
        if (parts[0] && parts[0] !== '_db') {
            const coll = parts[0];
            const docId = parts[1];
            console.log(C.gray + log + C.reset);

            if (!docId) {
                if (method === 'GET') {
                    const data = readCollection(coll);
                    const docs = Object.values(data).filter(v => v && typeof v === 'object' && v._id);
                    return json(res, 200, docs);
                }
                if (method === 'POST') {
                    const incoming = body ? JSON.parse(body) : {};
                    const id = incoming.id || genId();
                    incoming.id = id;
                    incoming._id = id;
                    incoming.createdAt = new Date().toISOString();
                    const data = readCollection(coll);
                    data[id] = incoming;
                    writeCollection(coll, data);
                    return json(res, 201, incoming);
                }
            } else {
                if (method === 'GET') {
                    const data = readCollection(coll);
                    if (!data[docId]) return json(res, 404, { error: 'Not found' });
                    return json(res, 200, data[docId]);
                }
                if (method === 'PATCH' || method === 'PUT') {
                    const incoming = body ? JSON.parse(body) : {};
                    const data = readCollection(coll);
                    const existing = data[docId] || { _id: docId, id: docId };
                    data[docId] = { ...existing, ...incoming };
                    writeCollection(coll, data);
                    return json(res, 200, data[docId]);
                }
                if (method === 'DELETE') {
                    const data = readCollection(coll);
                    delete data[docId];
                    writeCollection(coll, data);
                    return json(res, 200, { success: true });
                }
            }
            return json(res, 405, { error: 'Method not allowed' });
        }

        // ── Root ──────────────────────────────────────────────────────────────
        if (parts.length === 0) {
            return json(res, 200, {
                status: 'running',
                email,
                ip,
                collections: listCollections(),
                endpoints: {
                    list_collections: 'GET /_db/collections',
                    get_collection:   'GET /_db/:collection',
                    add_document:     'POST /_db/:collection',
                    get_document:     'GET /_db/:collection/:id',
                    update_document:  'PUT /_db/:collection/:id',
                    patch_document:   'PATCH /_db/:collection/:id',
                    delete_document:  'DELETE /_db/:collection/:id',
                    delete_collection:'DELETE /_db/:collection?_deleteCollection=1'
                }
            });
        }

        json(res, 404, { error: 'Not found' });
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log('\n' + C.green + '╔══════════════════════════════════════╗' + C.reset);
        console.log(C.green + '║   🚀 SERVER RUNNING!                 ║' + C.reset);
        console.log(C.green + '╚══════════════════════════════════════╝' + C.reset);
        console.log(C.yellow + '\nDashboard URL: ' + C.reset + 'http://' + ip + ':' + PORT);
        console.log(C.yellow + 'Database API:  ' + C.reset + 'http://' + ip + ':' + PORT + '/_db/collections');
        console.log(C.yellow + 'DB stored at:  ' + C.reset + DB_DIR);
        console.log('\n' + C.gray + 'Press Ctrl+C to stop' + C.reset + '\n');
    });

    // Graceful exit
    process.on('SIGINT', () => {
        console.log('\n' + C.yellow + '👋 Shutting down...' + C.reset);
        const data = JSON.stringify({ fields: { status: { stringValue: 'offline' }, lastSeen: { timestampValue: new Date().toISOString() } } });
        const opts = {
            hostname: 'firestore.googleapis.com', port: 443,
            path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=status&updateMask.fieldPaths=lastSeen&key=${FIREBASE_API_KEY}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        };
        const req = https.request(opts, () => { console.log(C.green + '✅ Marked offline\n' + C.reset); process.exit(0); });
        req.on('error', () => process.exit(0));
        req.write(data); req.end();
        setTimeout(() => process.exit(0), 2000);
    });
}

main();
