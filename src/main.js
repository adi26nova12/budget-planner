import './style.css';
import './journal.css';
import { HandDrawnPieChart } from './hand-drawn-chart.js';
import { supabase } from './supabase.js';

// Remote logger for developer debugging
function logToBackend(type, data) {
  fetch('http://localhost:8000/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data, timestamp: new Date().toISOString() })
  }).catch(() => {});
}

window.addEventListener('error', (e) => {
  logToBackend('onerror', { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error ? e.error.stack : null });
});
window.addEventListener('unhandledrejection', (e) => {
  logToBackend('unhandledrejection', { reason: e.reason ? (e.reason.message || String(e.reason)) : null, stack: e.reason ? e.reason.stack : null });
});

const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  logToBackend('console_error', { args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)) });
};

// Global state
const initialToday = new Date();
const initialMonthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const initialMonthFallback = localStorage.getItem('last_opened_month') || initialMonthNames[initialToday.getMonth()];
const initialYearFallback = localStorage.getItem('last_opened_year') || initialToday.getFullYear().toString();

let state;
let currentSession = null;
const initialCacheKey = `budget_${initialMonthFallback.toUpperCase()}_${initialYearFallback}`;
const initialCachedData = localStorage.getItem(initialCacheKey);
if (initialCachedData) {
  try {
    const parsed = JSON.parse(initialCachedData);
    if (isValidBudget(parsed)) {
      state = migrateDefaultDates(parsed);
    } else {
      state = getDefaultState(initialMonthFallback, initialYearFallback);
    }
  } catch (e) {
    state = getDefaultState(initialMonthFallback, initialYearFallback);
  }
} else {
  state = getDefaultState(initialMonthFallback, initialYearFallback);
}

// Base API URL
const API_BASE_URL = 'http://localhost:8000';

// Canvas instance
let incomeWheelChart = null;

// Onboarding Modal Helpers
function showOnboardingModal() {
  const onboardingModal = document.getElementById('onboarding-modal');
  if (onboardingModal) {
    onboardingModal.style.display = 'flex';
    // Force reflow
    onboardingModal.offsetHeight;
    onboardingModal.classList.add('show');
  }
}

function closeOnboardingModal() {
  const onboardingModal = document.getElementById('onboarding-modal');
  if (onboardingModal) {
    onboardingModal.classList.remove('show');
    setTimeout(() => {
      if (!onboardingModal.classList.contains('show')) {
        onboardingModal.style.display = 'none';
      }
    }, 250);
  }
}

// Routing rules
const routes = {
  '/login': { viewId: 'auth-view', private: false, tab: 'login' },
  '/register': { viewId: 'auth-view', private: false, tab: 'signup' },
  '/dashboard': { viewId: 'dashboard-view', private: true },
  '/profile': { viewId: 'profile-view', private: true }
};

function navigateTo(path) {
  history.pushState(null, '', path);
  handleRoute();
}

// Helper to append JWT token
async function fetchWithAuth(url, options = {}) {
  const headers = options.headers || {};
  if (currentSession && currentSession.access_token) {
    headers['Authorization'] = `Bearer ${currentSession.access_token}`;
  }
  
  return fetch(url, {
    ...options,
    headers
  });
}

// Update UI elements based on authentication state
function updateNavbar(session) {
  const dashboardLink = document.getElementById('nav-link-dashboard');
  const profileLink = document.getElementById('nav-link-profile');
  const loginBtn = document.getElementById('nav-btn-login');
  const profileDropdown = document.getElementById('nav-profile-dropdown');
  
  if (session) {
    if (dashboardLink) dashboardLink.style.display = 'inline-flex';
    if (profileLink) profileLink.style.display = 'inline-flex';
    if (loginBtn) loginBtn.style.display = 'none';
    if (profileDropdown) profileDropdown.style.display = 'inline-flex';
    
    const user = session.user;
    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || 'User';
    
    // Update navbar dropdown
    document.getElementById('dropdown-user-name').textContent = name;
    document.getElementById('dropdown-user-email').textContent = email;
    
    // Set initials
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U';
    document.getElementById('nav-user-initials').textContent = initials;
    
    const avatarUrl = user.user_metadata?.avatar_url;
    const avatarImgEl = document.getElementById('nav-user-avatar-img');
    const initialsEl = document.getElementById('nav-user-initials');
    if (avatarUrl) {
      avatarImgEl.src = avatarUrl;
      avatarImgEl.style.display = 'block';
      initialsEl.style.display = 'none';
    } else {
      avatarImgEl.style.display = 'none';
      initialsEl.style.display = 'flex';
    }
    
    // Update profile page
    const profileNameInput = document.getElementById('profile-display-name');
    if (profileNameInput) profileNameInput.value = name;
    
    document.getElementById('profile-card-name').textContent = name;
    document.getElementById('profile-card-email').textContent = email;
    
    const largeAvatarImg = document.getElementById('profile-avatar-img');
    const largeAvatarPlaceholder = document.getElementById('profile-avatar-placeholder');
    if (largeAvatarPlaceholder) largeAvatarPlaceholder.textContent = initials;
    if (avatarUrl && largeAvatarImg) {
      largeAvatarImg.src = avatarUrl;
      largeAvatarImg.style.display = 'block';
      largeAvatarPlaceholder.style.display = 'none';
    } else if (largeAvatarPlaceholder) {
      if (largeAvatarImg) largeAvatarImg.style.display = 'none';
      largeAvatarPlaceholder.style.display = 'flex';
    }
  } else {
    if (dashboardLink) dashboardLink.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (profileDropdown) profileDropdown.style.display = 'none';
  }
}

// Router middleware / handler
function handleRoute() {
  const routePath = window.location.pathname || '/';
  console.log('[ROUTER] handleRoute path:', routePath);
  
  if (routePath === '/') {
    console.log('[ROUTER] Redirecting root path to index.html');
    window.location.href = '/';
    return;
  }
  
  let route = routes[routePath];
  if (!route) {
    console.log('[ROUTER] Route details not found direct, checking fallback for:', routePath);
    // Check if path is empty or has active tab fallback
    if (routePath === '/login' || routePath === '/register' || routePath === '/dashboard' || routePath === '/profile') {
      route = routes[routePath];
    } else {
      // Fallback
      console.log('[ROUTER] Unknown path, fallback redirection. Authenticated:', !!currentSession);
      if (currentSession) {
        navigateTo('/dashboard');
      } else {
        navigateTo('/login');
      }
      return;
    }
  }
  
  const isAuthenticated = !!currentSession;
  console.log('[ROUTER] Matched route:', route, 'Authenticated:', isAuthenticated);
  
  // Route guards
  if (route.private && !isAuthenticated) {
    console.log('[ROUTER] Guard: private route and unauthenticated. Redirecting to /login');
    showToast('Please sign in to access your dashboard.', 'error');
    navigateTo('/login');
    return;
  }
  if (!route.private && isAuthenticated && (routePath === '/login' || routePath === '/register')) {
    console.log('[ROUTER] Guard: public auth route but already authenticated. Redirecting to /dashboard');
    navigateTo('/dashboard');
    return;
  }
  
  // Switch view containers
  console.log('[ROUTER] Toggling views. Hiding others, displaying:', route.viewId);
  document.querySelectorAll('.view-container').forEach(view => {
    view.classList.remove('active');
  });
  
  const targetView = document.getElementById(route.viewId);
  if (targetView) {
    targetView.classList.add('active');
    console.log('[ROUTER] Target view activated:', route.viewId, 'display status:', window.getComputedStyle(targetView).display);
  } else {
    console.error('[ROUTER] ERROR: Target view element not found in DOM:', route.viewId);
  }
  
  // Switch nav link active classes
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const activeLink = document.getElementById(`nav-link-${route.viewId.replace('-view', '')}`);
  if (activeLink) {
    activeLink.classList.add('active');
  }
  
  // Tab sync for auth page
  if (route.viewId === 'auth-view') {
    if (route.tab === 'login') {
      showAuthTab('login');
    } else {
      showAuthTab('signup');
    }
  }
  
  // Fetch dashboard data if authenticated and in dashboard view
  if (route.viewId === 'dashboard-view' && isAuthenticated) {
    const cachedMonth = localStorage.getItem('last_opened_month') || initialMonthFallback;
    const cachedYear = localStorage.getItem('last_opened_year') || initialYearFallback;
    loadState(cachedMonth, cachedYear);
  }
}

window.addEventListener('popstate', handleRoute);

// Handle relative link clicks globally for SPA routing
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link) {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/')) {
      if (href === '/') {
        // Allow default behavior (page reload to index.html)
        return;
      }
      e.preventDefault();
      navigateTo(href);
    }
  }
});

// Toggle Login / Signup Tabs
function showAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginTabBtn = document.getElementById('tab-login-btn');
  const signupTabBtn = document.getElementById('tab-signup-btn');
  
  if (tab === 'login') {
    if (loginForm) loginForm.classList.add('active');
    if (signupForm) signupForm.classList.remove('active');
    if (loginTabBtn) loginTabBtn.classList.add('active');
    if (signupTabBtn) signupTabBtn.classList.remove('active');
  } else {
    if (loginForm) loginForm.classList.remove('active');
    if (signupForm) signupForm.classList.add('active');
    if (loginTabBtn) loginTabBtn.classList.remove('active');
    if (signupTabBtn) signupTabBtn.classList.add('active');
  }
}

