#!/data/data/com.termux/files/usr/bin/node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const FIREBASE_PROJECT = 'harshitproto';
const FIREBASE_API_KEY = 'AIzaSyDiS42BJ1Ppc1z9UNrdyTKWtb8qmkKuQ_Y';
const DATA_DIR = path.join(os.homedir(), '.phonebackend');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

function getDeviceInfo() {
    const networkInterfaces = os.networkInterfaces();
    let ip = 'localhost';
    Object.keys(networkInterfaces).forEach(ifname => {
        networkInterfaces[ifname].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) ip = iface.address;
        });
    });
    return {
        deviceName: os.hostname() || 'Android Phone',
        model: `${os.platform()} ${os.arch()}`,
        ip: ip,
        os: os.platform()
    };
}

async function getUserEmail() {
    if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (config.email) return config.email;
    }
    let email = process.argv[2];
    if (!email) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        email = await new Promise(resolve => {
            rl.question('Enter your email (same as dashboard): ', answer => {
                rl.close();
                resolve(answer.trim());
            });
        });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ email }, null, 2));
    return email;
}

async function registerPhone(email, deviceInfo) {
    return new Promise((resolve, reject) => {
        const phoneId = 'phone_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const data = JSON.stringify({
            fields: {
                phoneId: { stringValue: phoneId },
                userId: { stringValue: email },
                userEmail: { stringValue: email },
                username: { stringValue: email.split('@')[0] },
                deviceName: { stringValue: deviceInfo.deviceName },
                model: { stringValue: deviceInfo.model },
                ip: { stringValue: deviceInfo.ip },
                os: { stringValue: deviceInfo.os },
                status: { stringValue: 'online' },
                lastSeen: { timestampValue: new Date().toISOString() },
                connectedAt: { timestampValue: new Date().toISOString() }
            }
        });

        const options = {
            hostname: 'firestore.googleapis.com',
            port: 443,
            path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?key=${FIREBASE_API_KEY}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve({ phoneId, email, ...deviceInfo });
                } else {
                    reject(new Error('Registration failed'));
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function sendHeartbeat(phoneId) {
    const data = JSON.stringify({
        fields: {
            lastSeen: { timestampValue: new Date().toISOString() },
            status: { stringValue: 'online' }
        }
    });
    const options = {
        hostname: 'firestore.googleapis.com',
        port: 443,
        path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=status&key=${FIREBASE_API_KEY}`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options);
    req.on('error', () => {});
    req.write(data);
    req.end();
}

class DB {
    constructor() {
        this.data = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
    }
    get(path) {
        let d = this.data;
        for (let p of path.split('/').filter(x => x)) {
            if (!d[p]) return null;
            d = d[p];
        }
        return d;
    }
    set(path, val) {
        let d = this.data;
        const parts = path.split('/').filter(x => x);
        for (let i = 0; i < parts.length - 1; i++) {
            if (!d[parts[i]]) d[parts[i]] = {};
            d = d[parts[i]];
        }
        d[parts[parts.length - 1]] = val;
        fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
    }
    del(path) {
        let d = this.data;
        const parts = path.split('/').filter(x => x);
        for (let i = 0; i < parts.length - 1; i++) {
            if (!d[parts[i]]) return false;
            d = d[parts[i]];
        }
        delete d[parts[parts.length - 1]];
        fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
        return true;
    }
    getAll() {
        return this.data;
    }
}

async function main() {
    console.log(`\n${colors.blue}╔═══════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.blue}║   📱 PHONE BACKEND CONNECTOR         ║${colors.reset}`);
    console.log(`${colors.blue}╚═══════════════════════════════════════╝${colors.reset}\n`);

    try {
        const email = await getUserEmail();
        const deviceInfo = getDeviceInfo();
        const registration = await registerPhone(email, deviceInfo);

        console.log(`${colors.green}✅ Phone connected successfully!${colors.reset}\n`);
        console.log(`Email: ${email}`);
        console.log(`IP: ${registration.ip}`);
        console.log(`\n${colors.yellow}📊 Check your dashboard - phone is visible!${colors.reset}\n`);

        const db = new DB();
        const PORT = 8080;

        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

            // Special endpoint for database snapshot (Firebase-like viewer)
            if (urlPath === '/_snapshot') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(db.getAll()));
                console.log(`${colors.blue}📸 Snapshot sent${colors.reset}`);
                return;
            }

            console.log(`${colors.blue}${req.method} ${urlPath}${colors.reset}`);

            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = body ? JSON.parse(body) : null;
                    let result;

                    if (req.method === 'GET') {
                        result = db.get(urlPath) || { error: 'Not found' };
                    } else if (req.method === 'POST') {
                        const id = Date.now().toString();
                        const item = { id, ...data, createdAt: new Date().toISOString() };
                        db.set(`${urlPath}/${id}`, item);
                        result = item;
                    } else if (req.method === 'PATCH') {
                        const existing = db.get(urlPath);
                        if (existing) {
                            const updated = { ...existing, ...data };
                            db.set(urlPath, updated);
                            result = updated;
                        } else {
                            result = { error: 'Not found' };
                        }
                    } else if (req.method === 'DELETE') {
                        result = db.del(urlPath) ? { success: true } : { error: 'Not found' };
                    } else {
                        result = { error: 'Method not allowed' };
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    console.log(`${colors.green}✅${colors.reset}`);
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                    console.log(`${colors.red}❌${colors.reset}`);
                }
            });
        });

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`${colors.green}🌐 Server running on port ${PORT}${colors.reset}`);
            console.log(`${colors.yellow}Keep this running!${colors.reset}\n`);
        });

        setInterval(() => sendHeartbeat(registration.phoneId), 15000);
        setTimeout(() => sendHeartbeat(registration.phoneId), 2000);

        process.on('SIGINT', () => {
            console.log(`\n${colors.yellow}Disconnecting...${colors.reset}`);
            const data = JSON.stringify({
                fields: {
                    status: { stringValue: 'offline' },
                    lastSeen: { timestampValue: new Date().toISOString() }
                }
            });
            const options = {
                hostname: 'firestore.googleapis.com',
                port: 443,
                path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${registration.phoneId}?updateMask.fieldPaths=status&updateMask.fieldPaths=lastSeen&key=${FIREBASE_API_KEY}`,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
            };
            const req = https.request(options, () => {
                console.log(`${colors.green}✅ Disconnected${colors.reset}\n`);
                process.exit(0);
            });
            req.on('error', () => process.exit(0));
            req.write(data);
            req.end();
            setTimeout(() => process.exit(0), 2000);
        });

    } catch (error) {
        console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

main();
