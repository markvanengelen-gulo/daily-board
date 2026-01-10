# WebSocket Server Setup Guide

## Overview

The Daily Board WebSocket server is an **optional** component that enables real-time synchronization across multiple devices. The app works perfectly fine without it using GitHub API for sync.

## When to Use the WebSocket Server

Use the WebSocket server when:
- You want instant real-time updates across devices
- You're working on a local network or have a dedicated server
- You want to reduce GitHub API calls
- You need faster sync (sub-second updates instead of user-triggered)

## Installation

1. **Install Node.js** (v16 or higher)
   - Download from https://nodejs.org/

2. **Install dependencies**
   ```bash
   npm install
   ```

## Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 3000 by default.

## Enabling WebSocket in the Client

To enable WebSocket sync in the Daily Board app:

1. **Add Socket.IO client library** to `index.html`:
   ```html
   <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
   ```

2. **Enable WebSocket in app.js**:
   ```javascript
   const WEBSOCKET_CONFIG = {
       enabled: true,  // Set to true
       url: 'ws://localhost:3000',  // Update to your server URL
       socket: null
   };
   ```

3. **Reload the app** - it will now use WebSocket for real-time sync

## Features

### Real-time Sync
- Changes are broadcast to all connected clients instantly
- Multiple users can work simultaneously
- Conflicts are handled by last-write-wins

### Fallback Support
- If WebSocket fails, app falls back to GitHub API sync
- Seamless degradation ensures app keeps working

### Server-side Logging
- All operations are logged with timestamps
- Easy debugging of sync issues
- Track connected clients

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### CORS
The server is configured to allow all origins in development. For production, update the CORS settings in `server.js`:

```javascript
const io = socketIO(server, {
    cors: {
        origin: 'https://yourdomain.com',  // Your domain
        methods: ['GET', 'POST']
    }
});
```

## API Endpoints

### WebSocket Events

**Client → Server:**
- `sync:request` - Request current data
- `data:update` - Send data update

**Server → Client:**
- `connected` - Connection acknowledgment
- `sync:response` - Current data response
- `data:updated` - Broadcast when data changes
- `data:saved` - Confirmation of save
- `sync:error` / `data:error` - Error notifications

### REST API (Fallback)

- `GET /api/data` - Get current data
- `POST /api/data` - Update data
- `GET /api/health` - Health check

## Deployment

### Local Network
1. Start the server on one machine
2. Update WebSocket URL to use the server's IP: `ws://192.168.1.x:3000`
3. Connect from other devices on the same network

### Cloud Deployment
Deploy to any Node.js hosting service:
- Heroku
- DigitalOcean
- AWS
- Google Cloud
- Azure

Update the WebSocket URL to your deployed server.

## Security Notes

- The server has no authentication by default
- Add authentication if deploying publicly
- Use WSS (secure WebSocket) in production
- Consider implementing rate limiting

## Troubleshooting

### Cannot connect to WebSocket
- Check if server is running: `curl http://localhost:3000/api/health`
- Verify firewall allows connections on port 3000
- Check CORS settings if accessing from different domain

### Data not syncing
- Check browser console for WebSocket errors
- Verify `WEBSOCKET_CONFIG.enabled` is true
- Ensure Socket.IO client library is loaded

### Server crashes
- Check server logs for errors
- Ensure Node.js version is 16+
- Verify file permissions for data.json

## Monitoring

The server logs all operations:
```
[2026-01-10T16:30:00.000Z] GET /api/health
[WebSocket] Client connected. Total clients: 2
[WebSocket] Sync request from abc123
[WebSocket] Data saved to file
[WebSocket] Broadcasted update to other clients
```

Monitor these logs to debug sync issues.