// Global logout coordinator
async function handleLogout() {
  const confirmLogout = await showConfirmDialog({
    title: 'Sign Out',
    message: 'Are you sure you want to sign out from all sessions on this device?',
    isDestructive: true
  });
  if (confirmLogout) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Signed out successfully.', 'success');
      localStorage.removeItem('last_opened_month');
      localStorage.removeItem('last_opened_year');
      navigateTo('/');
    }
  }
}

// Dark Mode Theme Controllers
function initTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
    toggleThemeIcons('dark');
  } else {
    document.body.classList.remove('dark-mode');
    toggleThemeIcons('light');
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  toggleThemeIcons(isDark ? 'dark' : 'light');
  // Redraw charts since text/grid colors will change
  if (incomeWheelChart) incomeWheelChart.draw();
  drawStandardCharts();
}

function toggleThemeIcons(theme) {
  const moon = document.querySelector('.moon-icon');
  const sun = document.querySelector('.sun-icon');
  if (moon && sun) {
    if (theme === 'dark') {
      moon.style.display = 'none';
      sun.style.display = 'block';
    } else {
      moon.style.display = 'block';
      sun.style.display = 'none';
    }
  }
}

// Sync status indicator helper
function updateSyncStatus(status, message) {
  const badge = document.getElementById('sync-status-badge');
  const txt = document.getElementById('sync-status-text');
  if (!badge || !txt) return;

  // Reset class and set new status
  badge.className = 'sync-badge ' + status;
  txt.textContent = message;
}

// Debounced save state to backend
let saveTimeout = null;

