#!/data/data/com.termux/files/usr/bin/node

/*
 * 📱 PHONE BACKEND - SUPER SIMPLE VERSION
 * 
 * Just run this file and it connects automatically!
 * No installation, no configuration, no complexity!
 * 
 * Usage:
 * 1. Download this file to your phone
 * 2. node phone-backend-simple.js
 * 3. Enter your email when prompted
 * 4. Done! Connected!
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

// Configuration
const ROUTING_URL = 'https://phone-backend-routing.up.railway.app'; // Will be updated with your URL
const DATA_DIR = path.join(os.homedir(), '.phone-backend-data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Colors for terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m'
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple database
class SimpleDB {
    constructor() {
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(DB_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    save() {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
    }

    get(path) {
        const parts = path.split('/').filter(p => p);
        let current = this.data;
        for (const part of parts) {
            if (!current[part]) return null;
            current = current[part];
        }
        return current;
    }

    set(path, value) {
        const parts = path.split('/').filter(p => p);
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
        this.save();
    }

    delete(path) {
        const parts = path.split('/').filter(p => p);
        let current = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) return false;
            current = current[parts[i]];
        }
        delete current[parts[parts.length - 1]];
        this.save();
        return true;
    }

    getAll() {
        return this.data;
    }
}

// Simple WebSocket client (using HTTP long polling for simplicity)
class SimpleConnection {
    constructor(url, username) {
        this.url = url;
        this.username = username;
        this.connected = false;
        this.handlers = {};
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    emit(event, data) {
        const urlObj = new URL(this.url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: `/emit/${event}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': this.username
            }
        };

        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (this.handlers.response) {
                    try {
                        this.handlers.response(JSON.parse(body));
                    } catch (e) {}
                }
            });
        });

        req.on('error', (e) => {
            if (this.handlers.error) {
                this.handlers.error(e);
            }
        });

        req.write(JSON.stringify(data));
        req.end();
    }

    connect() {
        // Simple polling connection
        this.pollForMessages();
    }

    pollForMessages() {
        const urlObj = new URL(this.url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: `/poll/${this.username}`,
            method: 'GET',
            headers: {
                'X-Username': this.username
            }
        };

        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(options, (res) => {
            if (res.statusCode === 200) {
                if (!this.connected && this.handlers.connect) {
                    this.connected = true;
                    this.handlers.connect();
                }
            }

            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const messages = JSON.parse(body);
                    if (Array.isArray(messages)) {
                        messages.forEach(msg => {
                            if (this.handlers[msg.event]) {
                                this.handlers[msg.event](msg.data);
                            }
                        });
                    }
                } catch (e) {}

                // Continue polling
                setTimeout(() => this.pollForMessages(), 1000);
            });
        });

        req.on('error', (e) => {
            console.error(`${colors.red}Connection error: ${e.message}${colors.reset}`);
            setTimeout(() => this.pollForMessages(), 5000);
        });

        req.setTimeout(30000);
        req.end();
    }
}

// Main application
async function main() {
    console.log(`
${colors.blue}╔═══════════════════════════════════════╗
║   📱 PHONE BACKEND - SIMPLE VERSION  ║
╚═══════════════════════════════════════╝${colors.reset}

${colors.green}✨ Super simple setup - just answer one question!${colors.reset}
    `);

    // Check if already configured
    let config = null;
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            console.log(`${colors.yellow}Found existing configuration!${colors.reset}`);
            console.log(`Username: ${colors.green}${config.username}${colors.reset}\n`);
        } catch (e) {
            config = null;
        }
    }

    // Get username if not configured
    if (!config) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const username = await new Promise((resolve) => {
            rl.question(`${colors.blue}📧 Enter your email or username: ${colors.reset}`, (answer) => {
                rl.close();
                resolve(answer.trim().split('@')[0]);
            });
        });

        config = {
            username: username,
            createdAt: new Date().toISOString()
        };

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        console.log(`\n${colors.green}✅ Configuration saved!${colors.reset}\n`);
    }

    // Initialize database
    const db = new SimpleDB();

    // Initialize connection
    console.log(`${colors.blue}🔌 Connecting to routing service...${colors.reset}`);
    
    const connection = new SimpleConnection(ROUTING_URL, config.username);

    connection.on('connect', () => {
        console.log(`${colors.green}✅ Connected to routing service!${colors.reset}`);
        console.log(`\n${colors.blue}╔═══════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.blue}║        🎉 YOUR PHONE IS LIVE!        ║${colors.reset}`);
        console.log(`${colors.blue}╚═══════════════════════════════════════╝${colors.reset}\n`);
        console.log(`${colors.yellow}📱 Username:${colors.reset} ${config.username}`);
        console.log(`${colors.yellow}🔗 API URL:${colors.reset} ${ROUTING_URL}/api/u/${config.username}`);
        console.log(`${colors.yellow}📊 Status:${colors.reset} ${colors.green}Online ✅${colors.reset}\n`);
        console.log(`${colors.blue}💡 Test your API:${colors.reset}`);
        console.log(`   curl ${ROUTING_URL}/api/u/${config.username}/test\n`);
        console.log(`${colors.red}Press Ctrl+C to stop${colors.reset}\n`);
    });

    connection.on('api_request', (request) => {
        console.log(`${colors.blue}📨 ${request.method} ${request.path}${colors.reset}`);

        try {
            let response;

            switch (request.method) {
                case 'GET':
                    const data = db.get(request.path);
                    response = {
                        requestId: request.id,
                        statusCode: data !== null ? 200 : 404,
                        body: data !== null ? data : { error: 'Not found' }
                    };
                    break;

                case 'POST':
                    const id = Date.now().toString();
                    const newPath = `${request.path}/${id}`;
                    const newData = { id, ...request.body, createdAt: new Date().toISOString() };
                    db.set(newPath, newData);
                    response = {
                        requestId: request.id,
                        statusCode: 201,
                        body: newData
                    };
                    break;

                case 'PATCH':
                    const existing = db.get(request.path);
                    if (existing) {
                        const updated = { ...existing, ...request.body, updatedAt: new Date().toISOString() };
                        db.set(request.path, updated);
                        response = {
                            requestId: request.id,
                            statusCode: 200,
                            body: updated
                        };
                    } else {
                        response = {
                            requestId: request.id,
                            statusCode: 404,
                            body: { error: 'Not found' }
                        };
                    }
                    break;

                case 'DELETE':
                    const deleted = db.delete(request.path);
                    response = {
                        requestId: request.id,
                        statusCode: deleted ? 200 : 404,
                        body: deleted ? { success: true } : { error: 'Not found' }
                    };
                    break;

                default:
                    response = {
                        requestId: request.id,
                        statusCode: 405,
                        body: { error: 'Method not allowed' }
                    };
            }

            connection.emit('api_response', response);
            console.log(`${colors.green}✅ ${response.statusCode}${colors.reset}`);

        } catch (error) {
            console.log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
            connection.emit('api_response', {
                requestId: request.id,
                statusCode: 500,
                error: error.message
            });
        }
    });

    connection.on('get_data_snapshot', (data) => {
        const snapshot = db.getAll();
        connection.emit('data_snapshot', {
            requestId: data.requestId,
            snapshot
        });
        console.log(`${colors.blue}📸 Sent data snapshot${colors.reset}`);
    });

    connection.on('error', (error) => {
        console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    });

    // Connect
    connection.connect();

    // Heartbeat
    setInterval(() => {
        connection.emit('heartbeat', {});
    }, 30000);

    // Handle exit
    process.on('SIGINT', () => {
        console.log(`\n\n${colors.yellow}👋 Shutting down...${colors.reset}`);
        console.log(`${colors.green}✅ Your data is saved in: ${DATA_DIR}${colors.reset}\n`);
        process.exit(0);
    });
}

// Run
main().catch(console.error);
