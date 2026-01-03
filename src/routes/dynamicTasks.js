const express = require('express');
const router = express.Router();
const db = require('../database');

// Get dynamic tasks for a specific date
router.get('/:date', (req, res) => {
  const { date } = req.params;
  
  db.all(
    'SELECT * FROM dynamic_tasks WHERE date = ? ORDER BY display_order, created_at',
    [date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// Create a new dynamic task
router.post('/', (req, res) => {
  const { id, date, text, is_focus, display_order } = req.body;
  
  if (!id || !date || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  db.run(
    `INSERT INTO dynamic_tasks (id, date, text, is_focus, display_order, updated_at) 
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [id, date, text, is_focus || 0, display_order || 0],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the newly created task
      db.get('SELECT * FROM dynamic_tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

// Update a dynamic task
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { text, is_focus, display_order } = req.body;
  
  const updates = [];
  const values = [];
  
  if (text !== undefined) {
    updates.push('text = ?');
    values.push(text);
  }
  if (is_focus !== undefined) {
    updates.push('is_focus = ?');
    values.push(is_focus);
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
    `UPDATE dynamic_tasks SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the updated task
      db.get('SELECT * FROM dynamic_tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

// Delete a dynamic task
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM dynamic_tasks WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

module.exports = router;