function saveState() {
  updateSyncStatus('saving', 'Saving...');
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    const prefix = currentSession ? `${currentSession.user.id}_` : '';
    // Save to local cache immediately to ensure offline persistence
    const cacheKey = `budget_${prefix}${state.settings.month.toUpperCase()}_${state.settings.year}`;
    localStorage.setItem(cacheKey, JSON.stringify(state));

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/budget`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month: state.settings.month.toUpperCase(),
          year: state.settings.year.toString(),
          data: state
        })
      });
      if (response.ok) {
        const result = await response.json();
        const label = result.storage === 'supabase' ? 'Synced (Cloud)' : 'Synced (Local)';
        updateSyncStatus('synced', label);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      console.error('Error saving state:', e);
      updateSyncStatus('error', 'Sync Error');
    }
  }, 800);
}

// Load state from backend API
async function loadState(month, year) {
  updateSyncStatus('connecting', 'Connecting...');
  const monthUpper = month.toUpperCase();
  
  // Set UI inputs immediately to prevent defaults flickering
  document.getElementById('month-select-input').value = monthUpper;
  document.getElementById('year-input-field').value = year;

  // Show skeleton loading card and hide main layout
  const skeleton = document.getElementById('dashboard-skeleton');
  const appContainer = document.getElementById('dashboard-app-container');
  if (skeleton) skeleton.style.display = 'block';
  if (appContainer) appContainer.style.display = 'none';

  // Try loading from local storage cache first for instant load and offline capability
  const prefix = currentSession ? `${currentSession.user.id}_` : '';
  const cacheKey = `budget_${prefix}${monthUpper}_${year}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      if (isValidBudget(parsed)) {
        state = migrateDefaultDates(parsed);
        document.getElementById('setting-currency').value = state.settings.currency || '₹';
        document.getElementById('setting-start-date').value = state.settings.startDate;
        document.getElementById('setting-end-date').value = state.settings.endDate;
        document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
        recalculateAll();
      } else {
        state = getDefaultState(monthUpper, year);
        document.getElementById('setting-currency').value = state.settings.currency || '₹';
        document.getElementById('setting-start-date').value = state.settings.startDate;
        document.getElementById('setting-end-date').value = state.settings.endDate;
        document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
        recalculateAll();
      }
    } catch (err) {
      console.error('Error parsing cached budget:', err);
      state = getDefaultState(monthUpper, year);
      recalculateAll();
    }
  } else {
    // If no cache exists, initialize screen with clean defaults immediately
    state = getDefaultState(monthUpper, year);
    document.getElementById('setting-currency').value = state.settings.currency || '₹';
    document.getElementById('setting-start-date').value = state.settings.startDate;
    document.getElementById('setting-end-date').value = state.settings.endDate;
    document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
    recalculateAll();
  }

  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/budget?month=${monthUpper}&year=${year}`);
    if (response.ok) {
      const data = await response.json();
      if (isValidBudget(data)) {
        state = migrateDefaultDates(data);
        
        // Update local storage cache
        localStorage.setItem(cacheKey, JSON.stringify(state));
        
        // Sync UI elements
        document.getElementById('month-select-input').value = state.settings.month;
        document.getElementById('year-input-field').value = state.settings.year || '2026';
        document.getElementById('setting-currency').value = state.settings.currency || '₹';
        document.getElementById('setting-start-date').value = state.settings.startDate;
        document.getElementById('setting-end-date').value = state.settings.endDate;
        document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
        
        updateSyncStatus('synced', 'Synced');
        recalculateAll();
      } else {
        console.warn('API budget data structure is invalid. Falling back to cached state.');
      }
    } else {
      throw new Error('Load failed');
    }
  } catch (e) {
    console.error('Error loading state:', e);
    updateSyncStatus('error', 'Offline');
    // We already loaded the cached state (or defaults) above, so recalculate to hide skeleton.
    recalculateAll();
  }

  // Save selected month and year to localStorage for persistence across reloads
  localStorage.setItem('last_opened_month', monthUpper);
  localStorage.setItem('last_opened_year', year.toString());

  // Trigger onboarding check for first-time user
  if (currentSession && currentSession.user) {
    const onboardingSeen = localStorage.getItem(`onboarding_seen_${currentSession.user.id}`);
    if (!onboardingSeen) {
      showOnboardingModal();
    }
  }
}


// Default state helper
function getDefaultState(month, year) {
  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const monthUpper = month.toUpperCase();
  let monthIdx = monthNames.indexOf(monthUpper);
  if (monthIdx === -1) monthIdx = 0; // fallback to Jan
  
  const yearInt = parseInt(year) || 2026;
  const numDays = new Date(yearInt, monthIdx + 1, 0).getDate();
  const pad = (n) => n.toString().padStart(2, '0');
  
  const startDateStr = `${yearInt}-${pad(monthIdx + 1)}-01`;
  const endDateStr = `${yearInt}-${pad(monthIdx + 1)}-${pad(numDays)}`;
  
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthNameShort = monthNamesShort[monthIdx];
  
  const getDueDateStr = (dayNum) => {
    try {
      const d = new Date(yearInt, monthIdx, dayNum);
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const wkday = weekdays[d.getDay()];
      return `${wkday}, ${monthNameShort} ${dayNum}`;
    } catch (e) {
      return "";
    }
  };

  return {
    settings: {
      month: monthUpper,
      year: year,
      currency: '₹',
      startDate: startDateStr,
      endDate: endDateStr,
      startBalance: 0.00,
      importedFileName: null,
      preImportState: null,
      importedStatements: []
    },
    cashFlowSummary: {
      savingsBudget: 0.00,
      savingsActual: 0.00
    },
    income: [
      { id: 1, description: 'Paycheck', expected: 0.00, actual: 0.00, cashback: 0.00 },
      { id: 2, description: 'Side Hustle', expected: 0.00, actual: 0.00, cashback: 0.00 },
      { id: 3, description: '', expected: 0.00, actual: 0.00, cashback: 0.00 },
      { id: 4, description: '', expected: 0.00, actual: 0.00, cashback: 0.00 }
    ],
    bills: [
      { id: 1, checked: false, description: 'Cable & Internet', dueDate: getDueDateStr(1), budget: 0.00, actual: 0.00 },
      { id: 2, checked: false, description: 'Car insurance', dueDate: getDueDateStr(2), budget: 0.00, actual: 0.00 },
      { id: 3, checked: false, description: 'Gym membership', dueDate: getDueDateStr(10), budget: 0.00, actual: 0.00 },
      { id: 4, checked: false, description: 'Phone Bill', dueDate: getDueDateStr(12), budget: 0.00, actual: 0.00 },
      { id: 5, checked: false, description: 'Rent', dueDate: getDueDateStr(numDays), budget: 0.00, actual: 0.00 },
      { id: 6, checked: false, description: '', dueDate: '', budget: 0.00, actual: 0.00 },
      { id: 7, checked: false, description: '', dueDate: '', budget: 0.00, actual: 0.00 }
    ],
    expenses: [
      { id: 1, category: 'Personal Care', budget: 0.00, actual: 0.00 },
      { id: 2, category: 'Travel', budget: 0.00, actual: 0.00 },
      { id: 3, category: 'Home', budget: 0.00, actual: 0.00 },
      { id: 4, category: 'Groceries', budget: 0.00, actual: 0.00 },
      { id: 5, category: 'Pets', budget: 0.00, actual: 0.00 },
      { id: 6, category: 'Education', budget: 0.00, actual: 0.00 },
      { id: 7, category: 'Food', budget: 0.00, actual: 0.00 },
      { id: 8, category: 'Entertainment', budget: 0.00, actual: 0.00 },
      { id: 9, category: 'Fuel', budget: 0.00, actual: 0.00 },
      { id: 10, category: '', budget: 0.00, actual: 0.00 },
      { id: 11, category: '', budget: 0.00, actual: 0.00 }
    ],
    debt: [
      { id: 1, description: 'Credit Card 1', dueDate: getDueDateStr(1), budget: 0.00, actual: 0.00 },
      { id: 2, description: 'Credit Card 2', dueDate: getDueDateStr(2), budget: 0.00, actual: 0.00 },
      { id: 3, description: 'Student Loan', dueDate: getDueDateStr(3), budget: 0.00, actual: 0.00 },
      { id: 4, description: 'Personal Loan', dueDate: getDueDateStr(4), budget: 0.00, actual: 0.00 },
      { id: 5, description: '', dueDate: '', budget: 0.00, actual: 0.00 },
      { id: 6, description: '', dueDate: '', budget: 0.00, actual: 0.00 }
    ],
    allocation: [
      { id: 1, asset: 'Cash Reserve', share: 0, color: '#f7d1cd', pattern: 'cash' },
      { id: 2, asset: 'RKT', share: 0, color: '#9ad1d4', pattern: 'dots' },
      { id: 3, asset: 'INTC', share: 0, color: '#a3b18a', pattern: 'hatch-diagonal' },
      { id: 4, asset: 'DKNG', share: 0, color: '#588157', pattern: 'hatch-cross' },
      { id: 5, asset: 'IONQ', share: 0, color: '#b5c99a', pattern: 'hatch-vertical' },
      { id: 6, asset: 'RKT', share: 0, color: '#a9def9', pattern: 'hatch-diagonal' },
      { id: 7, asset: 'RIVN', share: 0, color: '#d0f4de', pattern: 'swirls' }
    ]
  };
}

// Initialize App
async function initApp() {
  // Bind Settings & Theme System
  initTheme();
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Bind Navbar Dropdown Actions
  const avatarBtn = document.getElementById('nav-avatar-btn');
  const avatarDropdown = document.getElementById('avatar-dropdown-menu');
  if (avatarBtn && avatarDropdown) {
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      avatarDropdown.classList.toggle('show');
    });
    window.addEventListener('click', () => {
      avatarDropdown.classList.remove('show');
    });
  }

  // Bind Auth Switch Links & Tabs
  const loginTabBtn = document.getElementById('tab-login-btn');
  const signupTabBtn = document.getElementById('tab-signup-btn');
  const switchToSignup = document.getElementById('switch-to-signup');
  const switchToLogin = document.getElementById('switch-to-login');
  
  if (loginTabBtn) loginTabBtn.addEventListener('click', () => navigateTo('/login'));
  if (signupTabBtn) signupTabBtn.addEventListener('click', () => navigateTo('/register'));
  if (switchToSignup) switchToSignup.addEventListener('click', () => navigateTo('/register'));
  if (switchToLogin) switchToLogin.addEventListener('click', () => navigateTo('/login'));

  // Auth Submit Handlers
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const spinner = loginForm.querySelector('.spinner');
      const submitBtn = loginForm.querySelector('.auth-submit-btn');
      
      if (spinner) spinner.style.display = 'inline-block';
      if (submitBtn) submitBtn.disabled = true;
      
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (spinner) spinner.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
      
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Login successful!', 'success');
        navigateTo('/dashboard');
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const spinner = signupForm.querySelector('.spinner');
      const submitBtn = signupForm.querySelector('.auth-submit-btn');
      
      if (spinner) spinner.style.display = 'inline-block';
      if (submitBtn) submitBtn.disabled = true;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });
      
      if (spinner) spinner.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
      
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Sign up successful! Please check your verification email if required.', 'success');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigateTo('/dashboard');
        } else {
          navigateTo('/login');
        }
      }
    });
  }

  // Profile Event Handlers
  const profileInfoForm = document.getElementById('profile-info-form');
  if (profileInfoForm) {
    profileInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = document.getElementById('profile-display-name').value;
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName }
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Profile updated successfully!', 'success');
        const { data: { session } } = await supabase.auth.getSession();
        updateNavbar(session);
      }
    });
  }

  const profilePasswordForm = document.getElementById('profile-password-form');
  if (profilePasswordForm) {
    profilePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('profile-new-password').value;
      const confirmPassword = document.getElementById('profile-confirm-password').value;
      if (newPassword !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('Password updated successfully!', 'success');
        profilePasswordForm.reset();
      }
    });
  }

  const avatarInput = document.getElementById('avatar-file-input');
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image size exceeds 2MB limit.', 'error');
        return;
      }
      
      showToast('Uploading avatar...', 'info');
      
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Url = reader.result;
        const { error } = await supabase.auth.updateUser({
          data: { avatar_url: base64Url }
        });
        if (error) {
          showToast(error.message, 'error');
        } else {
          showToast('Avatar updated successfully!', 'success');
          const { data: { session } } = await supabase.auth.getSession();
          updateNavbar(session);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Logout Buttons Handlers
  const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');
  const profileLogoutBtn = document.getElementById('profile-logout-btn');
  if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener('click', handleLogout);
  if (profileLogoutBtn) profileLogoutBtn.addEventListener('click', handleLogout);

  // Bind settings listeners
  document.getElementById('month-select-input').addEventListener('change', (e) => {
    loadState(e.target.value, state.settings.year);
  });

  document.getElementById('year-input-field').addEventListener('input', (e) => {
    const newYear = e.target.value || '2026';
    loadState(state.settings.month, newYear);
  });

  document.getElementById('setting-currency').addEventListener('change', (e) => {
    state.settings.currency = e.target.value;
    recalculateAll();
  });

  document.getElementById('setting-start-date').addEventListener('change', (e) => {
    state.settings.startDate = e.target.value;
    saveState();
  });

  document.getElementById('setting-end-date').addEventListener('change', (e) => {
    state.settings.endDate = e.target.value;
    saveState();
  });

  document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
  setupOverviewListeners();
  setupChartHover();

  // Setup table add/delete button listeners
  setupTableActionListeners();

  // Initialize hand-drawn chart
  const canvas = document.getElementById('income-wheel-canvas');
  incomeWheelChart = new HandDrawnPieChart(canvas);
  
  // Set up resize handler for canvases
  window.addEventListener('resize', () => {
    if (incomeWheelChart) incomeWheelChart.draw();
    drawStandardCharts();
  });

  // Redraw when fonts load to ensure custom font is rendered
  document.fonts.ready.then(() => {
    if (incomeWheelChart) incomeWheelChart.draw();
  });

  function showPasswordPromptModal(errorMessage = '') {
    return new Promise((resolve) => {
      let modal = document.getElementById('password-prompt-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'password-prompt-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-content confirm-modal-content">
            <div class="modal-header confirm-modal-header">
              <h3 id="pwd-prompt-title">Protected Statement</h3>
              <button class="modal-close-btn" id="pwd-prompt-close-btn">&times;</button>
            </div>
            <div class="modal-body confirm-modal-body" style="text-align: left;">
              <p style="margin-bottom: 12px; color: #4D3E33; font-weight: 500; font-family: 'Patrick Hand', cursive; font-size: 16px;">This PDF is password-protected. Please enter the decryption password:</p>
              <div id="pwd-prompt-error" style="color: #ef4444; font-size: 14px; font-family: 'Patrick Hand', cursive; font-weight: bold; margin-bottom: 12px; display: none;"></div>
              <input type="password" id="pwd-prompt-input" class="sketch-input" style="width: 100%; box-sizing: border-box; padding: 8px 12px; border: 2.5px solid #2B2118; border-radius: 4px; font-family: 'Patrick Hand', cursive; font-size: 16px; margin-bottom: 4px; background: transparent; color: #2B2118;" placeholder="Enter PDF password..." autocomplete="new-password">
            </div>
            <div class="modal-footer confirm-modal-footer">
              <button class="modal-btn confirm-modal-btn-cancel" id="pwd-prompt-cancel-btn">Cancel</button>
              <button class="modal-btn confirm-modal-btn-confirm" id="pwd-prompt-submit-btn">Unlock</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const input = document.getElementById('pwd-prompt-input');
      const errorDiv = document.getElementById('pwd-prompt-error');
      const submitBtn = document.getElementById('pwd-prompt-submit-btn');
      const cancelBtn = document.getElementById('pwd-prompt-cancel-btn');
      const closeBtn = document.getElementById('pwd-prompt-close-btn');

      input.value = '';
      if (errorMessage) {
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
      } else {
        errorDiv.style.display = 'none';
      }

      const cleanupAndClose = (passwordVal) => {
        modal.classList.remove('show');
        setTimeout(() => {
          if (!modal.classList.contains('show')) {
            modal.style.display = 'none';
          }
        }, 250);
        submitBtn.removeEventListener('click', handleSubmit);
        cancelBtn.removeEventListener('click', handleCancel);
        closeBtn.removeEventListener('click', handleCancel);
        document.removeEventListener('keydown', handleKeydown);
        resolve(passwordVal);
      };

      const handleSubmit = () => {
        const val = input.value.trim();
        if (val) {
          cleanupAndClose(val);
        } else {
          errorDiv.textContent = 'Password cannot be empty.';
          errorDiv.style.display = 'block';
        }
      };

      const handleCancel = () => cleanupAndClose(null);
      const handleKeydown = (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        } else if (e.key === 'Escape') {
          handleCancel();
        }
      };

      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
      document.addEventListener('keydown', handleKeydown);

      modal.style.display = 'flex';
      modal.offsetHeight; // force reflow
      modal.classList.add('show');
      input.focus();
    });
  }

  // Wire up PDF Import elements
  const importBtn = document.getElementById('import-statement-btn');
  const fileInput = document.getElementById('import-statement-file-input');

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast('Importing statement...', 'info');

      const uploadWithPassword = async (password = null) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('month', state.settings.month);
        formData.append('year', state.settings.year);
        formData.append('current_data', JSON.stringify(state));
        if (password) {
          formData.append('password', password);
        }

        try {
          const response = await fetchWithAuth(`${API_BASE_URL}/api/import-statement`, {
            method: 'POST',
            body: formData
          });

          if (response.ok) {
            const result = await response.json();
            state = result.data;

            // Sync UI elements to new state
            document.getElementById('month-select-input').value = state.settings.month;
            document.getElementById('year-input-field').value = state.settings.year || '2026';
            document.getElementById('setting-currency').value = state.settings.currency || '₹';
            document.getElementById('setting-start-date').value = state.settings.startDate;
            document.getElementById('setting-end-date').value = state.settings.endDate;
            document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);

            recalculateAll();
            showToast(`Successfully imported ${result.imported_count} transactions!`, 'success');
            fileInput.value = '';
          } else if (response.status === 401) {
            const errResult = await response.json();
            const detail = errResult.detail || 'Password incorrect or required.';
            const newPassword = await showPasswordPromptModal(detail);
            if (newPassword) {
              showToast('Retrying import with password...', 'info');
              await uploadWithPassword(newPassword);
            } else {
              showToast('Import cancelled: statement is password protected.', 'warning');
              fileInput.value = '';
            }
          } else {
            const errorData = await response.json();
            showToast(errorData.detail || 'Failed to import transaction statement.', 'error');
            fileInput.value = '';
          }
        } catch (error) {
          console.error('Error importing statement:', error);
          showToast('Error connecting to backend server.', 'error');
          fileInput.value = '';
        }
      };

      await uploadWithPassword();
    });
  }

  // Wire up Reset Month elements
  const resetBtn = document.getElementById('reset-month-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const month = state.settings.month;
      const year = state.settings.year;
      const confirmReset = await showConfirmDialog({
        title: 'Reset Month',
        message: `Are you sure you want to reset the finances for <strong>${month} ${year}</strong> to default? This will clear all entered amounts.`,
        isDestructive: true
      });
      if (confirmReset) {
        state = getDefaultState(month, year);
        
        // Sync UI elements to new reset state
        document.getElementById('month-select-input').value = state.settings.month;
        document.getElementById('year-input-field').value = state.settings.year || '2026';
        document.getElementById('setting-currency').value = state.settings.currency || '₹';
        document.getElementById('setting-start-date').value = state.settings.startDate;
        document.getElementById('setting-end-date').value = state.settings.endDate;
        document.getElementById('setting-start-balance').textContent = formatNumber(state.settings.startBalance);
        
        recalculateAll();
        showToast(`Finances for ${month} ${year} have been reset.`, 'success');
      }
    });
  }

  // Wire up Modal elements
  const modal = document.getElementById('statement-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCloseFooterBtn = document.getElementById('modal-close-footer-btn');
  
  const closeModal = () => {
    if (modal) modal.classList.remove('show');
  };
  
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Wire up Onboarding Modal elements
  const onboardingCloseBtn = document.getElementById('onboarding-close-btn');
  const onboardingHelpBtn = document.getElementById('onboarding-help-btn');
  const onboardingModal = document.getElementById('onboarding-modal');

  if (onboardingCloseBtn) {
    onboardingCloseBtn.addEventListener('click', () => {
      closeOnboardingModal();
      if (currentSession && currentSession.user) {
        localStorage.setItem(`onboarding_seen_${currentSession.user.id}`, 'true');
      }
    });
  }

  if (onboardingHelpBtn) {
    onboardingHelpBtn.addEventListener('click', () => {
      showOnboardingModal();
    });
  }

  if (onboardingModal) {
    onboardingModal.addEventListener('click', (e) => {
      if (e.target === onboardingModal) {
        closeOnboardingModal();
      }
    });
  }

  // Supabase Auth State Listener
  supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    updateNavbar(session);
    handleRoute();
  });

  // Initial Route Check & Init Navbar state in background (non-blocking)
  supabase.auth.getSession().then(({ data: { session } }) => {
    currentSession = session;
    updateNavbar(session);
    handleRoute();
  }).catch(err => {
    console.warn('[AUTH] Failed to fetch initial session on load:', err);
    updateNavbar(null);
    handleRoute();
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Setup click-to-edit for Overview start balance
function setupOverviewListeners() {
  const cell = document.getElementById('setting-start-balance');
  cell.addEventListener('click', () => {
    makeCellEditable(cell, (newVal) => {
      state.settings.startBalance = parseFloat(newVal) || 0;
      recalculateAll();
    }, 'number', state.settings.startBalance);
  });
}

// Auto-update start and end dates based on selected month and year
function updateDatesFromMonthYear() {
  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const monthIdx = monthNames.indexOf(state.settings.month);
  if (monthIdx === -1) return;
  const year = parseInt(state.settings.year) || 2026;
  
  const pad = (n) => n.toString().padStart(2, '0');
  const startDateStr = `${year}-${pad(monthIdx + 1)}-01`;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const endDateStr = `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`;
  
  state.settings.startDate = startDateStr;
  state.settings.endDate = endDateStr;
  
  document.getElementById('setting-start-date').value = startDateStr;
  document.getElementById('setting-end-date').value = endDateStr;
}

// Format utility helper
function formatCurrency(val) {
  const sym = state.settings.currency;
  if (val < 0) {
    return `-${sym} ${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${sym} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val) {
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Convert cell contents into editable fields
function makeCellEditable(cell, onSave, type = 'text', rawValue = null) {
  if (cell.querySelector('input')) return; // Already editing
  
  const currentText = rawValue !== null ? rawValue.toString() : cell.textContent.trim().replace(/[^\d.-]/g, '');
  const input = document.createElement('input');
  input.type = type === 'number' ? 'text' : 'text'; // use text to allow decimals easily
  input.value = currentText;
  input.className = 'cell-input';
  
  cell.appendChild(input);
  input.focus();
  input.select();
  
  const finishEdit = () => {
    const newVal = input.value.trim();
    cell.removeChild(input);
    onSave(newVal);
  };
  
  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      finishEdit();
    } else if (e.key === 'Escape') {
      cell.removeChild(input);
    }
  });
}

