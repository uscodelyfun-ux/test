#!/data/data/com.termux/files/usr/bin/node

/*
 * PHONE BACKEND DEBUG TOOL
 * This checks if your phone is actually in Firebase
 * Run: node debug.js YOUR_EMAIL
 */

const https = require('https');

const FIREBASE_PROJECT = 'harshitproto';
const FIREBASE_API_KEY = 'AIzaSyDiS42BJ1Ppc1z9UNrdyTKWtb8qmkKuQ_Y';

const email = process.argv[2];

if (!email) {
    console.log('Usage: node debug.js your@email.com');
    process.exit(1);
}

console.log('\n🔍 DEBUGGING PHONE CONNECTION\n');
console.log('Checking for email:', email);
console.log('Querying Firebase...\n');

// Query Firebase directly
const options = {
    hostname: 'firestore.googleapis.com',
    port: 443,
    path: `/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/phones?key=${FIREBASE_API_KEY}`,
    method: 'GET'
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        try {
            const data = JSON.parse(body);
            
            if (!data.documents) {
                console.log('❌ NO PHONES FOUND IN FIREBASE!');
                console.log('\nThis means:');
                console.log('1. Phone never connected, OR');
                console.log('2. Phone connection failed\n');
                console.log('Try running: node connect-FIXED.js', email);
                return;
            }

            console.log(`✅ Found ${data.documents.length} phone(s) in Firebase:\n`);
            
            let foundMatch = false;
            
            data.documents.forEach((doc, index) => {
                const phone = doc.fields;
                const phoneEmail = phone.userId?.stringValue || phone.userEmail?.stringValue || 'unknown';
                const deviceName = phone.deviceName?.stringValue || 'Unknown';
                const model = phone.model?.stringValue || 'Unknown';
                const ip = phone.ip?.stringValue || 'Unknown';
                const status = phone.status?.stringValue || 'unknown';
                const lastSeen = phone.lastSeen?.timestampValue || 'Never';
                
                console.log(`Phone ${index + 1}:`);
                console.log('  Email:', phoneEmail);
                console.log('  Device:', deviceName);
                console.log('  Model:', model);
                console.log('  IP:', ip);
                console.log('  Status:', status);
                console.log('  Last Seen:', lastSeen);
                console.log();
                
                if (phoneEmail === email) {
                    foundMatch = true;
                    console.log('  ✅ THIS MATCHES YOUR EMAIL!\n');
                }
            });
            
            if (foundMatch) {
                console.log('╔═══════════════════════════════════════╗');
                console.log('║  ✅ YOUR PHONE IS IN FIREBASE!       ║');
                console.log('╚═══════════════════════════════════════╝\n');
                console.log('Your phone IS connected!');
                console.log('\nIf not showing in dashboard, check:');
                console.log('1. Signed into dashboard with:', email);
                console.log('2. Firebase security rules allow read');
                console.log('3. Refresh the dashboard');
            } else {
                console.log('╔═══════════════════════════════════════╗');
                console.log('║  ❌ NO MATCH FOR YOUR EMAIL          ║');
                console.log('╚═══════════════════════════════════════╝\n');
                console.log('Your email:', email);
                console.log('Phones found with different emails!\n');
                console.log('Solution: Run connect-FIXED.js with YOUR email:');
                console.log(`  node connect-FIXED.js ${email}`);
            }
            
        } catch (e) {
            console.error('Error parsing response:', e.message);
            console.error('Response:', body);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
    console.log('\nCheck:');
    console.log('1. Internet connection');
    console.log('2. Firebase project is correct');
});

req.end();
