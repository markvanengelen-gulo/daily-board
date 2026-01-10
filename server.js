/**
 * Optional backend server for Daily Board
 * Provides WebSocket support for real-time cross-device synchronization
 * 
 * This is an OPTIONAL component - the app works without it using GitHub API directly
 * 
 * Features:
 * - WebSocket support for real-time sync
 * - Broadcasting changes to all connected clients
 * - Server-side logging
 * - CORS support for local development
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Connected clients tracking
let connectedClients = 0;

// WebSocket connection handling
io.on('connection', (socket) => {
    connectedClients++;
    console.log(`[WebSocket] Client connected. Total clients: ${connectedClients}`);
    console.log(`[WebSocket] Client ID: ${socket.id}`);
    
    // Send initial connection acknowledgment
    socket.emit('connected', {
        message: 'Connected to Daily Board server',
        clientId: socket.id,
        timestamp: new Date().toISOString()
    });
    
    // Handle data sync requests
    socket.on('sync:request', (data) => {
        console.log(`[WebSocket] Sync request from ${socket.id}`);
        
        try {
            // Read current data from file
            if (fs.existsSync(DATA_FILE)) {
                const fileData = fs.readFileSync(DATA_FILE, 'utf8');
                const appData = JSON.parse(fileData);
                socket.emit('sync:response', appData);
                console.log(`[WebSocket] Sent data to ${socket.id}`);
            } else {
                socket.emit('sync:response', { dateEntries: {}, tabs: [], listItems: {} });
                console.log(`[WebSocket] Sent empty data to ${socket.id} (file not found)`);
            }
        } catch (error) {
            console.error(`[WebSocket] Error reading data:`, error);
            socket.emit('sync:error', { message: 'Failed to read data', error: error.message });
        }
    });
    
    // Handle data updates
    socket.on('data:update', (data) => {
        console.log(`[WebSocket] Data update from ${socket.id}`);
        
        try {
            // Save to file
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            console.log(`[WebSocket] Data saved to file`);
            
            // Broadcast to all other clients (excluding sender)
            socket.broadcast.emit('data:updated', data);
            console.log(`[WebSocket] Broadcasted update to other clients`);
            
            // Acknowledge to sender
            socket.emit('data:saved', {
                success: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error(`[WebSocket] Error saving data:`, error);
            socket.emit('data:error', { message: 'Failed to save data', error: error.message });
        }
    });
    
    // Handle errors
    socket.on('error', (error) => {
        console.error(`[WebSocket] Socket error from ${socket.id}:`, error);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        connectedClients--;
        console.log(`[WebSocket] Client disconnected. Total clients: ${connectedClients}`);
    });
});

// REST API endpoints (for fallback/compatibility)

// Get current data
app.get('/api/data', (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const fileData = fs.readFileSync(DATA_FILE, 'utf8');
            const appData = JSON.parse(fileData);
            res.json(appData);
            console.log('[API] Data sent via REST API');
        } else {
            res.json({ dateEntries: {}, tabs: [], listItems: {} });
            console.log('[API] Empty data sent via REST API (file not found)');
        }
    } catch (error) {
        console.error('[API] Error reading data:', error);
        res.status(500).json({ error: 'Failed to read data', message: error.message });
    }
});

// Update data
app.post('/api/data', (req, res) => {
    try {
        const data = req.body;
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('[API] Data saved via REST API');
        
        // Broadcast to all WebSocket clients
        io.emit('data:updated', data);
        console.log('[API] Broadcasted update to WebSocket clients');
        
        res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[API] Error saving data:', error);
        res.status(500).json({ error: 'Failed to save data', message: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connectedClients
    });
});

// Start server
server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('Daily Board Server Started');
    console.log('='.repeat(60));
    console.log(`HTTP Server: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('Features:');
    console.log('  - Real-time sync via WebSocket');
    console.log('  - REST API fallback');
    console.log('  - Server-side logging');
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  ${PORT}/api/data   - Get current data`);
    console.log(`  POST ${PORT}/api/data   - Update data`);
    console.log(`  GET  ${PORT}/api/health - Health check`);
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});