// Core calculation engine
function recalculateAll() {
  // 1. Calculate Income Totals
  let totalIncomeExpected = 0;
  let totalIncomeActual = 0;
  state.income.forEach(item => {
    totalIncomeExpected += item.expected || 0;
    totalIncomeActual += item.actual || 0;
  });

  // 2. Calculate Bills Totals
  let totalBillsBudget = 0;
  let totalBillsActual = 0;
  state.bills.forEach(item => {
    totalBillsBudget += item.budget;
    totalBillsActual += item.actual;
  });

  // 3. Calculate Expenses Totals
  let totalExpensesBudget = 0;
  let totalExpensesActual = 0;
  state.expenses.forEach(item => {
    totalExpensesBudget += item.budget;
    totalExpensesActual += item.actual;
  });

  // 4. Calculate Debt Totals
  let totalDebtBudget = 0;
  let totalDebtActual = 0;
  state.debt.forEach(item => {
    totalDebtBudget += item.budget;
    totalDebtActual += item.actual;
  });

  // 5. Update Cash Flow Summary
  // Bills, Expenses and Debts are aggregates from tables. Savings is custom editable in Summary
  const summary = {
    debtsBudget: totalDebtBudget,
    debtsActual: totalDebtActual,
    savingsBudget: state.cashFlowSummary.savingsBudget,
    savingsActual: state.cashFlowSummary.savingsActual,
    billsBudget: totalBillsBudget,
    billsActual: totalBillsActual,
    expensesBudget: totalExpensesBudget,
    expensesActual: totalExpensesActual
  };

  const totalSummaryBudget = summary.debtsBudget + summary.savingsBudget + summary.billsBudget + summary.expensesBudget;
  const totalSummaryActual = summary.debtsActual + summary.savingsActual + summary.billsActual + summary.expensesActual;

  // 6. Update Top Header Banner Metric Cards
  const budgeted = totalSummaryBudget;
  const leftToBudget = Math.max(0, totalIncomeExpected - budgeted);
  const income = totalIncomeActual;
  const totalSpent = totalSummaryActual;
  
  // Progress ratio: total outflow / actual income
  const progressPercent = income > 0 ? Math.round((totalSpent / income) * 100) : 0;
  
  const savings = summary.savingsActual;
  const leftOver = income - totalSpent;

  // Render header
  document.getElementById('header-budgeted').textContent = formatCurrency(budgeted);
  document.getElementById('header-left-to-budget').textContent = formatCurrency(leftToBudget);
  document.getElementById('header-income').textContent = formatCurrency(income);
  document.getElementById('header-total-spent').textContent = formatCurrency(totalSpent);
  
  document.getElementById('header-progress-text').textContent = `${progressPercent}%`;
  document.getElementById('header-progress-bar').style.width = `${Math.min(100, progressPercent)}%`;
  
  document.getElementById('header-savings').textContent = formatCurrency(savings);
  
  const leftOverEl = document.getElementById('header-left-over');
  leftOverEl.textContent = formatCurrency(leftOver);
  if (leftOver < 0) {
    leftOverEl.className = 'metric-value highlight-pink';
  } else {
    leftOverEl.className = 'metric-value highlight-green';
  }

  // 7. Render Cash Flow Summary Table
  document.getElementById('summary-debts-budget').textContent = formatCurrency(summary.debtsBudget);
  document.getElementById('summary-debts-actual').textContent = formatCurrency(summary.debtsActual);
  
  const savBudEl = document.getElementById('summary-savings-budget');
  savBudEl.textContent = formatCurrency(summary.savingsBudget);
  setupCellClick(savBudEl, 'number', (val) => {
    state.cashFlowSummary.savingsBudget = parseFloat(val) || 0;
    recalculateAll();
  }, state.cashFlowSummary.savingsBudget);

  const savActEl = document.getElementById('summary-savings-actual');
  savActEl.textContent = formatCurrency(summary.savingsActual);
  setupCellClick(savActEl, 'number', (val) => {
    state.cashFlowSummary.savingsActual = parseFloat(val) || 0;
    recalculateAll();
  }, state.cashFlowSummary.savingsActual);

  document.getElementById('summary-bills-budget').textContent = formatCurrency(summary.billsBudget);
  document.getElementById('summary-bills-actual').textContent = formatCurrency(summary.billsActual);

  document.getElementById('summary-expenses-budget').textContent = formatCurrency(summary.expensesBudget);
  document.getElementById('summary-expenses-actual').textContent = formatCurrency(summary.expensesActual);

  document.getElementById('summary-total-budget').textContent = formatCurrency(totalSummaryBudget);
  document.getElementById('summary-total-actual').textContent = formatCurrency(totalSummaryActual);

  // 8. Render Dynamic Tables
  renderIncomeTable(totalIncomeExpected, totalIncomeActual);
  renderBillsTable(totalBillsBudget, totalBillsActual);
  renderExpensesTable(totalExpensesBudget, totalExpensesActual);
  renderDebtTable(totalDebtBudget, totalDebtActual);
  renderAllocationTable();

  // 9. Redraw Visual Charts
  drawStandardCharts();
  
  // Redraw hand-drawn pie chart (Expense Chart)
  if (incomeWheelChart) {
    const expenseColors = [
      '#ffccd5', '#ffe5ec', '#fceade', '#e8dbfc', '#d0f4de',
      '#a9def9', '#b5c99a', '#f7d1cd', '#e2eafc', '#f3c6f1'
    ];
    // Removed 'swirls' (circle designs) to improve legibility and clean up layouts
    const expensePatterns = ['none', 'dots', 'hatch-diagonal', 'hatch-cross', 'hatch-vertical', 'cash'];

    const chartData = state.expenses
      .filter(item => item.category && (item.actual > 0 || item.budget > 0))
      .map((item, index) => {
        const isOther = item.category.toLowerCase().includes('other');
        return {
          label: item.category,
          value: item.actual > 0 ? item.actual : item.budget,
          color: expenseColors[index % expenseColors.length],
          pattern: isOther ? 'none' : expensePatterns[index % expensePatterns.length]
        };
      });
    incomeWheelChart.setData(chartData);
  }

  // Update PDF import UI state
  renderImportedStatementsList();

  // Save changes
  saveState();

  // Hide skeleton loading
  const skeleton = document.getElementById('dashboard-skeleton');
  const appContainer = document.getElementById('dashboard-app-container');
  if (skeleton) skeleton.style.display = 'none';
  if (appContainer) appContainer.style.display = 'block';
}

