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
        // Search for existing file
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${this.config.fileName}' and '${this.config.folderId}' in parents and trashed=false&fields=files(id,name)`;
        
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
// Export providers
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SyncProvider,
        DropboxSyncProvider,
        GoogleDriveSyncProvider
    };
}
