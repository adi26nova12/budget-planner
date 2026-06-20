import './style.css';
import './journal.css';
import { supabase } from './supabase.js';

// Initialize Theme
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

// Update Navbar links based on login state
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
    
    const dropdownName = document.getElementById('dropdown-user-name');
    const dropdownEmail = document.getElementById('dropdown-user-email');
    if (dropdownName) dropdownName.textContent = name;
    if (dropdownEmail) dropdownEmail.textContent = email;
    
    // Set initials
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const userInitials = document.getElementById('nav-user-initials');
    if (userInitials) userInitials.textContent = initials;
  } else {
    if (dashboardLink) dashboardLink.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (profileDropdown) profileDropdown.style.display = 'none';
  }
}

async function handleLogout() {
  const confirmLogout = confirm('Are you sure you want to sign out?');
  if (confirmLogout) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
    } else {
      localStorage.removeItem('last_opened_month');
      localStorage.removeItem('last_opened_year');
      window.location.reload();
    }
  }
}

function initHome() {
  initTheme();
  
  // Theme Toggle Listener
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Avatar Dropdown Toggle
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

  // Logout Button
  const logoutBtn = document.getElementById('dropdown-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Check Supabase session
  supabase.auth.getSession().then(({ data: { session } }) => {
    updateNavbar(session);
  }).catch(err => {
    console.warn('[AUTH] Failed to fetch session on landing load:', err);
    updateNavbar(null);
  });

  // Keep checking auth status updates
  supabase.auth.onAuthStateChange((event, session) => {
    updateNavbar(session);
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}