// saveState is now defined as an async API call at the top of the file

// Table Rendering Functions with cell edit binding

function renderIncomeTable(totalExp, totalAct) {
  const tbody = document.querySelector('#income-table .table-body');
  tbody.innerHTML = '';
  
  state.income.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    // Description cell
    const tdDesc = document.createElement('td');
    tdDesc.className = 'editable-cell';
    tdDesc.textContent = item.description;
    tdDesc.addEventListener('click', () => {
      makeCellEditable(tdDesc, (val) => {
        state.income[index].description = val;
        recalculateAll();
      }, 'text', item.description);
    });
    tr.appendChild(tdDesc);

    // Expected cell
    const tdExpected = document.createElement('td');
    tdExpected.className = 'editable-cell align-right';
    tdExpected.textContent = formatCurrency(item.expected || 0);
    tdExpected.addEventListener('click', () => {
      makeCellEditable(tdExpected, (val) => {
        state.income[index].expected = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.expected || 0);
    });
    tr.appendChild(tdExpected);

    // Amount cell
    const tdActual = document.createElement('td');
    tdActual.className = 'editable-cell align-right';
    tdActual.textContent = formatCurrency(item.actual || 0);
    tdActual.addEventListener('click', () => {
      makeCellEditable(tdActual, (val) => {
        state.income[index].actual = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.actual || 0);
    });
    tr.appendChild(tdActual);

    tbody.appendChild(tr);
  });

  document.getElementById('income-total-expected').textContent = formatCurrency(totalExp);
  document.getElementById('income-total-actual').textContent = formatCurrency(totalAct);
}

