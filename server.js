// server.js - Express backend for consultant database
const express = require('express');
const app = express();

// ADD THIS DEBUG CODE:
console.log('🔍 Debugging route registration...');

// Override app.get, app.post, etc. to log routes as they're registered
const originalMethods = ['get', 'post', 'put', 'delete', 'use'];
originalMethods.forEach(method => {
  const original = app[method];
  app[method] = function(path, ...args) {
    console.log(`📍 Registering ${method.toUpperCase()}: ${path}`);
    return original.call(this, path, ...args);
  };
});

const PORT = process.env.PORT || 3001;
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');


// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.join(__dirname, 'consultants.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Create consultants table
  db.run(`CREATE TABLE IF NOT EXISTS consultants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm TEXT NOT NULL,
    contact TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    service TEXT NOT NULL,
    regions TEXT NOT NULL,
    is_custom BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create regions table for normalized storage (optional)
  db.run(`CREATE TABLE IF NOT EXISTS regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);

  // Create services table for normalized storage (optional)
  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);
});

// Load initial data from JSON file (built-in consultants)
const loadInitialData = () => {
  try {
    const initialDataPath = path.join(__dirname, 'data', 'consultants.json');
    if (fs.existsSync(initialDataPath)) {
      const consultantData = JSON.parse(fs.readFileSync(initialDataPath, 'utf8'));
      
      // Insert built-in consultants (if not already exists)
      consultantData.forEach(consultant => {
        db.run(
          `INSERT OR IGNORE INTO consultants (firm, contact, email, phone, service, regions, is_custom) 
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [
            consultant.firm,
            consultant.contact,
            consultant.email,
            consultant.phone || null,
            consultant.service,
            JSON.stringify(consultant.regions),
            0 // Built-in consultant
          ]
        );
      });
      
      console.log('Initial consultant data loaded successfully');
    }
  } catch (error) {
    console.error('Error loading initial data:', error);
  }
};

// Load initial data on startup
loadInitialData();

// API Routes

// GET /api/consultants - Get all consultants
app.get('/api/consultants', (req, res) => {
  const { service, region, search } = req.query;
  
  let query = `SELECT * FROM consultants WHERE 1=1`;
  const params = [];
  
  if (service) {
    query += ` AND service = ?`;
    params.push(service);
  }
  
  if (region) {
    query += ` AND regions LIKE ?`;
    params.push(`%"${region}"%`);
  }
  
  if (search) {
    query += ` AND (firm LIKE ? OR contact LIKE ? OR email LIKE ? OR service LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  query += ` ORDER BY firm ASC`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Parse regions JSON for each consultant
    const consultants = rows.map(row => ({
      ...row,
      regions: JSON.parse(row.regions),
      isCustom: Boolean(row.is_custom)
    }));
    
    res.json(consultants);
  });
});

// GET /api/consultants/:id - Get specific consultant
app.get('/api/consultants/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM consultants WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Consultant not found' });
    }
    
    const consultant = {
      ...row,
      regions: JSON.parse(row.regions),
      isCustom: Boolean(row.is_custom)
    };
    
    res.json(consultant);
  });
});

