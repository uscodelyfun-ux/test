#!/data/data/com.termux/files/usr/bin/bash

# 📱 PHONE BACKEND - ONE-LINE INSTALLER
# Just run: curl -sL https://phonebackend.io/install.sh | bash

echo "
╔═══════════════════════════════════════╗
║   📱 PHONE BACKEND AUTO-INSTALLER    ║
╚═══════════════════════════════════════╝
"

echo "🚀 Starting automatic setup..."
echo ""

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "❌ This script must run in Termux on Android"
    echo "   Download Termux from F-Droid: https://f-droid.org/"
    exit 1
fi

# Step 1: Install Node.js
echo "📦 Step 1/3: Installing Node.js..."
pkg update -y > /dev/null 2>&1
pkg install nodejs -y > /dev/null 2>&1

if ! command -v node &> /dev/null; then
    echo "❌ Failed to install Node.js"
    exit 1
fi

echo "✅ Node.js installed!"
echo ""

# Step 2: Download connector
echo "📥 Step 2/3: Downloading phone connector..."

cat > ~/phone-backend.js << 'PHONESCRIPT'
#!/data/data/com.termux/files/usr/bin/node

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.phonebackend');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Create data directory
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

async function main() {
    console.log('\n📱 PHONE BACKEND\n');
    
    let config = null;
    if (fs.existsSync(CONFIG_FILE)) {
        config = JSON.parse(fs.readFileSync(CONFIG_FILE));
        console.log(`✅ Found saved config: ${config.username}\n`);
    } else {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const username = await new Promise(resolve => {
            rl.question('Enter your email or username: ', answer => {
                rl.close();
                resolve(answer.trim().split('@')[0]);
            });
        });
        config = { username, created: new Date().toISOString() };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log('\n✅ Config saved!\n');
    }

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

        const url = new URL(req.url, `http://localhost:${PORT}`);
        const path = url.pathname;

        console.log(`${req.method} ${path}`);

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = body ? JSON.parse(body) : null;
                let result;

                if (req.method === 'GET') {
                    result = db.get(path) || { error: 'Not found' };
                } else if (req.method === 'POST') {
                    const id = Date.now();
                    const item = { id, ...data };
                    db.set(`${path}/${id}`, item);
                    result = item;
                } else if (req.method === 'PATCH') {
                    const existing = db.get(path);
                    if (existing) {
                        const updated = { ...existing, ...data };
                        db.set(path, updated);
                        result = updated;
                    } else {
                        result = { error: 'Not found' };
                    }
                } else if (req.method === 'DELETE') {
                    result = db.del(path) ? { success: true } : { error: 'Not found' };
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
        const ifaces = os.networkInterfaces();
        let ip = 'localhost';
        Object.keys(ifaces).forEach(ifname => {
            ifaces[ifname].forEach(iface => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ip = iface.address;
                }
            });
        });

        console.log('╔═══════════════════════════════════════╗');
        console.log('║        🎉 PHONE IS LIVE!             ║');
        console.log('╚═══════════════════════════════════════╝');
        console.log(`\n📱 Username: ${config.username}`);
        console.log(`🔗 Local API: http://localhost:${PORT}`);
        console.log(`🌐 Network API: http://${ip}:${PORT}`);
        console.log(`📊 Status: Online ✅\n`);
        console.log('💡 Test: curl http://localhost:8080/test\n');
        console.log('Press Ctrl+C to stop\n');
    });
}

main();
PHONESCRIPT

chmod +x ~/phone-backend.js

echo "✅ Connector downloaded!"
echo ""

# Step 3: Run it
echo "🚀 Step 3/3: Starting your phone backend..."
echo ""

node ~/phone-backend.js
