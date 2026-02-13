#!/data/data/com.termux/files/usr/bin/node

/*
 * PHONE BACKEND CONNECTOR
 * This file connects your phone to the dashboard
 * Run: node connect.js YOUR_USERNAME
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get username from command line
const username = process.argv[2];

if (!username) {
    console.log('❌ Usage: node connect.js YOUR_USERNAME');
    console.log('Example: node connect.js john');
    process.exit(1);
}

// Configuration
const FIREBASE_PROJECT = 'harshitproto';
const FIREBASE_API_KEY = 'AIzaSyDiS42BJ1Ppc1z9UNrdyTKWtb8qmkKuQ_Y';
const DATA_DIR = path.join(os.homedir(), '.phonebackend');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Create data directory
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Get device info
function getDeviceInfo() {
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    
    let ip = 'localhost';
    Object.keys(networkInterfaces).forEach(ifname => {
        networkInterfaces[ifname].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                ip = iface.address;
            }
        });
    });

    return {
        deviceName: hostname || 'Android Phone',
        model: `${platform} ${arch}`,
        ip: ip,
        os: platform
    };
}

// Register phone in Firebase
async function registerPhone() {
    const deviceInfo = getDeviceInfo();
    
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            fields: {
                userId: { stringValue: username },
                username: { stringValue: username },
                deviceName: { stringValue: deviceInfo.deviceName },
                model: { stringValue: deviceInfo.model },
                ip: { stringValue: deviceInfo.ip },
                os: { stringValue: deviceInfo.os },
                lastSeen: { timestampValue: new Date().toISOString() },
                connectedAt: { timestampValue: new Date().toISOString() }
            }
        });

        const options = {
            hostname: 'firestore.googleapis.com',
            port: 443,
            path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones?key=${FIREBASE_API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(body);
                    const phoneId = response.name.split('/').pop();
                    resolve({ phoneId, ...deviceInfo });
                } else {
                    reject(new Error('Failed to register: ' + body));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Update heartbeat
function sendHeartbeat(phoneId) {
    const data = JSON.stringify({
        fields: {
            lastSeen: { timestampValue: new Date().toISOString() }
        }
    });

    const options = {
        hostname: 'firestore.googleapis.com',
        port: 443,
        path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones/${phoneId}?updateMask.fieldPaths=lastSeen&key=${FIREBASE_API_KEY}`,
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        // Silently update heartbeat
    });

    req.on('error', () => {
        // Silently handle errors
    });

    req.write(data);
    req.end();
}

// Simple database
class DB {
    constructor() {
        this.data = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
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
}

// Main
async function main() {
    console.log('\n📱 PHONE BACKEND CONNECTOR\n');
    console.log('Connecting as:', username);
    console.log('Registering with Firebase...\n');

    try {
        const registration = await registerPhone();
        console.log('✅ Registered successfully!\n');
        console.log('Phone ID:', registration.phoneId);
        console.log('Device Name:', registration.deviceName);
        console.log('IP Address:', registration.ip);
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('║     🎉 PHONE IS NOW CONNECTED!       ║');
        console.log('╚═══════════════════════════════════════╝\n');
        console.log('📊 Check your dashboard - your phone is now visible!');
        console.log('🔗 API URL: http://' + registration.ip + ':8080');
        console.log('\nKeep this running to stay connected.');
        console.log('Press Ctrl+C to disconnect\n');

        const db = new DB();
        const PORT = 8080;

        // Start HTTP server
        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            const url = new URL(req.url, `http://localhost:${PORT}`);
            const urlPath = url.pathname;

            console.log(`${req.method} ${urlPath}`);

            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = body ? JSON.parse(body) : null;
                    let result;

                    if (req.method === 'GET') {
                        result = db.get(urlPath) || { error: 'Not found' };
                    } else if (req.method === 'POST') {
                        const id = Date.now();
                        const item = { id, ...data, createdAt: new Date().toISOString() };
                        db.set(`${urlPath}/${id}`, item);
                        result = item;
                    } else if (req.method === 'PATCH') {
                        const existing = db.get(urlPath);
                        if (existing) {
                            const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
                            db.set(urlPath, updated);
                            result = updated;
                        } else {
                            result = { error: 'Not found' };
                        }
                    } else if (req.method === 'DELETE') {
                        result = db.del(urlPath) ? { success: true } : { error: 'Not found' };
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                    console.log('✅ 200');
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                    console.log('❌ 500');
                }
            });
        });

        server.listen(PORT, '0.0.0.0', () => {
            console.log('🌐 HTTP server started on port', PORT);
        });

        // Send heartbeat every 30 seconds
        setInterval(() => {
            sendHeartbeat(registration.phoneId);
        }, 30000);

        // Handle exit
        process.on('SIGINT', () => {
            console.log('\n\n👋 Disconnecting...');
            console.log('✅ Your phone has been disconnected from the dashboard\n');
            process.exit(0);
        });

    } catch (error) {
        console.error('\n❌ Connection failed:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Check your internet connection');
        console.log('2. Make sure you used the correct username');
        console.log('3. Verify Firebase is configured correctly\n');
        process.exit(1);
    }
}

main();