function renderBillsTable(totalBgt, totalAct) {
  const tbody = document.querySelector('#bills-table .table-body');
  tbody.innerHTML = '';

  state.bills.forEach((item, index) => {
    const tr = document.createElement('tr');

    // Checkbox cell (cleared / paid status)
    const tdCheck = document.createElement('td');
    tdCheck.className = 'checkbox-cell align-center';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'custom-checkbox';
    checkbox.checked = item.checked;
    checkbox.addEventListener('change', (e) => {
      state.bills[index].checked = e.target.checked;
      // When checked off, copy Budget value to Actual as paid, else clear actual to 0
      if (e.target.checked && item.actual === 0) {
        state.bills[index].actual = item.budget;
      } else if (!e.target.checked) {
        state.bills[index].actual = 0;
      }
      recalculateAll();
    });
    
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // Description cell
    const tdDesc = document.createElement('td');
    tdDesc.className = 'editable-cell';
    tdDesc.textContent = item.description;
    tdDesc.addEventListener('click', () => {
      makeCellEditable(tdDesc, (val) => {
        state.bills[index].description = val;
        recalculateAll();
      }, 'text', item.description);
    });
    tr.appendChild(tdDesc);

    // Due Date cell
    const tdDue = document.createElement('td');
    tdDue.className = 'editable-cell';
    tdDue.textContent = item.dueDate;
    tdDue.addEventListener('click', () => {
      makeCellEditable(tdDue, (val) => {
        state.bills[index].dueDate = val;
        recalculateAll();
      }, 'text', item.dueDate);
    });
    tr.appendChild(tdDue);

    // Budget cell
    const tdBudget = document.createElement('td');
    tdBudget.className = 'editable-cell align-right';
    tdBudget.textContent = formatCurrency(item.budget);
    tdBudget.addEventListener('click', () => {
      makeCellEditable(tdBudget, (val) => {
        const num = parseFloat(val) || 0;
        state.bills[index].budget = num;
        // Keep actual in sync if paid is checked
        if (state.bills[index].checked) {
          state.bills[index].actual = num;
        }
        recalculateAll();
      }, 'number', item.budget);
    });
    tr.appendChild(tdBudget);

    // Actual cell
    const tdActual = document.createElement('td');
    tdActual.className = 'editable-cell align-right';
    tdActual.textContent = formatCurrency(item.actual);
    tdActual.addEventListener('click', () => {
      makeCellEditable(tdActual, (val) => {
        state.bills[index].actual = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.actual);
    });
    tr.appendChild(tdActual);

    tbody.appendChild(tr);
  });

  document.getElementById('bills-total-budget').textContent = formatCurrency(totalBgt);
  document.getElementById('bills-total-actual').textContent = formatCurrency(totalAct);
}

function renderExpensesTable(totalBgt, totalAct) {
  const tbody = document.querySelector('#expenses-table .table-body');
  tbody.innerHTML = '';

  state.expenses.forEach((item, index) => {
    const tr = document.createElement('tr');

    // Category cell
    const tdCat = document.createElement('td');
    tdCat.className = 'editable-cell';
    tdCat.textContent = item.category;
    tdCat.addEventListener('click', () => {
      makeCellEditable(tdCat, (val) => {
        state.expenses[index].category = val;
        recalculateAll();
      }, 'text', item.category);
    });
    tr.appendChild(tdCat);

    // Budget cell
    const tdBudget = document.createElement('td');
    tdBudget.className = 'editable-cell align-right';
    tdBudget.textContent = formatCurrency(item.budget);
    tdBudget.addEventListener('click', () => {
      makeCellEditable(tdBudget, (val) => {
        state.expenses[index].budget = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.budget);
    });
    tr.appendChild(tdBudget);

    // Actual cell
    const tdActual = document.createElement('td');
    tdActual.className = 'editable-cell align-right';
    tdActual.textContent = formatCurrency(item.actual);
    tdActual.addEventListener('click', () => {
      makeCellEditable(tdActual, (val) => {
        state.expenses[index].actual = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.actual);
    });
    tr.appendChild(tdActual);

    // Remaining cell (Budget - Actual)
    const remaining = item.budget - item.actual;
    const tdRemaining = document.createElement('td');
    tdRemaining.className = 'align-right';
    tdRemaining.textContent = formatCurrency(remaining);
    if (remaining < 0) {
      tdRemaining.className = 'align-right negative-val';
    } else if (remaining > 0) {
      tdRemaining.className = 'align-right positive-val';
    }
    tr.appendChild(tdRemaining);

    tbody.appendChild(tr);
  });

  document.getElementById('expenses-total-budget').textContent = formatCurrency(totalBgt);
  document.getElementById('expenses-total-actual').textContent = formatCurrency(totalAct);
  
  const totalRem = totalBgt - totalAct;
  const totalRemEl = document.getElementById('expenses-total-remaining');
  totalRemEl.textContent = formatCurrency(totalRem);
  if (totalRem < 0) {
    totalRemEl.className = 'align-right negative-val';
  } else if (totalRem > 0) {
    totalRemEl.className = 'align-right positive-val';
  } else {
    totalRemEl.className = 'align-right';
  }
}

function renderDebtTable(totalBgt, totalAct) {
  const tbody = document.querySelector('#debt-table .table-body');
  tbody.innerHTML = '';

  state.debt.forEach((item, index) => {
    const tr = document.createElement('tr');

    // Description cell
    const tdDesc = document.createElement('td');
    tdDesc.className = 'editable-cell';
    tdDesc.textContent = item.description;
    tdDesc.addEventListener('click', () => {
      makeCellEditable(tdDesc, (val) => {
        state.debt[index].description = val;
        recalculateAll();
      }, 'text', item.description);
    });
    tr.appendChild(tdDesc);

    // Due Date cell
    const tdDue = document.createElement('td');
    tdDue.className = 'editable-cell';
    tdDue.textContent = item.dueDate;
    tdDue.addEventListener('click', () => {
      makeCellEditable(tdDue, (val) => {
        state.debt[index].dueDate = val;
        recalculateAll();
      }, 'text', item.dueDate);
    });
    tr.appendChild(tdDue);

    // Budget cell
    const tdBudget = document.createElement('td');
    tdBudget.className = 'editable-cell align-right';
    tdBudget.textContent = formatCurrency(item.budget);
    tdBudget.addEventListener('click', () => {
      makeCellEditable(tdBudget, (val) => {
        state.debt[index].budget = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.budget);
    });
    tr.appendChild(tdBudget);

    // Paid cell
    const tdActual = document.createElement('td');
    tdActual.className = 'editable-cell align-right';
    tdActual.textContent = formatCurrency(item.actual);
    tdActual.addEventListener('click', () => {
      makeCellEditable(tdActual, (val) => {
        state.debt[index].actual = parseFloat(val) || 0;
        recalculateAll();
      }, 'number', item.actual);
    });
    tr.appendChild(tdActual);

    tbody.appendChild(tr);
  });

  document.getElementById('debt-total-budget').textContent = formatCurrency(totalBgt);
  document.getElementById('debt-total-actual').textContent = formatCurrency(totalAct);
}

function renderAllocationTable() {
  const tbody = document.querySelector('#allocation-table .table-body');
  tbody.innerHTML = '';

  let totalPercent = 0;

  state.allocation.forEach((item, index) => {
    totalPercent += item.share;
    const tr = document.createElement('tr');

    // Asset Name cell
    const tdAsset = document.createElement('td');
    tdAsset.className = 'editable-cell';
    tdAsset.textContent = item.asset;
    tdAsset.addEventListener('click', () => {
      makeCellEditable(tdAsset, (val) => {
        state.allocation[index].asset = val;
        recalculateAll();
      }, 'text', item.asset);
    });
    tr.appendChild(tdAsset);

    // Share Percentage cell
    const tdShare = document.createElement('td');
    tdShare.className = 'editable-cell align-right';
    tdShare.textContent = `${item.share}%`;
    tdShare.addEventListener('click', () => {
      makeCellEditable(tdShare, (val) => {
        state.allocation[index].share = parseInt(val) || 0;
        recalculateAll();
      }, 'number', item.share);
    });
    tr.appendChild(tdShare);

    // Color picker cell
    const tdColor = document.createElement('td');
    tdColor.className = 'color-picker-cell align-center';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'color-input';
    colorInput.value = item.color;
    colorInput.addEventListener('change', (e) => {
      state.allocation[index].color = e.target.value;
      recalculateAll();
    });
    tdColor.appendChild(colorInput);
    tr.appendChild(tdColor);

    // Pattern Style selector cell
    const tdPattern = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'select-input';
    const patterns = [
      { val: 'none', label: 'Solid Color' },
      { val: 'cash', label: 'Cash Shading' },
      { val: 'dots', label: 'Sketch Dots' },
      { val: 'hatch-diagonal', label: 'Diagonal Hatch' },
      { val: 'hatch-cross', label: 'Cross Hatch' },
      { val: 'hatch-vertical', label: 'Vertical Hatch' },
      { val: 'swirls', label: 'Swirls / Loops' }
    ];
    patterns.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.val;
      opt.textContent = p.label;
      if (p.val === item.pattern) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
      state.allocation[index].pattern = e.target.value;
      recalculateAll();
    });
    tdPattern.appendChild(select);
    tr.appendChild(tdPattern);

    tbody.appendChild(tr);
  });

  const totPctEl = document.getElementById('allocation-total-percent');
  totPctEl.textContent = `${totalPercent}%`;
  if (totalPercent !== 100) {
    totPctEl.className = 'align-right negative-val';
  } else {
    totPctEl.className = 'align-right positive-val';
  }
}

// Click to edit helper for standard cells
function setupCellClick(element, type, onSave, rawValue) {
  element.addEventListener('click', () => {
    makeCellEditable(element, onSave, type, rawValue);
  });
}

// Add/Delete actions setup
function setupTableActionListeners() {
  // Income actions
  document.getElementById('add-income-row').addEventListener('click', () => {
    state.income.push({ id: Date.now(), description: '', expected: 0, actual: 0 });
    recalculateAll();
  });
  document.getElementById('delete-income-row').addEventListener('click', () => {
    if (state.income.length > 0) {
      state.income.pop();
      recalculateAll();
    }
  });

  // Bills actions
  document.getElementById('add-bills-row').addEventListener('click', () => {
    state.bills.push({ id: Date.now(), checked: false, description: '', dueDate: '', budget: 0, actual: 0 });
    recalculateAll();
  });
  document.getElementById('delete-bills-row').addEventListener('click', () => {
    if (state.bills.length > 0) {
      state.bills.pop();
      recalculateAll();
    }
  });

  // Expenses actions
  document.getElementById('add-expenses-row').addEventListener('click', () => {
    state.expenses.push({ id: Date.now(), category: '', budget: 0, actual: 0 });
    recalculateAll();
  });
  document.getElementById('delete-expenses-row').addEventListener('click', () => {
    if (state.expenses.length > 0) {
      state.expenses.pop();
      recalculateAll();
    }
  });

  // Debt actions
  document.getElementById('add-debt-row').addEventListener('click', () => {
    state.debt.push({ id: Date.now(), description: '', dueDate: '', budget: 0, actual: 0 });
    recalculateAll();
  });
  document.getElementById('delete-debt-row').addEventListener('click', () => {
    if (state.debt.length > 0) {
      state.debt.pop();
      recalculateAll();
    }
  });

  // Allocation actions
  document.getElementById('add-allocation-row').addEventListener('click', () => {
    state.allocation.push({ id: Date.now(), asset: '', share: 10, color: '#cccccc', pattern: 'none' });
    recalculateAll();
  });
  document.getElementById('delete-allocation-row').addEventListener('click', () => {
    if (state.allocation.length > 0) {
      state.allocation.pop();
      recalculateAll();
    }
  });
}

// Draw standard canvas charts: Budget vs Actual (Bar) and Expense Breakdown (Pie)
function drawStandardCharts() {
  drawBudgetVsActualChart();
  drawExpenseCategoryBreakdownChart();
}

function drawBudgetVsActualChart() {
  const canvas = document.getElementById('budget-vs-actual-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Summarize actual totals
  let totalBillsB = 0, totalBillsA = 0;
  state.bills.forEach(i => { totalBillsB += i.budget; totalBillsA += i.actual; });

  let totalExpB = 0, totalExpA = 0;
  state.expenses.forEach(i => { totalExpB += i.budget; totalExpA += i.actual; });

  let totalDebtB = 0, totalDebtA = 0;
  state.debt.forEach(i => { totalDebtB += i.budget; totalDebtA += i.actual; });

  const categories = [
    { label: 'Debts', budget: totalDebtB, actual: totalDebtA },
    { label: 'Savings', budget: state.cashFlowSummary.savingsBudget, actual: state.cashFlowSummary.savingsActual },
    { label: 'Bills', budget: totalBillsB, actual: totalBillsA },
    { label: 'Expenses', budget: totalExpB, actual: totalExpA }
  ];

  // Find max value for scaling
  const maxVal = Math.max(...categories.flatMap(c => [c.budget, c.actual]), 1000);
  const scaleLimit = Math.ceil(maxVal / 500) * 500; // Snap grid lines to next 500

  // Drawing configs
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  // Draw grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#718096';
  ctx.font = '10px Outfit, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const yVal = (scaleLimit / gridSteps) * i;
    const yPos = paddingTop + chartH - (yVal / scaleLimit) * chartH;
    
    // Line
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yPos);
    ctx.lineTo(w - paddingRight, yPos);
    ctx.stroke();
    
    // Label
    ctx.fillText(yVal.toLocaleString(undefined, { maximumFractionDigits: 0 }), paddingLeft - 8, yPos);
  }

  // Draw Bars
  const catCount = categories.length;
  const barGap = 16;
  const groupW = chartW / catCount;
  const barW = (groupW - barGap * 2) / 2;
  const hoverBars = [];

  categories.forEach((cat, index) => {
    const groupX = paddingLeft + index * groupW;
    
    // Budget bar: Pastel Pink #fbe0e5
    const bgtH = (cat.budget / scaleLimit) * chartH;
    const bgtY = paddingTop + chartH - bgtH;
    const bgtX = groupX + barGap;
    ctx.fillStyle = '#ffebf0';
    ctx.fillRect(bgtX, bgtY, barW, bgtH);
    ctx.strokeStyle = '#ffccd5';
    ctx.strokeRect(bgtX, bgtY, barW, bgtH);

    hoverBars.push({
      x1: bgtX,
      x2: bgtX + barW,
      y1: bgtY,
      y2: paddingTop + chartH,
      label: `${cat.label} (Budget)`,
      value: cat.budget
    });

    // Actual bar: Solid Pink #ff85a2
    const actH = (cat.actual / scaleLimit) * chartH;
    const actY = paddingTop + chartH - actH;
    const actX = bgtX + barW;
    ctx.fillStyle = '#ff85a2';
    ctx.fillRect(actX, actY, barW, actH);
    ctx.strokeStyle = '#ff6b8b';
    ctx.strokeRect(actX, actY, barW, actH);

    hoverBars.push({
      x1: actX,
      x2: actX + barW,
      y1: actY,
      y2: paddingTop + chartH,
      label: `${cat.label} (Actual)`,
      value: cat.actual
    });

    // Draw bottom category label
    ctx.fillStyle = '#2d3748';
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cat.label, groupX + groupW / 2, paddingTop + chartH + 6);
  });

  canvas.hoverBars = hoverBars;

  // Legend at top
  ctx.font = '10px Outfit, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#2d3748';
  
  // Budget legend
  ctx.fillStyle = '#ffebf0';
  ctx.fillRect(w - 130, 4, 12, 12);
  ctx.strokeStyle = '#ffccd5';
  ctx.strokeRect(w - 130, 4, 12, 12);
  ctx.fillStyle = '#718096';
  ctx.fillText('Budget', w - 85, 10);

  // Actual legend
  ctx.fillStyle = '#ff85a2';
  ctx.fillRect(w - 70, 4, 12, 12);
  ctx.strokeStyle = '#ff6b8b';
  ctx.strokeRect(w - 70, 4, 12, 12);
  ctx.fillStyle = '#718096';
  ctx.fillText('Actual', w - 20, 10);
}

