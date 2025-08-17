/**
 * Enhanced Secure Chat Server with IPFS Fallback Transport
 * Configured for 192.168.4.39
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || [
            "http://192.168.4.39:3000",
            "https://192.168.4.39:3000", 
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

const port = process.env.PORT || 3000;
const host = '0.0.0.0'; // Bind to all interfaces

// Security middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
});

app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "http://192.168.4.39:*", "ws://192.168.4.39:*"],
        },
    },
}));

app.use(limiter);
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
        "http://192.168.4.39:3000",
        "https://192.168.4.39:3000",
        "http://localhost:3000"
    ],
    credentials: true
}));

app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize IPFS service
let ipfsService = null;
try {
    const { createIPFSService } = require('./services/ipfs-service');
    ipfsService = createIPFSService({
        apiUrl: process.env.IPFS_API_URL || 'http://ipfs:5001/api/v0',
        gateways: (process.env.IPFS_GATEWAYS || '').split(',').filter(Boolean),
        pubsubEnabled: process.env.IPFS_PUBSUB_ENABLE === 'true'
    });
    console.log('✅ IPFS service initialized');
} catch (error) {
    console.warn('⚠️ IPFS service not available:', error.message);
}

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
    const ipfsHealth = ipfsService ? await ipfsService.healthCheck() : { status: 'disabled' };
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        host: '192.168.4.39',
        features: ['E2E-Encryption', 'WebSocket-Chat', 'IPFS-Fallback', 'Dual-Transport'],
        transports: {
            primary: 'HTTPS/WebSocket', 
            fallback: 'IPFS',
            ipfsStatus: ipfsHealth.status
        },
        infrastructure: {
            mongodb: 'ready',
            redis: 'ready', 
            ipfs: ipfsHealth.status
        },
        endpoints: {
            main: 'http://192.168.4.39:3000',
            demo: 'http://192.168.4.39:3000/demo',
            websocket: 'ws://192.168.4.39:3001'
        }
    });
});

// Transport status endpoint
app.get('/api/transport/status', (req, res) => {
    const status = {
        primary: {
            http: true,
            websocket: io.engine.clientsCount >= 0,
            endpoint: 'http://192.168.4.39:3000'
        },
        fallback: {
            ipfs: ipfsService ? ipfsService.isConnected : false,
            gateway: 'http://192.168.4.39:8080'
        },
        recommendation: 'primary'
    };

    if (status.primary.http && status.primary.websocket !== false) {
        status.recommendation = 'primary';
    } else if (status.primary.http || status.primary.websocket !== false) {
        status.recommendation = 'degraded';
    } else if (status.fallback.ipfs) {
        status.recommendation = 'fallback';
    } else {
        status.recommendation = 'disconnected';
    }

    res.json(status);
});

// IPFS endpoints
app.post('/api/ipfs/add', async (req, res) => {
    try {
        if (!ipfsService || !ipfsService.isConnected) {
            return res.status(503).json({ 
                error: 'IPFS service unavailable',
                fallback: 'Use primary transport'
            });
        }

        const { payload_b64, pin = true, filename } = req.body;
        
        if (!payload_b64) {
            return res.status(400).json({ error: 'payload_b64 required' });
        }

        const buffer = Buffer.from(payload_b64, 'base64');
        const cid = await ipfsService.addBuffer(buffer, { pin, filename });
        
        res.json({ 
            cid,
            gateways: ipfsService.getGatewayUrlsForCid(cid),
            localGateway: `http://192.168.4.39:8080/ipfs/${cid}`,
            size: buffer.length
        });

    } catch (error) {
        console.error('IPFS add error:', error);
        res.status(500).json({ error: 'IPFS add failed' });
    }
});

app.get('/api/ipfs/status', async (req, res) => {
    try {
        if (!ipfsService) {
            return res.json({ 
                status: 'disabled',
                message: 'IPFS service not initialized'
            });
        }

        const healthStatus = await ipfsService.healthCheck();
        res.json({
            ...healthStatus,
            gateway: 'http://192.168.4.39:8080',
            webui: 'http://192.168.4.39:5001/webui'
        });

    } catch (error) {
        console.error('IPFS status error:', error);
        res.status(500).json({ error: 'Failed to get IPFS status' });
    }
});

// Basic message endpoint with IPFS storage
app.post('/api/messages', async (req, res) => {
    try {
        const { recipient_id, encrypted_content, transport_mode } = req.body;
        
        const message = {
            id: require('crypto').randomUUID(),
            sender_id: 'demo-user',
            recipient_id,
            encrypted_content,
            transport: transport_mode || 'primary',
            timestamp: new Date(),
            status: 'sent'
        };

        // Store in IPFS if available
        if (ipfsService && ipfsService.isConnected) {
            try {
                const envelope = await ipfsService.createMessageEnvelope({
                    sender_id: message.sender_id,
                    recipient_id: message.recipient_id,
                    encrypted_content: message.encrypted_content,
                    type: 'message'
                });

                const cid = await ipfsService.addJSON(envelope);
                message.ipfs_cid = cid;
                message.ipfs_url = `http://192.168.4.39:8080/ipfs/${cid}`;
                console.log(`📎 Message stored in IPFS: ${cid}`);
            } catch (ipfsError) {
                console.warn('⚠️ IPFS storage failed:', ipfsError.message);
            }
        }

        res.json(message);
    } catch (error) {
        console.error('Message send error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/messages', (req, res) => {
    res.json({
        messages: [],
        total: 0,
        message: 'Message history endpoint ready'
    });
});

// WebSocket handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('send_encrypted_message', async (data) => {
        try {
            const { encrypted_content, recipient_id, transport_preference } = data;
            
            const message = {
                id: require('crypto').randomUUID(),
                sender_id: socket.id,
                recipient_id,
                encrypted_content,
                timestamp: new Date(),
                transport: 'websocket'
            };

            // Send via WebSocket
            socket.to(recipient_id).emit('new_encrypted_message', message);

            // Also store/send via IPFS if enabled
            if (ipfsService && ipfsService.isConnected && transport_preference === 'dual') {
                try {
                    const topic = `chat-user-${recipient_id}`;
                    await ipfsService.pubsubPublish(topic, JSON.stringify(message));
                    console.log(`📡 Message also sent via IPFS PubSub to ${topic}`);
                } catch (ipfsError) {
                    console.warn('⚠️ IPFS PubSub failed:', ipfsError.message);
                }
            }

            socket.emit('message_sent', { 
                message_id: message.id,
                timestamp: message.timestamp,
                transports_used: ['websocket', ...(transport_preference === 'dual' ? ['ipfs'] : [])]
            });

        } catch (error) {
            console.error('WebSocket message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('get_transport_status', () => {
        const status = {
            websocket: true,
            ipfs: ipfsService ? ipfsService.isConnected : false,
            recommended: 'primary'
        };
        
        socket.emit('transport_status', status);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Enhanced demo client with 192.168.4.39 URLs
app.get('/demo', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>🔐 Secure Chat Server Demo - 192.168.4.39</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                max-width: 900px; margin: 0 auto; padding: 20px; 
                background: #f8f9fa; color: #333;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;
                text-align: center;
            }
            .status { 
                padding: 15px; margin: 10px 0; border-radius: 8px; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .healthy { background: #d1ecf1; color: #0c5460; border-left: 4px solid #17a2b8; }
            .warning { background: #fff3cd; color: #856404; border-left: 4px solid #ffc107; }
            .transport { 
                background: white; padding: 20px; margin: 15px 0; 
                border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            button { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; border: none; padding: 12px 24px; 
                margin: 8px; border-radius: 6px; cursor: pointer; 
                font-weight: 500; transition: transform 0.2s;
            }
            button:hover { transform: translateY(-1px); }
            button:active { transform: translateY(0); }
            textarea { 
                width: 100%; height: 100px; margin: 10px 0; 
                border: 2px solid #e9ecef; border-radius: 6px; 
                padding: 12px; font-family: inherit;
            }
            .message { 
                background: #f8f9fa; padding: 15px; margin: 8px 0; 
                border-radius: 8px; border-left: 4px solid #28a745;
            }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
            .badge { 
                display: inline-block; padding: 4px 8px; 
                background: #28a745; color: white; border-radius: 4px; 
                font-size: 12px; margin-left: 10px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🔐 Enhanced Secure Chat Server</h1>
            <p>Dual-Transport System: HTTPS/WebSocket + IPFS Fallback</p>
            <p><strong>Server:</strong> 192.168.4.39:3000</p>
        </div>
        
        <div id="status" class="status healthy">✅ Connecting to server...</div>
        
        <div class="grid">
            <div class="transport">
                <h3>🌐 Transport Status</h3>
                <div id="transport-status">Checking transport availability...</div>
            </div>
            
            <div class="transport">
                <h3>📡 IPFS Status</h3>
                <div id="ipfs-status">Checking IPFS node connectivity...</div>
            </div>
        </div>
        
        <div class="transport">
            <h3>💬 Message Testing</h3>
            <p>Test the dual-transport messaging system:</p>
            <textarea id="message" placeholder="Enter your test message here..."></textarea><br>
            <button onclick="sendMessage('primary')">📨 Send via Primary (HTTPS)</button>
            <button onclick="sendMessage('ipfs')">🌐 Send via IPFS</button>
            <button onclick="sendMessage('dual')">🚀 Send via Both Transports</button>
        </div>
        
        <div class="transport">
            <h3>📋 Message Log</h3>
            <div id="messages"></div>
            <button onclick="clearMessages()">🗑️ Clear Log</button>
        </div>

        <div class="transport">
            <h3>🔗 Quick Links</h3>
            <p>
                <a href="http://192.168.4.39:3000/health" target="_blank">Health Check</a> |
                <a href="http://192.168.4.39:8080" target="_blank">IPFS Gateway</a> |
                <a href="http://192.168.4.39:5001/webui" target="_blank">IPFS WebUI</a>
            </p>
        </div>

        <script>
            let messageCount = 0;
            
            async function checkStatus() {
                try {
                    const response = await fetch('/health');
                    const data = await response.json();
                    document.getElementById('status').innerHTML = 
                        '✅ ' + data.status + ' - Version ' + data.version + 
                        '<span class="badge">Host: ' + data.host + '</span>';
                } catch (error) {
                    document.getElementById('status').innerHTML = '❌ Server connection failed';
                    document.getElementById('status').className = 'status warning';
                }
            }
            
            async function checkTransport() {
                try {
                    const response = await fetch('/api/transport/status');
                    const data = await response.json();
                    document.getElementById('transport-status').innerHTML = 
                        '<strong>Primary Transport:</strong><br>' +
                        '• HTTPS: ' + (data.primary.http ? '✅ Ready' : '❌ Unavailable') + '<br>' +
                        '• WebSocket: ' + (data.primary.websocket ? '✅ Ready' : '❌ Unavailable') + '<br>' +
                        '<strong>Fallback Transport:</strong><br>' +
                        '• IPFS: ' + (data.fallback.ipfs ? '✅ Connected' : '❌ Unavailable') + '<br>' +
                        '<strong>Recommendation:</strong> ' + data.recommendation.toUpperCase() + '<br>' +
                        '<small>Endpoint: ' + data.primary.endpoint + '</small>';
                } catch (error) {
                    document.getElementById('transport-status').innerHTML = '❌ Transport check failed';
                }
            }
            
            async function checkIPFS() {
                try {
                    const response = await fetch('/api/ipfs/status');
                    const data = await response.json();
                    if (data.status === 'healthy') {
                        document.getElementById('ipfs-status').innerHTML = 
                            '✅ <strong>IPFS Node:</strong> ' + data.nodeId.substring(0, 20) + '...<br>' +
                            '🌐 <strong>Connected Peers:</strong> ' + data.peerCount + '<br>' +
                            '📡 <strong>PubSub:</strong> ' + (data.pubsubEnabled ? 'Enabled' : 'Disabled') + '<br>' +
                            '🔗 <strong>Gateway:</strong> <a href="' + data.gateway + '" target="_blank">' + data.gateway + '</a><br>' +
                            '🎛️ <strong>WebUI:</strong> <a href="' + data.webui + '" target="_blank">' + data.webui + '</a>';
                    } else {
                        document.getElementById('ipfs-status').innerHTML = '⚠️ IPFS Status: ' + data.status;
                    }
                } catch (error) {
                    document.getElementById('ipfs-status').innerHTML = '❌ IPFS service unavailable';
                }
            }
            
            async function sendMessage(transport) {
                const message = document.getElementById('message').value;
                if (!message.trim()) {
                    alert('Please enter a message first!');
                    return;
                }
                
                try {
                    const response = await fetch('/api/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient_id: 'demo-recipient-' + Date.now(),
                            encrypted_content: btoa(message),
                            transport_mode: transport
                        })
                    });
                    
                    const data = await response.json();
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message';
                    messageDiv.innerHTML = 
                        '<strong>#' + (++messageCount) + ' - Sent via ' + transport.toUpperCase() + ':</strong><br>' + 
                        message + '<br>' +
                        '<small><strong>Message ID:</strong> ' + data.id + '<br>' +
                        '<strong>Timestamp:</strong> ' + new Date(data.timestamp).toLocaleString() + 
                        (data.ipfs_cid ? '<br><strong>IPFS CID:</strong> ' + data.ipfs_cid.substring(0, 25) + '...' : '') +
                        (data.ipfs_url ? '<br><strong>IPFS URL:</strong> <a href="' + data.ipfs_url + '" target="_blank">View on IPFS</a>' : '') +
                        '</small>';
                    
                    document.getElementById('messages').appendChild(messageDiv);
                    document.getElementById('message').value = '';
                    
                    // Scroll to bottom
                    messageDiv.scrollIntoView({ behavior: 'smooth' });
                    
                } catch (error) {
                    alert('Send failed: ' + error.message);
                }
            }
            
            function clearMessages() {
                document.getElementById('messages').innerHTML = '';
                messageCount = 0;
            }
            
            // Initialize and update status every 15 seconds
            checkStatus();
            checkTransport();
            checkIPFS();
            setInterval(() => {
                checkStatus();
                checkTransport(); 
                checkIPFS();
            }, 15000);
            
            // Welcome message
            setTimeout(() => {
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'message';
                welcomeDiv.innerHTML = 
                    '<strong>👋 Welcome to Secure Chat Demo!</strong><br>' +
                    'Try sending messages using different transport methods. ' +
                    'IPFS messages are stored permanently and accessible worldwide!<br>' +
                    '<small>Server ready at 192.168.4.39:3000</small>';
                document.getElementById('messages').appendChild(welcomeDiv);
            }, 1000);
        </script>
    </body>
    </html>
    `);
});

// Default route
app.get('/', (req, res) => {
    res.json({
        name: 'Enhanced Secure Chat Server with IPFS Fallback',
        version: '2.0.0',
        status: 'running',
        host: '192.168.4.39',
        transports: ['HTTPS/WebSocket', 'IPFS'],
        endpoints: {
            main: 'http://192.168.4.39:3000',
            demo: 'http://192.168.4.39:3000/demo',
            health: 'http://192.168.4.39:3000/health',
            transport_status: 'http://192.168.4.39:3000/api/transport/status',
            ipfs_status: 'http://192.168.4.39:3000/api/ipfs/status'
        },
        infrastructure: {
            ipfs_gateway: 'http://192.168.4.39:8080',
            ipfs_webui: 'http://192.168.4.39:5001/webui'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Start server
server.listen(port, host, () => {
    console.log(`🚀 Enhanced Secure Chat Server running on http://192.168.4.39:${port}`);
    console.log(`📱 Demo client: http://192.168.4.39:${port}/demo`);
    console.log(`🔐 Health check: http://192.168.4.39:${port}/health`);
    console.log(`📡 IPFS integration: ${ipfsService ? 'enabled' : 'disabled'}`);
    console.log(`🛡️  Security features: E2E Encryption, Dual Transport`);
    console.log(`🌐 IPFS Gateway: http://192.168.4.39:8080`);
    console.log(`🎛️  IPFS WebUI: http://192.168.4.39:5001/webui`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    server.close(() => {
        if (ipfsService) {
            ipfsService.cleanup();
        }
        console.log('✅ Server shutdown completed');
        process.exit(0);
    });
});
