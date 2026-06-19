const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initDb, dbRun, dbGet, dbAll } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'miva_super_secret_jwt_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Lazy Database Initialization Middleware for Serverless Environments (Vercel)
let dbInitialized = false;
let dbInitPromise = null;

async function ensureDb() {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = initDb().then(() => {
      dbInitialized = true;
    }).catch(err => {
      dbInitPromise = null; // Allow retrying on the next request
      throw err;
    });
  }
  return dbInitPromise;
}

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await ensureDb();
    } catch (err) {
      console.error('Lazy DB initialization failed:', err);
      return res.status(500).json({ error: 'Database initialization failed: ' + err.message });
    }
  }
  next();
});


// ==========================================
// Authentication Middleware
// ==========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Role Validation Middlewares
function requireAdmin(req, res, next) {
  if (req.user.role_id !== 1) {
    return res.status(403).json({ error: 'Access denied: Administrator role required' });
  }
  next();
}

function requireAdminOrOfficer(req, res, next) {
  if (req.user.role_id !== 1 && req.user.role_id !== 2) {
    return res.status(403).json({ error: 'Access denied: Administrator or Maintenance Officer role required' });
  }
  next();
}

// ==========================================
// API Auth Routes
// ==========================================

// Register a new user
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role_id } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Enforce Student/Staff (role_id 3) as default for security
  // Do not allow direct registration of Admins (role_id 1)
  const targetRoleId = role_id && [2, 3].includes(Number(role_id)) ? Number(role_id) : 3;

  try {
    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const result = await dbRun(`
      INSERT INTO users (name, email, password_hash, role_id)
      VALUES (?, ?, ?, ?)
    `, [name, email, hash, targetRoleId]);

    res.status(201).json({
      message: 'User registered successfully',
      userId: result.lastID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbGet(`
      SELECT u.*, r.name as role_name 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.email = ?
    `, [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role_id: user.role_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API User Management Routes (Admin Only)
// ==========================================

// Get all users
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll(`
      SELECT u.id, u.name, u.email, u.role_id, r.name as role_name 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.id DESC
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all maintenance officers (for assignments)
app.get('/api/users/officers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const officers = await dbAll('SELECT id, name, email FROM users WHERE role_id = 2');
    res.json(officers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Service Requests Routes
// ==========================================

// Create a service request
app.post('/api/requests', authenticateToken, async (req, res) => {
  const { title, description, category_id } = req.body;

  if (!title || !description || !category_id) {
    return res.status(400).json({ error: 'Title, description, and category_id are required' });
  }

  try {
    const category = await dbGet('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (!category) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    const result = await dbRun(`
      INSERT INTO service_requests (title, description, category_id, status, submitter_id)
      VALUES (?, ?, ?, 'Pending', ?)
    `, [title, description, category_id, req.user.id]);

    // Log the initial state in audit trail
    await dbRun(`
      INSERT INTO status_logs (request_id, old_status, new_status, updated_by_id, remarks)
      VALUES (?, NULL, 'Pending', ?, 'Request submitted')
    `, [result.lastID, req.user.id]);

    res.status(201).json({
      message: 'Service request created successfully',
      requestId: result.lastID
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get service requests (with filter, search, pagination)
app.get('/api/requests', authenticateToken, async (req, res) => {
  const { search, category_id, status, page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = `
    SELECT r.*, c.name as category_name, u.name as submitter_name, u.email as submitter_email,
           o.name as officer_name, o.id as officer_id
    FROM service_requests r
    JOIN categories c ON r.category_id = c.id
    JOIN users u ON r.submitter_id = u.id
    LEFT JOIN assignments a ON r.id = a.request_id
    LEFT JOIN users o ON a.officer_id = o.id
    WHERE 1=1
  `;
  const params = [];

  // Role-based filtering
  if (req.user.role_id === 3) {
    // Student/Staff can only see their own requests
    query += ' AND r.submitter_id = ?';
    params.push(req.user.id);
  } else if (req.user.role_id === 2) {
    // Maintenance Officer only sees requests assigned to them
    query += ' AND a.officer_id = ?';
    params.push(req.user.id);
  }

  // Filter by category
  if (category_id) {
    query += ' AND r.category_id = ?';
    params.push(Number(category_id));
  }

  // Filter by status
  if (status) {
    query += ' AND r.status = ?';
    params.push(status);
  }

  // Search keyword (matches title or description)
  if (search) {
    query += ' AND (r.title LIKE ? OR r.description LIKE ?)';
    const likeVal = `%${search}%`;
    params.push(likeVal, likeVal);
  }

  // Count total matches for pagination headers
  const countQuery = `SELECT COUNT(*) as count FROM (${query})`;
  
  // Append ordering and pagination limit/offset
  query += ` ORDER BY r.id DESC LIMIT ? OFFSET ?`;
  const runParams = [...params, Number(limit), offset];

  try {
    const totalCountRow = await dbGet(countQuery, params);
    const requests = await dbAll(query, runParams);

    res.json({
      data: requests,
      pagination: {
        total: totalCountRow.count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(totalCountRow.count / Number(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single request detail with audit trail logs
app.get('/api/requests/:id', authenticateToken, async (req, res) => {
  const requestId = Number(req.params.id);

  try {
    const request = await dbGet(`
      SELECT r.*, c.name as category_name, u.name as submitter_name, u.email as submitter_email,
             o.name as officer_name, o.id as officer_id
      FROM service_requests r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.submitter_id = u.id
      LEFT JOIN assignments a ON r.id = a.request_id
      LEFT JOIN users o ON a.officer_id = o.id
      WHERE r.id = ?
    `, [requestId]);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Access control check
    if (req.user.role_id === 3 && request.submitter_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You can only view your own requests' });
    }
    if (req.user.role_id === 2 && request.officer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You can only view requests assigned to you' });
    }

    // Fetch audit trail / history logs for this request
    const logs = await dbAll(`
      SELECT l.*, u.name as updated_by_name, u.email as updated_by_email
      FROM status_logs l
      JOIN users u ON l.updated_by_id = u.id
      WHERE l.request_id = ?
      ORDER BY l.id ASC
    `, [requestId]);

    res.json({
      request,
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update request status (Admin or Assigned Officer only)
app.put('/api/requests/:id/status', authenticateToken, requireAdminOrOfficer, async (req, res) => {
  const requestId = Number(req.params.id);
  const { status, remarks } = req.body;

  if (!status || !['Pending', 'In Progress', 'Completed'].includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (Pending, In Progress, Completed)' });
  }

  try {
    const request = await dbGet(`
      SELECT r.status, a.officer_id 
      FROM service_requests r
      LEFT JOIN assignments a ON r.id = a.request_id
      WHERE r.id = ?
    `, [requestId]);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // If Maintenance Officer, verify they are the assigned officer
    if (req.user.role_id === 2 && request.officer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You can only update requests assigned to you' });
    }

    const oldStatus = request.status;
    if (oldStatus === status) {
      return res.status(400).json({ error: `Request status is already ${status}` });
    }

    // Update status
    await dbRun('UPDATE service_requests SET status = ? WHERE id = ?', [status, requestId]);

    // Insert audit log
    await dbRun(`
      INSERT INTO status_logs (request_id, old_status, new_status, updated_by_id, remarks)
      VALUES (?, ?, ?, ?, ?)
    `, [requestId, oldStatus, status, req.user.id, remarks || `Status updated to ${status}`]);

    res.json({ message: 'Request status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign request to a Maintenance Officer (Admin only)
app.post('/api/requests/:id/assign', authenticateToken, requireAdmin, async (req, res) => {
  const requestId = Number(req.params.id);
  const { officer_id, remarks } = req.body;

  if (!officer_id) {
    return res.status(400).json({ error: 'officer_id is required' });
  }

  try {
    // Verify request exists
    const request = await dbGet('SELECT status FROM service_requests WHERE id = ?', [requestId]);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify officer exists and has the correct role
    const officer = await dbGet('SELECT name FROM users WHERE id = ? AND role_id = 2', [officer_id]);
    if (!officer) {
      return res.status(400).json({ error: 'Invalid officer_id: user is not a Maintenance Officer' });
    }

    // Insert or update assignment
    await dbRun(`
      INSERT INTO assignments (request_id, officer_id)
      VALUES (?, ?)
      ON CONFLICT(request_id) DO UPDATE SET officer_id = excluded.officer_id, assigned_at = CURRENT_TIMESTAMP
    `, [requestId, officer_id]);

    // Log the assignment action in audit trail
    await dbRun(`
      INSERT INTO status_logs (request_id, old_status, new_status, updated_by_id, remarks)
      VALUES (?, ?, ?, ?, ?)
    `, [
      requestId, 
      request.status, 
      request.status, 
      req.user.id, 
      remarks || `Assigned to officer ${officer.name}`
    ]);

    res.json({ message: `Request assigned to ${officer.name} successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API Report / Log Audit Trail Routes (Admin Only)
// ==========================================

// Get all audit trail logs
app.get('/api/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT l.*, r.title as request_title, u.name as updated_by_name
      FROM status_logs l
      JOIN service_requests r ON l.request_id = r.id
      JOIN users u ON l.updated_by_id = u.id
      ORDER BY l.id DESC
    `);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export all requests data as CSV report
app.get('/api/reports/csv', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requests = await dbAll(`
      SELECT r.id, r.title, r.description, c.name as category, r.status,
             u.name as submitter, r.created_at, o.name as assigned_officer
      FROM service_requests r
      JOIN categories c ON r.category_id = c.id
      JOIN users u ON r.submitter_id = u.id
      LEFT JOIN assignments a ON r.id = a.request_id
      LEFT JOIN users o ON a.officer_id = o.id
      ORDER BY r.id DESC
    `);

    // Build CSV string
    const headers = ['Request ID', 'Title', 'Description', 'Category', 'Status', 'Submitter', 'Created At', 'Assigned Officer'];
    const csvRows = [headers.join(',')];

    for (const r of requests) {
      // Escape double quotes and wrap text fields
      const row = [
        r.id,
        `"${r.title.replace(/"/g, '""')}"`,
        `"${r.description.replace(/"/g, '""')}"`,
        `"${r.category.replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.submitter.replace(/"/g, '""')}"`,
        `"${r.created_at}"`,
        `"${(r.assigned_officer || 'Unassigned').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=maintenance_requests_report.csv');
    res.status(200).send(csvRows.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Start Web Server
// ==========================================
if (require.main === module) {
  initDb().then(() => {
    dbInitialized = true;
    app.listen(PORT, () => {
      console.log(`MIVA Maintenance System running on port ${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

module.exports = app; // For integration testing
