/**
 * Sync Providers for Daily Board
 * Modular sync providers for different cloud storage services
 */

// ============================================================================
// Base Sync Provider Interface
// ============================================================================

class SyncProvider {
    constructor(name) {
        this.name = name;
        this.isAvailable = false;
    }

    async checkAvailability() {
        throw new Error('checkAvailability must be implemented');
    }

    async fetchData() {
        throw new Error('fetchData must be implemented');
    }

    async updateData(data, message = 'Update data') {
        throw new Error('updateData must be implemented');
    }
}

// ============================================================================
// Dropbox Sync Provider
// ============================================================================

class DropboxSyncProvider extends SyncProvider {
    constructor() {
        super('dropbox');
        this.config = {
            accessToken: localStorage.getItem('dropboxToken') || '',
            filePath: '/daily-board/data.json'
        };
        this.fileRev = null; // Dropbox uses 'rev' for versioning
    }

    async checkAvailability() {
        if (!this.config.accessToken) {
            this.isAvailable = false;
            return false;
        }

        try {
            // Test the token by trying to get account info
            const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: null
            });

            this.isAvailable = response.ok;
            return response.ok;
        } catch (error) {
            console.error('[Dropbox] Availability check failed:', error);
            this.isAvailable = false;
            return false;
        }
    }

    async fetchData() {
        if (!this.config.accessToken) {
            throw new Error('Dropbox access token not configured');
        }

        try {
            // Download file from Dropbox
            const response = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({
                        path: this.config.filePath
                    })
                }
            });

            if (!response.ok) {
                if (response.status === 409) {
                    // File not found - return empty structure
                    console.log('[Dropbox] File not found, returning empty data');
                    return {
                        dateEntries: {},
                        tabs: [],
                        listItems: {}
                    };
                }
                throw new Error(`Dropbox download failed: ${response.status}`);
            }

            // Get file metadata from response headers
            const dropboxAPIResult = response.headers.get('Dropbox-API-Result');
            if (dropboxAPIResult) {
                const metadata = JSON.parse(dropboxAPIResult);
                this.fileRev = metadata.rev;
            }

            const data = await response.json();
            console.log('[Dropbox] Data fetched successfully');
            return data;
        } catch (error) {
            console.error('[Dropbox] Fetch failed:', error);
            throw error;
        }
    }

    async updateData(data, message = 'Update data') {
        if (!this.config.accessToken) {
            throw new Error('Dropbox access token not configured');
        }

        try {
            // Upload file to Dropbox
            const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/octet-stream',
                    'Dropbox-API-Arg': JSON.stringify({
                        path: this.config.filePath,
                        mode: 'overwrite', // Always overwrite for simplicity
                        autorename: false,
                        mute: false
                    })
                },
                body: JSON.stringify(data, null, 2)
            });

            if (!response.ok) {
                throw new Error(`Dropbox upload failed: ${response.status}`);
            }

            const metadata = await response.json();
            this.fileRev = metadata.rev;
            console.log('[Dropbox] Data updated successfully');
            return true;
        } catch (error) {
            console.error('[Dropbox] Update failed:', error);
            throw error;
        }
    }
}

// ============================================================================
// Google Drive Sync Provider
// ============================================================================

class GoogleDriveSyncProvider extends SyncProvider {
    constructor() {
        super('google-drive');
        this.config = {
            accessToken: localStorage.getItem('googleDriveToken') || '',
            fileName: 'daily-board-data.json',
            folderId: localStorage.getItem('googleDriveFolderId') || 'root'
        };
        this.fileId = null;
    }

    async checkAvailability() {
        if (!this.config.accessToken) {
            this.isAvailable = false;
            return false;
        }

        try {
            // Test the token by trying to get user info
            const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });

            this.isAvailable = response.ok;
            return response.ok;
        } catch (error) {
            console.error('[Google Drive] Availability check failed:', error);
            this.isAvailable = false;
            return false;
        }
    }

    async findOrCreateFile() {
        // Search for existing file (escape query parameters to prevent injection)
        const escapedFileName = this.config.fileName.replace(/'/g, "\\'");
        const escapedFolderId = this.config.folderId.replace(/'/g, "\\'");
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${escapedFileName}' and '${escapedFolderId}' in parents and trashed=false&fields=files(id,name)`;
        
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`
            }
        });

        if (!searchResponse.ok) {
            throw new Error(`Google Drive search failed: ${searchResponse.status}`);
        }

        const searchResult = await searchResponse.json();
        
        if (searchResult.files && searchResult.files.length > 0) {
            this.fileId = searchResult.files[0].id;
            return this.fileId;
        }

        // File doesn't exist, create it
        const metadata = {
            name: this.config.fileName,
            parents: [this.config.folderId],
            mimeType: 'application/json'
        };

        const initialData = {
            dateEntries: {},
            tabs: [],
            listItems: {}
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(initialData, null, 2)], { type: 'application/json' }));

        const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`
            },
            body: form
        });

        if (!createResponse.ok) {
            throw new Error(`Google Drive file creation failed: ${createResponse.status}`);
        }

        const createResult = await createResponse.json();
        this.fileId = createResult.id;
        return this.fileId;
    }

    async fetchData() {
        if (!this.config.accessToken) {
            throw new Error('Google Drive access token not configured');
        }

        try {
            // Find or create the file
            await this.findOrCreateFile();

            // Download file content
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // File not found - return empty structure
                    console.log('[Google Drive] File not found, returning empty data');
                    return {
                        dateEntries: {},
                        tabs: [],
                        listItems: {}
                    };
                }
                throw new Error(`Google Drive download failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Google Drive] Data fetched successfully');
            return data;
        } catch (error) {
            console.error('[Google Drive] Fetch failed:', error);
            throw error;
        }
    }

    async updateData(data, message = 'Update data') {
        if (!this.config.accessToken) {
            throw new Error('Google Drive access token not configured');
        }

        try {
            // Find or create the file
            await this.findOrCreateFile();

            // Update file content
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data, null, 2)
            });

            if (!response.ok) {
                throw new Error(`Google Drive upload failed: ${response.status}`);
            }

            console.log('[Google Drive] Data updated successfully');
            return true;
        } catch (error) {
            console.error('[Google Drive] Update failed:', error);
            throw error;
        }
    }
}

// ============================================================================
// Google Drive Public File Sync Provider
// ============================================================================

/**
 * GoogleDrivePublicSyncProvider - Sync provider for publicly accessible Google Drive files
 * This provider fetches data from a Google Drive file that is shared with "Anyone with the link"
 * No authentication token is required, making it ideal for read-only sync scenarios.
 */
class GoogleDrivePublicSyncProvider extends SyncProvider {
    constructor() {
        super('google-drive-public');
        this.config = {
            // Google Drive file ID extracted from share link
            // Format: https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
            fileId: localStorage.getItem('googleDrivePublicFileId') || '1AzWSa3AeJQJX3zjm4DEUN5TWY_sCakyq',
            // Direct download URL template
            downloadUrlTemplate: 'https://drive.google.com/uc?export=download&id='
        };
        this.lastFetchTime = null;
        this.fetchCache = null;
        this.cacheTimeout = 5000; // 5 seconds cache to avoid excessive requests
    }

    /**
     * Check if the public Google Drive file is accessible
     * @returns {Promise<boolean>}
     */
    async checkAvailability() {
        if (!this.config.fileId) {
            this.isAvailable = false;
            console.log('[Google Drive Public] No file ID configured');
            return false;
        }

        try {
            // Test the file by attempting to fetch it
            const testData = await this.fetchData();
            
            // Validate that the data has the expected structure
            const isValid = testData && 
                           typeof testData === 'object' &&
                           'dateEntries' in testData &&
                           'tabs' in testData &&
                           'listItems' in testData;
            
            this.isAvailable = isValid;
            
            if (isValid) {
                console.log('[Google Drive Public] File is accessible and valid');
            } else {
                console.warn('[Google Drive Public] File is accessible but has invalid structure');
            }
            
            return isValid;
        } catch (error) {
            console.error('[Google Drive Public] Availability check failed:', error);
            this.isAvailable = false;
            return false;
        }
    }

    /**
     * Fetch data from the public Google Drive file
     * @returns {Promise<Object>} The data from the Google Drive file
     */
    async fetchData() {
        // Check cache first to avoid excessive requests
        const now = Date.now();
        if (this.fetchCache && this.lastFetchTime && (now - this.lastFetchTime) < this.cacheTimeout) {
            console.log('[Google Drive Public] Returning cached data');
            return this.fetchCache;
        }

        try {
            const downloadUrl = `${this.config.downloadUrlTemplate}${this.config.fileId}`;
            
            console.log('[Google Drive Public] Fetching data from:', downloadUrl);
            
            // Fetch the file with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(downloadUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Try to parse as JSON
            let data;
            try {
                const text = await response.text();
                
                // Check if the response is HTML (Google Drive sometimes returns HTML for access denied)
                if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                    throw new Error('Received HTML instead of JSON. File may be inaccessible or not shared publicly.');
                }
                
                data = JSON.parse(text);
            } catch (parseError) {
                console.error('[Google Drive Public] Failed to parse JSON:', parseError);
                throw new Error(`Invalid JSON data: ${parseError.message}`);
            }

            // Validate the data structure
            if (!data || typeof data !== 'object') {
                throw new Error('Data is not a valid object');
            }

            // Ensure all required fields exist
            if (!('dateEntries' in data)) {
                console.warn('[Google Drive Public] Missing dateEntries field, initializing to empty object');
                data.dateEntries = {};
            }

            if (!('tabs' in data)) {
                console.warn('[Google Drive Public] Missing tabs field, initializing to empty array');
                data.tabs = [];
            }

            if (!('listItems' in data)) {
                console.warn('[Google Drive Public] Missing listItems field, initializing to empty object');
                data.listItems = {};
            }

            // Validate dateEntries structure
            if (typeof data.dateEntries !== 'object' || Array.isArray(data.dateEntries)) {
                console.warn('[Google Drive Public] Invalid dateEntries structure, resetting to empty object');
                data.dateEntries = {};
            }

            // Validate tabs structure
            if (!Array.isArray(data.tabs)) {
                console.warn('[Google Drive Public] Invalid tabs structure, resetting to empty array');
                data.tabs = [];
            }

            // Validate listItems structure
            if (typeof data.listItems !== 'object' || Array.isArray(data.listItems)) {
                console.warn('[Google Drive Public] Invalid listItems structure, resetting to empty object');
                data.listItems = {};
            }

            console.log('[Google Drive Public] Data fetched and validated successfully');
            
            // Update cache
            this.fetchCache = data;
            this.lastFetchTime = now;
            
            return data;
        } catch (error) {
            console.error('[Google Drive Public] Fetch failed:', error);
            
            // Provide more helpful error messages
            if (error.name === 'AbortError') {
                throw new Error('Request timeout: Google Drive file took too long to respond');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Network error: Unable to reach Google Drive. Check your internet connection.');
            } else {
                throw error;
            }
        }
    }

    /**
     * Update data to Google Drive
     * Note: This is read-only provider. Updates are not supported for public files.
     * @param {Object} data - The data to update (ignored)
     * @param {string} message - Update message (ignored)
     * @returns {Promise<boolean>}
     */
    async updateData(data, message = 'Update data') {
        console.warn('[Google Drive Public] This is a read-only sync provider. Updates are not supported.');
        console.warn('[Google Drive Public] To enable updates, use the authenticated GoogleDriveSyncProvider instead.');
        
        // Don't throw an error, just log a warning and return false
        // This allows the app to continue functioning in read-only mode
        return false;
    }

    /**
     * Clear the fetch cache
     */
    clearCache() {
        this.fetchCache = null;
        this.lastFetchTime = null;
        console.log('[Google Drive Public] Cache cleared');
    }

    /**
     * Update the Google Drive file ID
     * @param {string} fileId - The new file ID
     */
    setFileId(fileId) {
        this.config.fileId = fileId;
        localStorage.setItem('googleDrivePublicFileId', fileId);
        this.clearCache();
        console.log('[Google Drive Public] File ID updated to:', fileId);
    }

    /**
     * Extract file ID from Google Drive share URL
     * @param {string} url - Google Drive share URL
     * @returns {string|null} - Extracted file ID or null if invalid
     */
    static extractFileIdFromUrl(url) {
        // Match patterns like:
        // https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
        // https://drive.google.com/file/d/{FILE_ID}/view
        // https://drive.google.com/open?id={FILE_ID}
        
        const patterns = [
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /[?&]id=([a-zA-Z0-9_-]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }
}

// ============================================================================
// Export providers
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SyncProvider,
        DropboxSyncProvider,
        GoogleDriveSyncProvider,
        GoogleDrivePublicSyncProvider
    };
}