function drawExpenseCategoryBreakdownChart() {
  const canvas = document.getElementById('expense-breakdown-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Summarize actual totals
  let totalBillsA = 0;
  state.bills.forEach(i => { totalBillsA += i.actual; });

  let totalExpA = 0;
  state.expenses.forEach(i => { totalExpA += i.actual; });

  let totalDebtA = 0;
  state.debt.forEach(i => { totalDebtA += i.actual; });

  const categories = [
    { label: 'Expenses', actual: totalExpA, color: '#ffccd5' },
    { label: 'Debts', actual: totalDebtA, color: '#ffe5ec' },
    { label: 'Savings', actual: state.cashFlowSummary.savingsActual, color: '#fceade' },
    { label: 'Bills', actual: totalBillsA, color: '#e8dbfc' }
  ];

  const totalActual = categories.reduce((sum, c) => sum + c.actual, 0);

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.3;

  if (totalActual === 0) {
    ctx.fillStyle = '#718096';
    ctx.font = '12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No actual outflows recorded', cx, cy);
    return;
  }

  let startAngle = -Math.PI / 2;
  const labelsToDraw = [];

  categories.forEach(cat => {
    if (cat.actual === 0) return;
    
    const sliceAngle = (cat.actual / totalActual) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    // Draw Slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const midAngle = startAngle + sliceAngle / 2;
    const sharePercent = (cat.actual / totalActual) * 100;
    
    const labelCos = Math.cos(midAngle);
    const labelSin = Math.sin(midAngle);
    
    const px1 = cx + r * 0.9 * labelCos;
    const py1 = cy + r * 0.9 * labelSin;
    
    const px2 = cx + r * 1.35 * labelCos;
    const py2 = cy + r * 1.35 * labelSin;

    labelsToDraw.push({
      label: cat.label,
      sharePercent,
      isLeft: labelCos < 0,
      px1,
      py1,
      px2,
      py2,
      y: py2
    });

    startAngle = endAngle;
  });

  const leftLabels = labelsToDraw.filter(l => l.isLeft);
  const rightLabels = labelsToDraw.filter(l => !l.isLeft);

  const minSpacing = 20;

  function adjustSpacing(labels) {
    if (labels.length === 0) return;
    labels.sort((a, b) => a.y - b.y);
    
    // Spread down
    for (let i = 1; i < labels.length; i++) {
      if (labels[i].y - labels[i - 1].y < minSpacing) {
        labels[i].y = labels[i - 1].y + minSpacing;
      }
    }
    
    // Spread up if pushed too low
    if (labels[labels.length - 1].y > h - 15) {
      labels[labels.length - 1].y = h - 15;
      for (let i = labels.length - 2; i >= 0; i--) {
        if (labels[i + 1].y - labels[i].y < minSpacing) {
          labels[i].y = labels[i + 1].y - minSpacing;
        }
      }
    }
    
    // Spread down if pushed too high
    if (labels[0].y < 15) {
      labels[0].y = 15;
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < minSpacing) {
          labels[i].y = labels[i - 1].y + minSpacing;
        }
      }
    }
  }

  adjustSpacing(leftLabels);
  adjustSpacing(rightLabels);

  [...leftLabels, ...rightLabels].forEach(l => {
    const shoulderLen = 8;
    const px3 = l.px2 + (l.isLeft ? -shoulderLen : shoulderLen);
    
    ctx.beginPath();
    ctx.moveTo(l.px1, l.py1);
    ctx.lineTo(l.px2, l.y);
    ctx.lineTo(px3, l.y);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = '10px Outfit, sans-serif';
    ctx.textAlign = l.isLeft ? 'right' : 'left';
    
    ctx.textBaseline = 'bottom';
    ctx.fillText(l.label, px3 + (l.isLeft ? -4 : 4), l.y - 1);
    
    ctx.font = '9px Outfit, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`${l.sharePercent.toFixed(1)}%`, px3 + (l.isLeft ? -4 : 4), l.y + 1);
  });
}

// Floating Toast Helper System
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const messageSpan = document.createElement('span');
  messageSpan.className = 'toast-message';
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);

  const closeBtn = document.createElement('span');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Trigger browser reflow to animate
  toast.offsetHeight;
  toast.classList.add('show');

  // Automatically remove toast after 4 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// HTML escaping helper to prevent Stored XSS via filenames or other strings
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// Render list of imported statements (shows a single "View PDF" button when one or more statements exist)
function renderImportedStatementsList() {
  const container = document.getElementById('imported-statements-list');
  if (!container) return;

  container.innerHTML = '';
  const statements = (state.settings && state.settings.importedStatements) || [];
  if (statements.length === 0) return;

  // Render a single "View PDF" action button
  const viewPdfBtn = document.createElement('button');
  viewPdfBtn.className = 'view-pdf-btn';
  viewPdfBtn.id = 'view-pdf-btn';
  viewPdfBtn.title = 'View imported PDF statements';
  viewPdfBtn.innerHTML = `
    <svg class="file-icon" viewBox="0 0 24 24" width="14" height="14" style="margin-right: 6px; vertical-align: middle;">
      <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
    </svg>
    <span>View PDF</span>
  `;
  
  viewPdfBtn.addEventListener('click', () => {
    openViewPdfModal();
  });
  container.appendChild(viewPdfBtn);
}

