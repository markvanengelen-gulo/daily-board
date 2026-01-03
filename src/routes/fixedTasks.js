const express = require('express');
const router = express.Router();
const db = require('../database');

const FIXED_TASKS = [
  'WH Breathing',
  'Yoga',
  'Pull up bar / weights',
  'Review Goals and Actions',
  'Update Finances'
];

// Get fixed tasks for a specific date
router.get('/:date', (req, res) => {
  const { date } = req.params;
  
  db.all(
    'SELECT * FROM fixed_daily_tasks WHERE date = ? ORDER BY id',
    [date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // If no tasks exist for this date, initialize them
      if (rows.length === 0) {
        const stmt = db.prepare(
          'INSERT OR IGNORE INTO fixed_daily_tasks (date, task_name) VALUES (?, ?)'
        );
        
        FIXED_TASKS.forEach((taskName) => {
          stmt.run(date, taskName);
        });
        
        stmt.finalize(() => {
          // Fetch the newly created tasks
          db.all(
            'SELECT * FROM fixed_daily_tasks WHERE date = ? ORDER BY id',
            [date],
            (err, newRows) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.json(newRows);
            }
          );
        });
      } else {
        res.json(rows);
      }
    }
  );
});

// Toggle task completion
router.post('/:id/toggle', (req, res) => {
  const { id } = req.params;
  
  db.run(
    'UPDATE fixed_daily_tasks SET completed = NOT completed WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the updated task
      db.get('SELECT * FROM fixed_daily_tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

// Toggle task removed status
router.post('/:id/remove', (req, res) => {
  const { id } = req.params;
  
  db.run(
    'UPDATE fixed_daily_tasks SET removed = NOT removed WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Fetch the updated task
      db.get('SELECT * FROM fixed_daily_tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(row);
      });
    }
  );
});

module.exports = router;