// POST /api/consultants - Add new consultant
app.post('/api/consultants', (req, res) => {
  const { firm, contact, email, phone, service, regions } = req.body;
  
  // Validation
  if (!firm || !contact || !email || !service || !regions || regions.length === 0) {
    return res.status(400).json({ 
      error: 'Missing required fields: firm, contact, email, service, regions' 
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // Check for duplicate email
  db.get('SELECT id FROM consultants WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (row) {
      return res.status(409).json({ error: 'Consultant with this email already exists' });
    }
    
    // Insert new consultant
    db.run(
      `INSERT INTO consultants (firm, contact, email, phone, service, regions, is_custom, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [firm, contact, email, phone || null, service, JSON.stringify(regions)],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to create consultant' });
        }
        
        // Return the created consultant
        const newConsultant = {
          id: this.lastID,
          firm,
          contact,
          email,
          phone: phone || null,
          service,
          regions,
          isCustom: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        res.status(201).json(newConsultant);
      }
    );
  });
});

// PUT /api/consultants/:id - Update consultant
app.put('/api/consultants/:id', (req, res) => {
  const { id } = req.params;
  const { firm, contact, email, phone, service, regions } = req.body;
  
  // Validation
  if (!firm || !contact || !email || !service || !regions || regions.length === 0) {
    return res.status(400).json({ 
      error: 'Missing required fields: firm, contact, email, service, regions' 
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // Check if consultant exists
  db.get('SELECT * FROM consultants WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Consultant not found' });
    }
    
    // Check for duplicate email (excluding current consultant)
    db.get('SELECT id FROM consultants WHERE email = ? AND id != ?', [email, id], (err, duplicateRow) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (duplicateRow) {
        return res.status(409).json({ error: 'Another consultant with this email already exists' });
      }
      
      // Update consultant
      db.run(
        `UPDATE consultants 
         SET firm = ?, contact = ?, email = ?, phone = ?, service = ?, regions = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [firm, contact, email, phone || null, service, JSON.stringify(regions), id],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to update consultant' });
          }
          
          // Return updated consultant
          const updatedConsultant = {
            id: parseInt(id),
            firm,
            contact,
            email,
            phone: phone || null,
            service,
            regions,
            isCustom: Boolean(row.is_custom),
            created_at: row.created_at,
            updated_at: new Date().toISOString()
          };
          
          res.json(updatedConsultant);
        }
      );
    });
  });
});

// DELETE /api/consultants/:id - Delete consultant
app.delete('/api/consultants/:id', (req, res) => {
  const { id } = req.params;
  
  // Check if consultant exists and is custom (only custom consultants can be deleted)
  db.get('SELECT * FROM consultants WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Consultant not found' });
    }
    
    if (!row.is_custom) {
      return res.status(403).json({ error: 'Built-in consultants cannot be deleted' });
    }
    
    // Delete consultant
    db.run('DELETE FROM consultants WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to delete consultant' });
      }
      
      res.json({ message: 'Consultant deleted successfully', deletedId: parseInt(id) });
    });
  });
});

// GET /api/services - Get all unique services
app.get('/api/services', (req, res) => {
  db.all('SELECT DISTINCT service FROM consultants ORDER BY service ASC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const services = rows.map(row => row.service);
    res.json(services);
  });
});

// GET /api/regions - Get all unique regions
app.get('/api/regions', (req, res) => {
  db.all('SELECT regions FROM consultants', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const allRegions = new Set();
    rows.forEach(row => {
      const regions = JSON.parse(row.regions);
      regions.forEach(region => allRegions.add(region));
    });
    
    const uniqueRegions = Array.from(allRegions).sort();
    res.json(uniqueRegions);
  });
});

// GET /api/stats - Get database statistics
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  // Get total consultants
  db.get('SELECT COUNT(*) as total FROM consultants', [], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    stats.totalConsultants = row.total;
    
    // Get custom consultants count
    db.get('SELECT COUNT(*) as custom FROM consultants WHERE is_custom = 1', [], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      stats.customConsultants = row.custom;
      stats.builtInConsultants = stats.totalConsultants - stats.customConsultants;
      
      // Get services count
      db.get('SELECT COUNT(DISTINCT service) as services FROM consultants', [], (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        stats.totalServices = row.services;
        
        // Get regions count
        db.all('SELECT regions FROM consultants', [], (err, rows) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          const allRegions = new Set();
          rows.forEach(row => {
            const regions = JSON.parse(row.regions);
            regions.forEach(region => allRegions.add(region));
          });
          
          stats.totalRegions = allRegions.size;
          stats.lastUpdated = new Date().toISOString();
          
          res.json(stats);
        });
      });
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database closed.');
    }
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Consultant API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api/`);
});

module.exports = app;