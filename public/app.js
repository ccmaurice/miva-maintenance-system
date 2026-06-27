const API_BASE = window.location.origin;

// State Variables
let token = localStorage.getItem('miva_token') || null;
let user = JSON.parse(localStorage.getItem('miva_user')) || null;
let activeTab = 'dashboard';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  if (token && user) {
    showAuthenticatedUI();
  } else {
    showUnauthenticatedUI();
  }
});

// ==========================================
// Authentication UI Toggles
// ==========================================
function showAuthenticatedUI() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-navbar').style.display = 'flex';
  document.getElementById('dashboard-container').style.display = 'block';
  
  // Show mobile bottom nav on mobile if logged in
  const mobileNav = document.getElementById('mobile-bottom-nav');
  if (mobileNav) mobileNav.classList.add('visible');
  
  // Set display name and role
  document.getElementById('display-user-name').textContent = user.name;
  document.getElementById('display-user-role').textContent = user.role_name;

  // Toggle role view
  document.querySelectorAll('.role-view').forEach(view => view.style.display = 'none');
  if (user.role_id === 1) {
    document.getElementById('view-admin').style.display = 'block';
    loadAdminDashboard();
  } else if (user.role_id === 2) {
    document.getElementById('view-officer').style.display = 'block';
    document.querySelector('.officer-name-placeholder').textContent = user.name;
    loadOfficerDashboard();
  } else {
    document.getElementById('view-student').style.display = 'block';
    document.querySelector('.student-name-placeholder').textContent = user.name;
    loadStudentDashboard();
  }
  
  // Set Authorization header for report download link
  const csvBtn = document.getElementById('download-report-btn');
  if (csvBtn) {
    csvBtn.href = `${API_BASE}/api/reports/csv?token=${token}`; // Support token in query params for direct download
  }
}

function showUnauthenticatedUI() {
  document.getElementById('app-navbar').style.display = 'none';
  document.getElementById('dashboard-container').style.display = 'none';
  document.getElementById('api-docs-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'flex';
  
  // Hide mobile bottom nav on logout
  const mobileNav = document.getElementById('mobile-bottom-nav');
  if (mobileNav) mobileNav.classList.remove('visible');
  
  toggleAuthForms(false);
}

function toggleAuthForms(showReg) {
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const subtitle = document.getElementById('auth-subtitle');

  if (showReg) {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    subtitle.textContent = 'Create a new MIVA portal account';
  } else {
    regForm.style.display = 'none';
    loginForm.style.display = 'block';
    subtitle.textContent = 'Sign in to your maintenance portal';
  }
}

// Switch between Tabs (Dashboard vs API Docs)
window.switchTab = function(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Sync mobile bottom navigation tabs active state
  document.querySelectorAll('.mobile-nav-item').forEach(tab => tab.classList.remove('active'));
  const mobileTab = document.getElementById(`mobile-tab-${tabName}`);
  if (mobileTab) mobileTab.classList.add('active');

  if (tabName === 'dashboard') {
    document.getElementById('api-docs-container').style.display = 'none';
    document.getElementById('dashboard-container').style.display = 'block';
    showAuthenticatedUI(); // Reload dashboards
  } else {
    document.getElementById('dashboard-container').style.display = 'none';
    document.getElementById('api-docs-container').style.display = 'block';
  }
};

// ==========================================
// API Request Helpers
// ==========================================
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    
    // Handle auth failure
    if (res.status === 401 || res.status === 403) {
      handleLogout();
      throw new Error('Authentication expired or invalid');
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Call error at ${endpoint}:`, err);
    throw err;
  }
}

// ==========================================
// Authentication Handlers
// ==========================================
window.handleLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await apiCall('/api/auth/login', 'POST', { email, password });
    token = res.token;
    user = res.user;

    localStorage.setItem('miva_token', token);
    localStorage.setItem('miva_user', JSON.stringify(user));
    
    // Clear form
    document.getElementById('login-form').reset();
    showAuthenticatedUI();
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const role_id = document.getElementById('reg-role').value;

  try {
    await apiCall('/api/auth/register', 'POST', { name, email, password, role_id });
    alert('Account created successfully! Please sign in.');
    document.getElementById('register-form').reset();
    toggleAuthForms(false);
  } catch (err) {
    alert(`Registration failed: ${err.message}`);
  }
};

window.handleLogout = function() {
  token = null;
  user = null;
  localStorage.removeItem('miva_token');
  localStorage.removeItem('miva_user');
  showUnauthenticatedUI();
};

// ==========================================
// A. Student/Staff Dashboard Logic
// ==========================================
function loadStudentDashboard() {
  fetchStudentRequests();
}

window.fetchStudentRequests = async function(page = 1) {
  const search = document.getElementById('student-search').value;
  const status = document.getElementById('student-filter-status').value;
  
  let endpoint = `/api/requests?page=${page}&limit=5`;
  if (search) endpoint += `&search=${encodeURIComponent(search)}`;
  if (status) endpoint += `&status=${status}`;

  try {
    const res = await apiCall(endpoint);
    const tbody = document.getElementById('student-requests-body');
    tbody.innerHTML = '';

    if (res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No maintenance requests found.</td></tr>`;
      document.getElementById('student-pagination').innerHTML = '';
      return;
    }

    res.data.forEach(req => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="ID">${req.id}</td>
        <td data-label="Title"><strong>${req.title}</strong></td>
        <td data-label="Category">${req.category_name}</td>
        <td data-label="Date Submitted">${new Date(req.created_at).toLocaleDateString()}</td>
        <td data-label="Status"><span class="status-badge ${getStatusClass(req.status)}">${req.status}</span></td>
        <td data-label="Officer Assigned">${req.officer_name || '<span class="text-muted">Unassigned</span>'}</td>
        <td data-label="Action">
          <button class="btn btn-secondary btn-sm" onclick="openDetailModal(${req.id})">History</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination('student-pagination', res.pagination, 'fetchStudentRequests');
  } catch (err) {
    console.error(err);
  }
};

