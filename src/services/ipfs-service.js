/**
 * IPFS Service Integration for Fallback Transport
 */

const axios = require('axios');
const FormData = require('form-data');
const EventEmitter = require('events');

class IPFSService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            apiUrl: config.apiUrl || 'http://ipfs:5001/api/v0',
            gateways: config.gateways || ['https://cloudflare-ipfs.com', 'https://ipfs.io'],
            pubsubEnabled: config.pubsubEnabled || true,
            timeout: config.timeout || 15000
        };

        this.api = axios.create({
            baseURL: this.config.apiUrl,
            timeout: this.config.timeout
        });

        this.isConnected = false;
        this.init();
    }

    async init() {
        try {
            await this.checkConnection();
            this.isConnected = true;
            console.log('✅ IPFS service connected');
            this.emit('connected');
        } catch (error) {
            console.error('❌ IPFS service connection failed:', error.message);
            this.isConnected = false;
            this.emit('disconnected', error);
        }
    }

    async checkConnection() {
        const response = await this.api.post('/version');
        return response.data;
    }

    async addBuffer(buffer, options = {}) {
        const formData = new FormData();
        formData.append('file', buffer, { 
            filename: options.filename || 'payload.bin'
        });

        const response = await this.api.post('/add', formData, {
            headers: formData.getHeaders(),
            params: { pin: options.pin !== false }
        });

        const cid = response.data.Hash;
        console.log(`📎 Added to IPFS: ${cid}`);
        return cid;
    }

    async addJSON(data) {
        const buffer = Buffer.from(JSON.stringify(data), 'utf8');
        return this.addBuffer(buffer, { filename: 'data.json' });
    }

    async cat(cid) {
        const response = await this.api.post('/cat', null, {
            params: { arg: cid },
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    }

    async pubsubPublish(topic, data) {
        if (!this.config.pubsubEnabled) return;
        
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        await this.api.post('/pubsub/pub', null, {
            params: { arg: [topic, message] }
        });
        
        console.log(`📡 Published to ${topic}`);
    }

    async createMessageEnvelope(messageData) {
        return {
            type: messageData.type || 'message',
            version: '1.0',
            timestamp: new Date().toISOString(),
            sender_id: messageData.sender_id,
            recipient_id: messageData.recipient_id,
            encrypted_content: messageData.encrypted_content,
            nonce: require('crypto').randomBytes(16).toString('hex')
        };
    }

    getGatewayUrlsForCid(cid) {
        return this.config.gateways.map(gateway => 
            `${gateway.replace(/\/+$/, '')}/ipfs/${cid}`
        );
    }

    async healthCheck() {
        try {
            const nodeInfo = await this.getNodeInfo();
            const peers = await this.getSwarmPeers();
            
            return {
                status: 'healthy',
                nodeId: nodeInfo.ID,
                peerCount: peers.length,
                pubsubEnabled: this.config.pubsubEnabled
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    async getNodeInfo() {
        const response = await this.api.post('/id');
        return response.data;
    }

    async getSwarmPeers() {
        const response = await this.api.post('/swarm/peers');
        return response.data.Peers || [];
    }

    async cleanup() {
        this.removeAllListeners();
        console.log('✅ IPFS service cleanup completed');
    }
}

function createIPFSService(config) {
    return new IPFSService(config);
}

module.exports = {
    IPFSService,
    createIPFSService
};
