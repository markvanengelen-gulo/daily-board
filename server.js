const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database
const db = require('./src/database');

// Import routes
const fixedTasksRouter = require('./src/routes/fixedTasks');
const dynamicTasksRouter = require('./src/routes/dynamicTasks');
const listsRouter = require('./src/routes/lists');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/fixed-tasks', fixedTasksRouter);
app.use('/api/dynamic-tasks', dynamicTasksRouter);
app.use('/api/lists', listsRouter);

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