// Open the "View PDF" modal and render the list of all imported statements using an accordion layout
function openViewPdfModal() {
  const modal = document.getElementById('statement-modal');
  const body = document.getElementById('modal-statement-body');
  if (!modal || !body) return;

  body.innerHTML = '';
  const statements = (state.settings && state.settings.importedStatements) || [];

  if (statements.length === 0) {
    body.innerHTML = '<p style="text-align: center; color: var(--text-muted); margin: 20px 0;">No imported PDF statements found.</p>';
    modal.classList.add('show');
    return;
  }

  statements.forEach(stmt => {
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.setAttribute('data-statement-id', stmt.id);

    // Header
    const header = document.createElement('div');
    header.className = 'accordion-header';
    const escapedFilename = escapeHTML(stmt.filename);
    const escapedImportedAt = escapeHTML(stmt.importedAt || '-');
    header.innerHTML = `
      <div class="accordion-title-info">
        <svg viewBox="0 0 24 24" width="14" height="14" style="color: #3b82f6; flex-shrink: 0;">
          <path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
        <span class="accordion-filename" title="${escapedFilename}">${escapedFilename}</span>
        <span class="accordion-meta">(${escapedImportedAt})</span>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'accordion-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'accordion-toggle-btn';
    toggleBtn.textContent = 'Show Transactions';
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      item.classList.toggle('expanded');
      toggleBtn.textContent = item.classList.contains('expanded') ? 'Hide Transactions' : 'Show Transactions';
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'accordion-delete-btn';
    deleteBtn.title = 'Remove this statement & revert changes';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmRemove = await showConfirmDialog({
        title: 'Remove Statement',
        message: `Are you sure you want to remove the statement "<strong>${escapedFilename}</strong>"? This will revert all its transaction changes.`,
        isDestructive: true
      });
      if (confirmRemove) {
        removeImportedStatement(stmt.id);
        if (state.settings.importedStatements.length === 0) {
          modal.classList.remove('show');
        } else {
          openViewPdfModal();
        }
      }
    });

    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(actions);

    // Clicking the header itself toggles expand/collapse
    header.addEventListener('click', () => {
      item.classList.toggle('expanded');
      toggleBtn.textContent = item.classList.contains('expanded') ? 'Hide Transactions' : 'Show Transactions';
    });

    item.appendChild(header);

    // Content (Transactions list)
    const content = document.createElement('div');
    content.className = 'accordion-content';

    const tableContainer = document.createElement('div');
    tableContainer.className = 'modal-table-container';
    
    const table = document.createElement('table');
    table.className = 'spreadsheet-table';
    table.style.marginBottom = '0';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Type / Date</th>
          <th>Description</th>
          <th>Category / Table</th>
          <th class="align-right">Amount</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    const visibleTxs = (stmt.transactions || []).filter(tx => !(tx.table === 'income' && tx.type === 'cashback'));

    if (visibleTxs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="align-center">No transactions recorded for this statement.</td></tr>';
    } else {
      visibleTxs.forEach(tx => {
        const tr = document.createElement('tr');
        
        const tdType = document.createElement('td');
        const displayType = tx.type ? tx.type.toUpperCase() : 'SENT';
        const timeStr = tx.time ? ` ${tx.time}` : '';
        const dateStr = tx.date ? ` (${tx.date}${timeStr})` : '';
        tdType.textContent = displayType + dateStr;
        tr.appendChild(tdType);

        const tdDesc = document.createElement('td');
        tdDesc.textContent = tx.description || 'Transaction';
        tr.appendChild(tdDesc);

        const tdCat = document.createElement('td');
        if (tx.table === 'expenses') {
          tdCat.textContent = `Expenses (${tx.category})`;
        } else if (tx.table === 'cashback_detail') {
          tdCat.textContent = 'CASHBACK';
        } else {
          tdCat.textContent = tx.table.toUpperCase();
        }
        tr.appendChild(tdCat);

        const tdAmt = document.createElement('td');
        tdAmt.className = 'align-right';
        tdAmt.textContent = formatCurrency(tx.amount || 0);
        tr.appendChild(tdAmt);

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    content.appendChild(tableContainer);
    item.appendChild(content);

    body.appendChild(item);
  });

  modal.classList.add('show');
}

// Rollback / delete statement
function removeImportedStatement(statementId) {
  const statements = (state.settings && state.settings.importedStatements) || [];
  const stmtIndex = statements.findIndex(s => s.id === statementId);
  if (stmtIndex === -1) return;
  const stmt = statements[stmtIndex];

  // Rollback transactions log
  if (stmt.transactions) {
    stmt.transactions.forEach(tx => {
      if (tx.table === 'income') {
        state.income = state.income.filter(item => item.id !== tx.id);
      } else if (tx.table === 'bills') {
        state.bills = state.bills.filter(item => item.id !== tx.id);
      } else if (tx.table === 'debt') {
        state.debt = state.debt.filter(item => item.id !== tx.id);
      } else if (tx.table === 'expenses') {
        const categoryItem = state.expenses.find(item => item.category.toLowerCase() === tx.category.toLowerCase());
        if (categoryItem) {
          categoryItem.actual = Math.max(0, categoryItem.actual - tx.amount);
        }
      }
    });
  }

  // Remove the statement from metadata
  state.settings.importedStatements.splice(stmtIndex, 1);

  // Fallback cleanup of single-file compatibility settings if empty
  if (state.settings.importedStatements.length === 0) {
    state.settings.importedFileName = null;
    state.settings.preImportState = null;
  } else {
    // set importedFileName to the last imported statement filename
    state.settings.importedFileName = state.settings.importedStatements[state.settings.importedStatements.length - 1].filename;
  }

  // Recalculate and trigger sync
  recalculateAll();
  showToast(`Statement "${stmt.filename}" removed and changes reverted.`, 'info');
}

/**
 * Show a sleek custom confirmation dialog modal.
 * @param {Object} options
 * @param {string} options.title - The title of the modal
 * @param {string} options.message - The HTML or text message
 * @param {boolean} [options.isDestructive=false] - Whether the action is destructive
 * @returns {Promise<boolean>} Resolves to true if user confirms, false if cancels
 */
function showConfirmDialog({ title, message, isDestructive = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
      resolve(false);
      return;
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
    const closeBtn = document.getElementById('confirm-modal-close-btn');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.innerHTML = message;

    // Set styling of confirm button
    if (confirmBtn) {
      if (isDestructive) {
        confirmBtn.classList.add('destructive');
      } else {
        confirmBtn.classList.remove('destructive');
      }
    }

    // Strip old listeners by cloning the buttons
    const newConfirmBtn = confirmBtn ? confirmBtn.cloneNode(true) : null;
    const newCancelBtn = cancelBtn ? cancelBtn.cloneNode(true) : null;
    const newCloseBtn = closeBtn ? closeBtn.cloneNode(true) : null;

    if (confirmBtn && newConfirmBtn) confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    if (cancelBtn && newCancelBtn) cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    if (closeBtn && newCloseBtn) closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    let resolved = false;

    const cleanupAndClose = (result) => {
      if (resolved) return;
      resolved = true;

      // Close modal
      modal.classList.remove('show');

      // Remove event listeners
      if (newCancelBtn) newCancelBtn.removeEventListener('click', handleCancel);
      if (newCloseBtn) newCloseBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleEsc);
      
      // Resolve promise
      resolve(result);
    };

    const handleConfirm = () => {
      cleanupAndClose(true);
    };

    const handleCancel = () => {
      cleanupAndClose(false);
    };

    const handleOverlayClick = (e) => {
      if (e.target === modal) {
        cleanupAndClose(false);
      }
    };

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        cleanupAndClose(false);
      }
    };

    // Setup event listeners
    if (newConfirmBtn) newConfirmBtn.addEventListener('click', handleConfirm);
    if (newCancelBtn) newCancelBtn.addEventListener('click', handleCancel);
    if (newCloseBtn) newCloseBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleEsc);

    // Show modal
    modal.classList.add('show');
  });
}

/**
 * Setup hover event listener on Budget vs Actual canvas to show numbers in a sleek glassmorphic tooltip.
 */
function setupChartHover() {
  const canvas = document.getElementById('budget-vs-actual-canvas');
  if (!canvas) return;

  // Create tooltip element if it doesn't exist
  let tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.className = 'chart-tooltip';
    canvas.parentNode.appendChild(tooltip);
  }

  canvas.addEventListener('mousemove', (e) => {
    const x = e.offsetX;
    const y = e.offsetY;

    const hoverBars = canvas.hoverBars || [];
    let activeBar = null;

    for (const bar of hoverBars) {
      if (x >= bar.x1 && x <= bar.x2 && y >= bar.y1 && y <= bar.y2) {
        activeBar = bar;
        break;
      }
    }

    if (activeBar) {
      tooltip.innerHTML = `<div style="font-weight: 700; color: var(--accent-pink); margin-bottom: 2px;">${activeBar.label}</div><div style="font-size: 13px;">${formatCurrency(activeBar.value)}</div>`;
      tooltip.style.left = `${e.offsetX}px`;
      tooltip.style.top = `${e.offsetY}px`;
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translate(-50%, -100%) translateY(-10px)';
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.style.opacity = '0';
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    canvas.style.cursor = 'default';
  });
}

/**
 * Validate that the budget data has all the required properties in the schema.
 * @param {Object} data - The budget state object to validate
 * @returns {boolean} True if data has a valid structure, false otherwise
 */
function isValidBudget(data) {
  return !!(data && 
            data.settings && 
            data.settings.month && 
            data.settings.year &&
            Array.isArray(data.income) &&
            Array.isArray(data.bills) &&
            Array.isArray(data.expenses) &&
            Array.isArray(data.debt) &&
            Array.isArray(data.allocation));
}

/**
 * Migration helper to update default January due dates to match the opened dashboard month.
 * @param {Object} data - The budget state object
 * @returns {Object} The migrated budget state object
 */
function migrateDefaultDates(data) {
  if (!data || !data.settings) return data;
  const month = data.settings.month.toUpperCase();
  const year = data.settings.year;
  if (month === 'JANUARY') return data;

  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  let monthIdx = monthNames.indexOf(month);
  if (monthIdx === -1) return data;

  const yearInt = parseInt(year) || 2026;
  const numDays = new Date(yearInt, monthIdx + 1, 0).getDate();
  const pad = (n) => n.toString().padStart(2, '0');

  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthNameShort = monthNamesShort[monthIdx];

  // Update overview start and end dates if they are January defaults
  if (data.settings.startDate && data.settings.startDate.endsWith('-01-01')) {
    data.settings.startDate = `${yearInt}-${pad(monthIdx + 1)}-01`;
  }
  if (data.settings.endDate && data.settings.endDate.endsWith('-01-31')) {
    data.settings.endDate = `${yearInt}-${pad(monthIdx + 1)}-${pad(numDays)}`;
  }

  const getCorrectDueDate = (oldDueDate) => {
    if (!oldDueDate || !oldDueDate.includes('Jan')) return oldDueDate;
    const match = oldDueDate.match(/Jan\s+(\d+)/);
    if (!match) return oldDueDate;
    let dayNum = parseInt(match[1]);
    if (dayNum === 31) dayNum = numDays;

    try {
      const d = new Date(yearInt, monthIdx, dayNum);
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const wkday = weekdays[d.getDay()];
      return `${wkday}, ${monthNameShort} ${dayNum}`;
    } catch (e) {
      return oldDueDate;
    }
  };

  if (data.bills) {
    data.bills.forEach(b => {
      if (b.dueDate) b.dueDate = getCorrectDueDate(b.dueDate);
    });
  }
  if (data.debt) {
    data.debt.forEach(d => {
      if (d.dueDate) d.dueDate = getCorrectDueDate(d.dueDate);
    });
  }

  return data;
}