window.handleCreateRequest = async function(e) {
  e.preventDefault();
  const title = document.getElementById('req-title').value;
  const category_id = document.getElementById('req-category').value;
  const description = document.getElementById('req-desc').value;

  try {
    await apiCall('/api/requests', 'POST', { title, category_id, description });
    alert('Maintenance request submitted successfully!');
    document.getElementById('request-form').reset();
    fetchStudentRequests();
  } catch (err) {
    alert(`Submission failed: ${err.message}`);
  }
};

// ==========================================
// B. Maintenance Officer Dashboard Logic
// ==========================================
function loadOfficerDashboard() {
  fetchOfficerRequests();
}

window.fetchOfficerRequests = async function(page = 1) {
  const search = document.getElementById('officer-search').value;
  const status = document.getElementById('officer-filter-status').value;
  
  let endpoint = `/api/requests?page=${page}&limit=5`;
  if (search) endpoint += `&search=${encodeURIComponent(search)}`;
  if (status) endpoint += `&status=${status}`;

  try {
    const res = await apiCall(endpoint);
    const tbody = document.getElementById('officer-requests-body');
    tbody.innerHTML = '';

    if (res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No assigned work orders found.</td></tr>`;
      document.getElementById('officer-pagination').innerHTML = '';
      return;
    }

    res.data.forEach(req => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="ID">${req.id}</td>
        <td data-label="Title"><strong>${req.title}</strong></td>
        <td data-label="Description">${req.description}</td>
        <td data-label="Category">${req.category_name}</td>
        <td data-label="Submitted By">${req.submitter_name} (${req.submitter_email})</td>
        <td data-label="Date">${new Date(req.created_at).toLocaleDateString()}</td>
        <td data-label="Status"><span class="status-badge ${getStatusClass(req.status)}">${req.status}</span></td>
        <td data-label="Actions">
          <div style="display:flex; gap:4px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="openDetailModal(${req.id})">History</button>
            <button class="btn btn-primary btn-sm" onclick="openProgressModal(${req.id}, '${req.title}', '${req.status}')" ${req.status === 'Completed' ? 'disabled' : ''}>Update</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination('officer-pagination', res.pagination, 'fetchOfficerRequests');
  } catch (err) {
    console.error(err);
  }
};

window.openProgressModal = function(id, title, status) {
  document.getElementById('progress-request-id').value = id;
  document.getElementById('progress-request-title').textContent = `Order: ${title}`;
  document.getElementById('progress-status-select').value = status === 'Pending' ? 'In Progress' : status;
  document.getElementById('progress-remarks').value = '';
  document.getElementById('progress-modal').style.display = 'flex';
};

window.submitProgressUpdate = async function(e) {
  e.preventDefault();
  const id = document.getElementById('progress-request-id').value;
  const status = document.getElementById('progress-status-select').value;
  const remarks = document.getElementById('progress-remarks').value;

  try {
    await apiCall(`/api/requests/${id}/status`, 'PUT', { status, remarks });
    alert('Work order progress updated successfully!');
    closeModal('progress-modal');
    fetchOfficerRequests();
  } catch (err) {
    alert(`Failed to update progress: ${err.message}`);
  }
};

// ==========================================
// C. Administrator Dashboard Logic
// ==========================================
function loadAdminDashboard() {
  fetchAdminRequests();
  fetchAdminUsers();
  fetchAdminLogs();
  fetchAdminStats();
}

window.fetchAdminRequests = async function(page = 1) {
  const search = document.getElementById('admin-search').value;
  const status = document.getElementById('admin-filter-status').value;
  const category_id = document.getElementById('admin-filter-category').value;
  
  let endpoint = `/api/requests?page=${page}&limit=5`;
  if (search) endpoint += `&search=${encodeURIComponent(search)}`;
  if (status) endpoint += `&status=${status}`;
  if (category_id) endpoint += `&category_id=${category_id}`;

  try {
    const res = await apiCall(endpoint);
    const tbody = document.getElementById('admin-requests-body');
    tbody.innerHTML = '';

    if (res.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No maintenance requests found in system.</td></tr>`;
      document.getElementById('admin-pagination').innerHTML = '';
      return;
    }

    res.data.forEach(req => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="ID">${req.id}</td>
        <td data-label="Title"><strong>${req.title}</strong></td>
        <td data-label="Category">${req.category_name}</td>
        <td data-label="Submitted By">${req.submitter_name}</td>
        <td data-label="Status"><span class="status-badge ${getStatusClass(req.status)}">${req.status}</span></td>
        <td data-label="Assigned Officer">${req.officer_name || '<span class="text-muted">Unassigned</span>'}</td>
        <td data-label="Actions">
          <div style="display:flex; gap:4px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="openDetailModal(${req.id})">History</button>
            <button class="btn btn-primary btn-sm" onclick="openAssignModal(${req.id}, '${req.title}')" ${req.status === 'Completed' ? 'disabled' : ''}>Assign</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderPagination('admin-pagination', res.pagination, 'fetchAdminRequests');
  } catch (err) {
    console.error(err);
  }
};

async function fetchAdminUsers() {
  try {
    const users = await apiCall('/api/users');
    const ul = document.getElementById('admin-users-list');
    ul.innerHTML = '';
    
    users.forEach(u => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <div class="name">${u.name}</div>
          <div class="email">${u.email}</div>
        </div>
        <span class="role">${u.role_name}</span>
      `;
      ul.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function fetchAdminLogs() {
  try {
    const logs = await apiCall('/api/logs');
    const ul = document.getElementById('admin-logs-list');
    ul.innerHTML = '';

    if (logs.length === 0) {
      ul.innerHTML = `<li class="text-center text-muted">No activities logged.</li>`;
      return;
    }
    
    logs.slice(0, 15).forEach(log => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="log-header">
          <span>Request #${log.request_id}</span>
          <span>${new Date(log.created_at).toLocaleTimeString()}</span>
        </div>
        <div class="log-change">
          ${log.updated_by_name} changed state to <span class="status-badge ${getStatusClass(log.new_status)}">${log.new_status}</span>
        </div>
        <div class="log-remarks">"${log.remarks}"</div>
      `;
      ul.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function fetchAdminStats() {
  try {
    const res = await apiCall('/api/requests?limit=1000');
    let pending = 0;
    let progress = 0;
    let completed = 0;

    res.data.forEach(req => {
      if (req.status === 'Pending') pending++;
      else if (req.status === 'In Progress') progress++;
      else if (req.status === 'Completed') completed++;
    });

    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-progress').textContent = progress;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-total').textContent = res.data.length;
  } catch (err) {
    console.error(err);
  }
}

window.openAssignModal = async function(id, title) {
  document.getElementById('assign-request-id').value = id;
  document.getElementById('assign-request-title').textContent = `Assign Order: ${title}`;
  
  try {
    const officers = await apiCall('/api/users/officers');
    const select = document.getElementById('assign-officer-select');
    select.innerHTML = '';
    
    officers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name} (${o.email})`;
      select.appendChild(opt);
    });

    document.getElementById('assign-remarks').value = '';
    document.getElementById('assign-modal').style.display = 'flex';
  } catch (err) {
    alert(`Failed to load officers: ${err.message}`);
  }
};

window.submitAssignment = async function(e) {
  e.preventDefault();
  const id = document.getElementById('assign-request-id').value;
  const officer_id = document.getElementById('assign-officer-select').value;
  const remarks = document.getElementById('assign-remarks').value;

  try {
    await apiCall(`/api/requests/${id}/assign`, 'POST', { officer_id, remarks });
    alert('Task assigned successfully!');
    closeModal('assign-modal');
    loadAdminDashboard();
  } catch (err) {
    alert(`Assignment failed: ${err.message}`);
  }
};

// ==========================================
// Detail & Timeline Modal Logic
// ==========================================
window.openDetailModal = async function(id) {
  try {
    const res = await apiCall(`/api/requests/${id}`);
    const req = res.request;
    
    document.getElementById('modal-request-title').textContent = `Request #${req.id}: ${req.title}`;
    
    const statusBadge = document.getElementById('modal-request-status');
    statusBadge.textContent = req.status;
    statusBadge.className = `status-badge ${getStatusClass(req.status)}`;
    
    document.getElementById('modal-request-category').textContent = req.category_name;
    document.getElementById('modal-request-submitter').textContent = `${req.submitter_name} (${req.submitter_email})`;
    document.getElementById('modal-request-date').textContent = new Date(req.created_at).toLocaleString();
    document.getElementById('modal-request-desc').textContent = req.description;

    const timeline = document.getElementById('modal-request-timeline');
    timeline.innerHTML = '';

    res.logs.forEach(log => {
      const li = document.createElement('li');
      li.className = `timeline-item-log ${log.new_status === 'Completed' ? 'completed' : ''}`;
      li.innerHTML = `
        <div class="timeline-date">${new Date(log.created_at).toLocaleString()}</div>
        <div class="timeline-title">${log.new_status} (by ${log.updated_by_name})</div>
        <div class="timeline-desc">"${log.remarks}"</div>
      `;
      timeline.appendChild(li);
    });

    document.getElementById('detail-modal').style.display = 'flex';
  } catch (err) {
    alert(`Failed to load details: ${err.message}`);
  }
};

window.closeModal = function(id) {
  document.getElementById(id).style.display = 'none';
};

// ==========================================
// Pagination & UI helpers
// ==========================================
function renderPagination(containerId, pagination, fetchMethodName) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (pagination.pages <= 1) return;

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.textContent = '◀';
  prevBtn.disabled = pagination.page === 1;
  prevBtn.onclick = () => window[fetchMethodName](pagination.page - 1);
  container.appendChild(prevBtn);

  // Page Numbers
  for (let i = 1; i <= pagination.pages; i++) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${pagination.page === i ? 'active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => window[fetchMethodName](i);
    container.appendChild(btn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.textContent = '▶';
  nextBtn.disabled = pagination.page === pagination.pages;
  nextBtn.onclick = () => window[fetchMethodName](pagination.page + 1);
  container.appendChild(nextBtn);
}

function getStatusClass(status) {
  if (status === 'Pending') return 'pending';
  if (status === 'In Progress') return 'in-progress';
  if (status === 'Completed') return 'completed';
  return '';
}
