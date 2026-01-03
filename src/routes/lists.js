const express = require('express');
const router = express.Router();
const db = require('../database');

// Get all list tabs
router.get('/tabs', (req, res) => {
  db.all(
    'SELECT * FROM list_tabs ORDER BY display_order, created_at',
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// Create a new list tab
router.post('/tabs', (req, res) => {
  const { name, display_order } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Tab name is required' });
  }
  
  db.run(
    `INSERT INTO list_tabs (name, display_order, updated_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
    [name, display_order || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the newly created tab
      db.get('SELECT * FROM list_tabs WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

// Update a list tab
router.put('/tabs/:id', (req, res) => {
  const { id } = req.params;
  const { name, display_order } = req.body;
  
  const updates = [];
  const values = [];
  
  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (display_order !== undefined) {
    updates.push('display_order = ?');
    values.push(display_order);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  db.run(
    `UPDATE list_tabs SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the updated tab
      db.get('SELECT * FROM list_tabs WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

// Delete a list tab
router.delete('/tabs/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM list_tabs WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// Get content for a specific tab
router.get('/content/:tabName', (req, res) => {
  const { tabName } = req.params;
  
  db.get(
    'SELECT * FROM list_content WHERE tab_name = ?',
    [tabName],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(row || { tab_name: tabName, content: '' });
    }
  );
});

// Save or update content for a specific tab
router.post('/content', (req, res) => {
  const { tab_name, content } = req.body;
  
  if (!tab_name) {
    return res.status(400).json({ error: 'Tab name is required' });
  }
  
  db.run(
    `INSERT INTO list_content (tab_name, content, updated_at) 
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(tab_name) DO UPDATE SET 
       content = excluded.content,
       updated_at = CURRENT_TIMESTAMP`,
    [tab_name, content || ''],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the updated content
      db.get('SELECT * FROM list_content WHERE tab_name = ?', [tab_name], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

module.exports = router;
