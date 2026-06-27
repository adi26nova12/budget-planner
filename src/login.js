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

// Redirect if already logged in
function checkSessionAndRedirect() {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      window.location.replace('/');
    }
  }).catch(err => {
    console.warn('[AUTH] Session check error:', err);
  });
}

// Switch between Forms
function showLoginForm() {
  document.getElementById('form-signup').classList.remove('active');
  document.getElementById('form-login').classList.add('active');
  window.history.pushState(null, '', '/login');
}

function showSignupForm() {
  document.getElementById('form-login').classList.remove('active');
  document.getElementById('form-signup').classList.add('active');
  window.history.pushState(null, '', '/register');
}

// Handle Visibility Toggle
function initPasswordToggles() {
  const toggleBtns = document.querySelectorAll('.toggle-password-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = `
          <!-- Eye closed icon -->
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        `;
      } else {
        input.type = 'password';
        btn.innerHTML = `
          <!-- Eye open icon -->
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        `;
      }
    });
  });
}

// Auth Submissions handlers
function initAuthHandlers() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Signing in...';

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        // Success -> redirect
        window.location.replace('/');
      } catch (err) {
        alert('Login Error: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Sign In';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Creating account...';

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            }
          }
        });

        if (error) throw error;

        alert('Account created! If email verification is enabled, check your inbox to confirm. Otherwise, you can sign in directly.');
        showLoginForm();
      } catch (err) {
        alert('Signup Error: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Sign Up';
      }
    });
  }

  // Google OAuth Login
  const handleGoogleOAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/'
        }
      });
      if (error) throw error;
    } catch (err) {
      alert('Google Authentication failed: ' + err.message);
    }
  };

  const googleBtnLogin = document.getElementById('btn-google-login');
  const googleBtnSignup = document.getElementById('btn-google-signup');

  if (googleBtnLogin) googleBtnLogin.addEventListener('click', handleGoogleOAuth);
  if (googleBtnSignup) googleBtnSignup.addEventListener('click', handleGoogleOAuth);

  // Forgot password handler
  const forgotPasswordTrigger = document.getElementById('forgot-password-trigger');
  if (forgotPasswordTrigger) {
    forgotPasswordTrigger.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      if (!email) {
        alert('Please enter your email address in the Email field first.');
        return;
      }

      const confirmReset = confirm(`Send password reset link to ${email}?`);
      if (confirmReset) {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/dashboard#reset-password'
          });
          if (error) throw error;
          alert('Password reset email sent! Check your inbox.');
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    });
  }
}

// Initializer
function init() {
  initTheme();
  checkSessionAndRedirect();
  initPasswordToggles();
  initAuthHandlers();

  // Listeners for theme toggle
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Form Switch Triggers
  const switchToSignup = document.getElementById('switch-to-signup-trigger');
  const switchToLogin = document.getElementById('switch-to-login-trigger');

  if (switchToSignup) switchToSignup.addEventListener('click', (e) => { e.preventDefault(); showSignupForm(); });
  if (switchToLogin) switchToLogin.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

  // Handle routing based on page load URL path
  const path = window.location.pathname;
  if (path === '/register' || path === '/signup') {
    showSignupForm();
  } else {
    showLoginForm();
  }

  // Session listener redirect
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      window.location.replace('/');
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
