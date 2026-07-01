import './style.css';
import './journal.css';
import { supabase } from './supabase.js';
import { HandDrawnPieChart } from './hand-drawn-chart.js';

let currentSession = null;
let currentBudgetData = null;
let homePieChartInstance = null;
let reportsDonutChartInstance = null;
let isTransactionsExpanded = false;
const defaultCategories = ["Personal Care", "Travel", "Home", "Groceries", "Pets", "Education", "Food", "Entertainment", "Fuel"];
const API_BASE_URL = 'http://localhost:8000';

function formatNumber(num) {
  if (num === undefined || num === null) return '0.00';
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(amount, currency = '₹') {
  return `${currency}${formatNumber(amount)}`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function showConfirmDialog({ title, message, isDestructive = false }) {
  return new Promise((resolve) => {
    let modal = document.getElementById('confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content confirm-modal-content">
          <div class="modal-header confirm-modal-header">
            <h3 id="confirm-modal-title">Confirm Action</h3>
            <button class="modal-close-btn" id="confirm-modal-close-btn">&times;</button>
          </div>
          <div class="modal-body confirm-modal-body">
            <p id="confirm-modal-message">Are you sure you want to proceed?</p>
          </div>
          <div class="modal-footer confirm-modal-footer">
            <button class="modal-btn confirm-modal-btn-cancel" id="confirm-modal-cancel-btn">Cancel</button>
            <button class="modal-btn confirm-modal-btn-confirm" id="confirm-modal-confirm-btn">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
    const closeBtn = document.getElementById('confirm-modal-close-btn');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.innerHTML = message;

    if (confirmBtn) {
      if (isDestructive) {
        confirmBtn.classList.add('destructive');
      } else {
        confirmBtn.classList.remove('destructive');
      }
    }

    const newConfirmBtn = confirmBtn ? confirmBtn.cloneNode(true) : null;
    const newCancelBtn = cancelBtn ? cancelBtn.cloneNode(true) : null;
    const newCloseBtn = closeBtn ? closeBtn.cloneNode(true) : null;

    if (confirmBtn && newConfirmBtn) confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    if (cancelBtn && newCancelBtn) cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    if (closeBtn && newCloseBtn) closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const cleanupAndClose = (result) => {
      modal.classList.remove('show');
      setTimeout(() => {
        if (!modal.classList.contains('show')) {
          modal.style.display = 'none';
        }
      }, 250);
      if (newConfirmBtn) newConfirmBtn.removeEventListener('click', handleConfirm);
      if (newCancelBtn) newCancelBtn.removeEventListener('click', handleCancel);
      if (newCloseBtn) newCloseBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleEsc);
      resolve(result);
    };

    const handleConfirm = () => cleanupAndClose(true);
    const handleCancel = () => cleanupAndClose(false);
    const handleOverlayClick = (e) => { if (e.target === modal) cleanupAndClose(false); };
    const handleEsc = (e) => { if (e.key === 'Escape') cleanupAndClose(false); };

    if (newConfirmBtn) newConfirmBtn.addEventListener('click', handleConfirm);
    if (newCancelBtn) newCancelBtn.addEventListener('click', handleCancel);
    if (newCloseBtn) newCloseBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleEsc);

    modal.style.display = 'flex';
    modal.offsetHeight; // force reflow
    modal.classList.add('show');
  });
}

function showAlertDialog({ title, message }) {
  return new Promise((resolve) => {
    let modal = document.getElementById('alert-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'alert-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content confirm-modal-content">
          <div class="modal-header confirm-modal-header">
            <h3 id="alert-modal-title">Attention</h3>
            <button class="modal-close-btn" id="alert-modal-close-btn">&times;</button>
          </div>
          <div class="modal-body confirm-modal-body">
            <p id="alert-modal-message">Notification message here</p>
          </div>
          <div class="modal-footer confirm-modal-footer">
            <button class="modal-btn confirm-modal-btn-confirm" id="alert-modal-ok-btn">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('alert-modal-title');
    const messageEl = document.getElementById('alert-modal-message');
    const okBtn = document.getElementById('alert-modal-ok-btn');
    const closeBtn = document.getElementById('alert-modal-close-btn');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.innerHTML = message;

    const newOkBtn = okBtn ? okBtn.cloneNode(true) : null;
    const newCloseBtn = closeBtn ? closeBtn.cloneNode(true) : null;

    if (okBtn && newOkBtn) okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    if (closeBtn && newCloseBtn) closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const cleanupAndClose = () => {
      modal.classList.remove('show');
      setTimeout(() => {
        if (!modal.classList.contains('show')) {
          modal.style.display = 'none';
        }
      }, 250);
      if (newOkBtn) newOkBtn.removeEventListener('click', cleanupAndClose);
      if (newCloseBtn) newCloseBtn.removeEventListener('click', cleanupAndClose);
      modal.removeEventListener('click', handleOverlayClick);
      document.removeEventListener('keydown', handleEsc);
      resolve();
    };

    const handleOverlayClick = (e) => { if (e.target === modal) cleanupAndClose(); };
    const handleEsc = (e) => { if (e.key === 'Escape') cleanupAndClose(); };

    if (newOkBtn) newOkBtn.addEventListener('click', cleanupAndClose);
    if (newCloseBtn) newCloseBtn.addEventListener('click', cleanupAndClose);
    modal.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleEsc);

    modal.style.display = 'flex';
    modal.offsetHeight; // force reflow
    modal.classList.add('show');
  });
}

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

function showStickyNote(message) {
  const modal = document.getElementById('sticky-note-modal');
  const msgEl = document.getElementById('sticky-note-message');
  if (modal && msgEl) {
    msgEl.textContent = message;
    modal.style.display = 'flex';
  }
}

async function fetchBudget(month, year, accessToken) {
  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${API_BASE_URL}/api/budget?month=${month.toUpperCase()}&year=${year}`, {
    headers
  });
  if (!response.ok) {
    throw new Error('Failed to fetch budget data');
  }
  return response.json();
}

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
  const onboardingHelpBtn = document.getElementById('onboarding-help-btn');
  
  if (session) {
    if (dashboardLink) dashboardLink.style.display = 'inline-flex';
    if (profileLink) profileLink.style.display = 'inline-flex';
    if (loginBtn) loginBtn.style.display = 'none';
    if (profileDropdown) profileDropdown.style.display = 'inline-flex';
    if (onboardingHelpBtn) onboardingHelpBtn.style.display = 'inline-flex';
    
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
    if (onboardingHelpBtn) onboardingHelpBtn.style.display = 'none';
  }
}

async function handleLogout() {
  const confirmLogout = await showConfirmDialog({
    title: 'Sign Out',
    message: 'Are you sure you want to sign out from Piggy Planner?'
  });
  if (confirmLogout) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      await showAlertDialog({ title: 'Error', message: error.message });
    } else {
      localStorage.removeItem('last_opened_month');
      localStorage.removeItem('last_opened_year');
      window.location.reload();
    }
  }
}

// Render Home spending pie chart
function initPieChart() {
  const canvas = document.getElementById('home-spending-pie-canvas');
  if (!canvas) return;

  const spendingData = [];

  try {
    const chart = new HandDrawnPieChart(canvas, spendingData.length > 0 ? spendingData : [{ label: 'No expenses', value: 1, color: '#f3f4f6', pattern: 'none' }]);
    homePieChartInstance = chart;
    chart.draw();
  } catch (e) {
    console.error('[CHART] Error rendering home spending pie chart:', e);
  }
}

function updatePieChartAndLegend(spendingData, totalSum) {
  const canvas = document.getElementById('home-spending-pie-canvas');
  if (!canvas) return;

  try {
    const chart = new HandDrawnPieChart(canvas, spendingData.length > 0 ? spendingData : [{ label: 'No expenses', value: 1, color: '#f3f4f6', pattern: 'none' }]);
    homePieChartInstance = chart;
    chart.draw();
  } catch (e) {
    console.error('[CHART] Draw error:', e);
  }

  const legendUl = document.querySelector('.home-pie-legend');
  if (legendUl) {
    legendUl.innerHTML = '';
    if (spendingData.length === 0) {
      legendUl.innerHTML = '<li><span class="home-legend-box" style="background-color: #f3f4f6;"></span> <span>No expenses recorded</span></li>';
    } else {
      spendingData.forEach(item => {
        const pct = totalSum > 0 ? Math.round((item.value / totalSum) * 100) : 0;
        const li = document.createElement('li');
        li.innerHTML = `<span class="home-legend-box" style="background-color: ${item.color};"></span> <span>${escapeHTML(item.label)} (${pct}%)</span>`;
        legendUl.appendChild(li);
      });
    }
  }
}

async function loadRealData(session) {
  if (!session) return;
  
  const monthSelect = document.getElementById('home-month-select');
  const yearInput = document.getElementById('home-year-input');
  if (!monthSelect || !yearInput) return;

  const month = monthSelect.value;
  const year = yearInput.value;

  try {
    const budgetData = await fetchBudget(month, year, session.access_token);
    currentBudgetData = budgetData;
    
    localStorage.setItem('last_opened_month', month);
    localStorage.setItem('last_opened_year', year);

    let totalIncomeActual = 0;
    if (budgetData.income) {
      budgetData.income.forEach(inc => {
        totalIncomeActual += inc.actual || 0;
      });
    }

    let totalBillsActual = 0;
    if (budgetData.bills) {
      budgetData.bills.forEach(b => {
        totalBillsActual += b.actual || 0;
      });
    }

    let totalExpensesActual = 0;
    if (budgetData.expenses) {
      budgetData.expenses.forEach(exp => {
        totalExpensesActual += exp.actual || 0;
      });
    }

    let totalDebtActual = 0;
    if (budgetData.debt) {
      budgetData.debt.forEach(d => {
        totalDebtActual += d.actual || 0;
      });
    }

    const savingsActual = (budgetData.cashFlowSummary && budgetData.cashFlowSummary.savingsActual) || 0;
    const totalOutflow = totalBillsActual + totalExpensesActual + totalDebtActual + savingsActual;
    const remainingToSave = savingsActual;

    const incomeEl = document.getElementById('home-total-income');
    const expensesEl = document.getElementById('home-total-expenses');
    const savingsEl = document.getElementById('home-total-savings');

    const currencySymbol = budgetData.settings?.currency || '₹';

    if (incomeEl) incomeEl.textContent = formatCurrency(totalIncomeActual, currencySymbol);
    if (expensesEl) expensesEl.textContent = formatCurrency(totalOutflow, currencySymbol);
    if (savingsEl) savingsEl.textContent = formatCurrency(remainingToSave, currencySymbol);

    const txList = [];
    if (budgetData.settings?.importedStatements) {
      budgetData.settings.importedStatements.forEach(stmt => {
        if (stmt.transactions) {
          stmt.transactions.forEach(tx => {
            if (!(tx.table === 'income' && tx.type === 'cashback')) {
              txList.push({
                ...tx,
                filename: stmt.filename
              });
            }
          });
        }
      });
    }

    txList.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateB - dateA;
    });

    const txListContainer = document.getElementById('home-recent-transactions-list');
    if (txListContainer) {
      txListContainer.innerHTML = '';
      if (txList.length === 0) {
        txListContainer.innerHTML = `
          <li style="text-align: center; padding: 32px 16px; font-family: 'Patrick Hand', cursive; color: #7A695C;">
            No transactions found for this month.<br>
            <span style="font-size: 13px; color: #a0aec0;">Import statements in the <a href="/dashboard" style="color: #ff85a2; text-decoration: underline;">Dashboard</a> to see them here!</span>
          </li>
        `;
      } else {
        txList.slice(0, 5).forEach(tx => {
          const li = document.createElement('li');
          li.className = 'transaction-item';

          let iconCircleClass = 'circle-grey';
          let svgContent = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          `;

          const tableType = tx.table;

          if (tableType === 'income') {
            iconCircleClass = 'circle-green';
            svgContent = `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <polyline points="19 12 12 19 5 12"/>
              </svg>
            `;
          } else if (tableType === 'bills') {
            iconCircleClass = 'circle-purple';
            svgContent = `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            `;
          } else if (tableType === 'debt') {
            iconCircleClass = 'circle-yellow';
            svgContent = `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="8" x2="22" y2="12"/>
                <line x1="22" y1="12" x2="18" y2="16"/>
                <line x1="22" y1="12" x2="2" y2="12"/>
              </svg>
            `;
          } else if (tableType === 'expenses') {
            iconCircleClass = 'circle-pink';
            svgContent = `
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            `;
          }

          const displayAmount = tx.type === 'received' 
            ? `+${formatCurrency(tx.amount, currencySymbol)}` 
            : `-${formatCurrency(tx.amount, currencySymbol)}`;
            
          const amountColorClass = tx.type === 'received' ? 'green-ink' : 'red-ink';
          const displayCategory = tx.category || (tableType ? tableType.charAt(0).toUpperCase() + tableType.slice(1) : 'Other');

          li.innerHTML = `
            <div class="transaction-item-left">
              <div class="tx-icon-circle ${iconCircleClass}">
                ${svgContent}
              </div>
              <div class="tx-details">
                <span class="tx-title">${escapeHTML(tx.description || 'Transaction')}</span>
                <span class="tx-category">${escapeHTML(displayCategory)}</span>
              </div>
            </div>
            <div class="transaction-item-right">
              <span class="tx-amount ${amountColorClass}">${displayAmount}</span>
              <span class="tx-date">${escapeHTML(tx.date || 'Imported')}</span>
            </div>
          `;
          txListContainer.appendChild(li);
        });
      }
    }

    // Populate full Transactions Ledger page tab
    const fullTxTbody = document.getElementById('home-transactions-tbody');
    const viewMoreContainer = document.getElementById('home-tx-view-more-container');
    const viewMoreBtn = document.getElementById('home-tx-view-more-btn');

    if (fullTxTbody) {
      fullTxTbody.innerHTML = '';
      if (txList.length === 0) {
        fullTxTbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 48px 16px; font-family: 'Patrick Hand', cursive; color: #7A695C; font-size: 16px;">
              No transactions found for this month.<br>
              <span style="font-size: 13px; color: #a0aec0;">Import statements in the <a href="/dashboard" style="color: #ff85a2; text-decoration: underline; font-weight: 600;">Dashboard</a> to see them here!</span>
            </td>
          </tr>
        `;
        if (viewMoreContainer) viewMoreContainer.style.display = 'none';
      } else {
        const visibleTxs = isTransactionsExpanded ? txList : txList.slice(0, 5);

        visibleTxs.forEach(tx => {
          const displayAmount = tx.type === 'received' 
            ? `+${formatCurrency(tx.amount, currencySymbol)}` 
            : `-${formatCurrency(tx.amount, currencySymbol)}`;
            
          const amountColorClass = tx.type === 'received' ? 'green-ink' : 'red-ink';
          const displayCategory = tx.category || (tx.table ? tx.table.charAt(0).toUpperCase() + tx.table.slice(1) : 'Other');
          
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHTML(tx.date || 'Imported')}</td>
            <td><strong>${escapeHTML(tx.description || 'Transaction')}</strong></td>
            <td><span class="card-header-badge" style="cursor: default; font-size: 11px; font-family: 'Patrick Hand', cursive; font-weight: 700; padding: 2px 6px;">${escapeHTML(displayCategory)}</span></td>
            <td class="align-right ${amountColorClass}">${displayAmount}</td>
          `;
          fullTxTbody.appendChild(tr);
        });

        if (viewMoreContainer) {
          if (txList.length > 5) {
            viewMoreContainer.style.display = 'block';
            if (viewMoreBtn) {
              viewMoreBtn.textContent = isTransactionsExpanded ? 'View Less' : 'View More';
            }
          } else {
            viewMoreContainer.style.display = 'none';
          }
        }
      }
    }

    // Hide transactions overlay if logged in
    const transactionsOverlay = document.querySelector('#tab-view-transactions .preview-cta-overlay');
    if (transactionsOverlay) {
      transactionsOverlay.style.display = 'none';
    }

    const categoryTotals = {};
    let totalExpensesSum = 0;
    
    if (budgetData.bills) {
      budgetData.bills.forEach(b => {
        if (b.actual > 0) {
          categoryTotals['Bills'] = (categoryTotals['Bills'] || 0) + b.actual;
          totalExpensesSum += b.actual;
        }
      });
    }

    if (budgetData.debt) {
      budgetData.debt.forEach(d => {
        if (d.actual > 0) {
          categoryTotals['Debt / Loans'] = (categoryTotals['Debt / Loans'] || 0) + d.actual;
          totalExpensesSum += d.actual;
        }
      });
    }

    if (budgetData.expenses) {
      budgetData.expenses.forEach(e => {
        if (e.actual > 0) {
          const cat = e.category || 'Other Expenses';
          categoryTotals[cat] = (categoryTotals[cat] || 0) + e.actual;
          totalExpensesSum += e.actual;
        }
      });
    }

    if (savingsActual > 0) {
      categoryTotals['Savings'] = savingsActual;
      totalExpensesSum += savingsActual;
    }

    const colors = ['#fef08a', '#fbcfe8', '#e9d5ff', '#dcfce7', '#ffedd5', '#fed7aa', '#bfdbfe', '#c7d2fe', '#fbcfe8'];
    const patterns = ['none', 'dots', 'hatch-diagonal', 'hatch-vertical', 'hatch-cross', 'none', 'dots', 'hatch-diagonal', 'hatch-vertical'];
    
    let otherSum = 0;
    const filteredSpendingData = [];
    
    for (const [label, val] of Object.entries(categoryTotals)) {
      const pct = totalExpensesSum > 0 ? (val / totalExpensesSum) : 0;
      if (pct < 0.02) { // Aggregate categories representing less than 2%
        otherSum += val;
      } else {
        filteredSpendingData.push({ label, value: val });
      }
    }
    
    if (otherSum > 0) {
      const existingOther = filteredSpendingData.find(item => item.label.toLowerCase() === 'others' || item.label.toLowerCase() === 'other');
      if (existingOther) {
        existingOther.value += otherSum;
      } else {
        filteredSpendingData.push({ label: 'Others', value: otherSum });
      }
    }
    
    filteredSpendingData.sort((a, b) => b.value - a.value);
    
    const realSpendingData = filteredSpendingData.map((item, idx) => ({
      ...item,
      color: colors[idx % colors.length],
      pattern: patterns[idx % patterns.length]
    }));
    
    updatePieChartAndLegend(realSpendingData, totalExpensesSum);

    // Render Budget Envelopes table and status metrics
    let totalBudgetLimit = 0;
    let totalBudgetSpent = 0;
    const budgetTbody = document.getElementById('home-budget-tbody');
    
    if (budgetTbody && budgetData.expenses) {
      budgetTbody.innerHTML = '';
      budgetData.expenses.forEach(e => {
        if (e.category) {
          const limit = e.budget || 0;
          const spent = e.actual || 0;
          const remaining = limit - spent;
          
          totalBudgetLimit += limit;
          totalBudgetSpent += spent;
          
          const remainingColorClass = remaining < 0 ? 'red-ink' : 'green-ink';
          const remainingSign = remaining < 0 ? '-' : '';
          const displayRemaining = `${remainingSign}${formatCurrency(Math.abs(remaining), currencySymbol)}`;
          
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHTML(e.category)}</td>
            <td class="align-right">${formatCurrency(limit, currencySymbol)}</td>
            <td class="align-right red-ink">${formatCurrency(spent, currencySymbol)}</td>
            <td class="align-right ${remainingColorClass}">${displayRemaining}</td>
          `;
          budgetTbody.appendChild(tr);
        }
      });
    }
    
    const remainingLimit = totalBudgetLimit - totalBudgetSpent;
    const progressPercent = totalBudgetLimit > 0 ? Math.round((totalBudgetSpent / totalBudgetLimit) * 100) : 0;
    
    const budgetLimitEl = document.getElementById('home-budget-monthly-limit');
    const budgetSpentEl = document.getElementById('home-budget-total-spent');
    const budgetRemainingEl = document.getElementById('home-budget-remaining-limit');
    const budgetProgressEl = document.getElementById('home-budget-progress-percent');
    
    if (budgetLimitEl) budgetLimitEl.textContent = formatCurrency(totalBudgetLimit, currencySymbol);
    if (budgetSpentEl) budgetSpentEl.textContent = formatCurrency(totalBudgetSpent, currencySymbol);
    if (budgetRemainingEl) {
      budgetRemainingEl.textContent = `${remainingLimit < 0 ? '-' : ''}${formatCurrency(Math.abs(remainingLimit), currencySymbol)}`;
      budgetRemainingEl.className = `status-value ${remainingLimit < 0 ? 'red-ink' : 'green-ink'}`;
    }
    if (budgetProgressEl) budgetProgressEl.textContent = `${progressPercent}% Used`;
    
    // Hide guest blur overlay on budget tab
    const budgetOverlay = document.querySelector('#tab-view-budget .preview-cta-overlay');
    if (budgetOverlay) {
      budgetOverlay.style.display = 'none';
    }
    
    // Show form section
    const budgetEditor = document.getElementById('home-budget-editor-section');
    if (budgetEditor) {
      budgetEditor.style.display = 'block';
    }
    
    // Dynamically populate Category Envelope select dropdown list
    const categorySelect = document.getElementById('home-budget-category');
    if (categorySelect) {
      const selectedValue = categorySelect.value;
      categorySelect.innerHTML = '<option value="" disabled selected>Select category...</option>';
      const allCategories = new Set(defaultCategories);
      if (budgetData.expenses) {
        budgetData.expenses.forEach(e => {
          if (e.category) {
            allCategories.add(e.category);
          }
        });
      }
      allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '__CUSTOM__';
      customOpt.textContent = '+ Add Custom Category...';
      categorySelect.appendChild(customOpt);
      
      // Keep previous selection if it still exists
      if (selectedValue && [...allCategories].includes(selectedValue)) {
        categorySelect.value = selectedValue;
      }
    }

    // ── Render Goals ────────────────────────────────────────────
    renderGoalsTab(budgetData.goals || []);
    renderHomeSummaryGoals(budgetData.goals || [], currencySymbol);

    // Hide goals guest overlay
    const goalsOverlay = document.getElementById('goals-guest-overlay');
    if (goalsOverlay) goalsOverlay.style.display = 'none';

    // Show goals form + summary widget
    const goalsEditor = document.getElementById('home-goals-editor-section');
    if (goalsEditor) goalsEditor.style.display = 'block';
    const goalsSummaryCard = document.getElementById('home-goals-summary-card');
    if (goalsSummaryCard) goalsSummaryCard.style.display = 'block';

    // Hide reports guest overlay
    const reportsOverlay = document.getElementById('reports-guest-overlay');
    if (reportsOverlay) reportsOverlay.style.display = 'none';

    // Render reports tab content
    renderReportsTab(budgetData);

    // Render categories tab
    renderCategoriesTab(budgetData);

    // Hide categories guest overlay
    const categoriesOverlay = document.querySelector('#tab-view-categories .preview-cta-overlay');
    if (categoriesOverlay) {
      categoriesOverlay.style.display = 'none';
    }

    // Show categories form section
    const categoriesEditor = document.getElementById('home-categories-editor-section');
    if (categoriesEditor) {
      categoriesEditor.style.display = 'block';
    }

    // Show transactions editor section
    const txEditor = document.getElementById('home-transactions-editor-section');
    if (txEditor) {
      txEditor.style.display = 'block';
    }
    updateTransactionCategoryDropdown();

    // Dynamically populate Category select dropdown for Categories tab
    const catSelect = document.getElementById('home-cat-name');
    if (catSelect) {
      const selectedValue = catSelect.value;
      catSelect.innerHTML = '<option value="" disabled selected>Select category...</option>';
      const allCategories = new Set(defaultCategories);
      if (budgetData.expenses) {
        budgetData.expenses.forEach(e => {
          if (e.category) {
            allCategories.add(e.category);
          }
        });
      }
      allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
      const customOpt = document.createElement('option');
      customOpt.value = '__CUSTOM__';
      customOpt.textContent = '+ Add Custom Category...';
      catSelect.appendChild(customOpt);
      
      if (selectedValue && [...allCategories].includes(selectedValue)) {
        catSelect.value = selectedValue;
      }
    }

    // Hide settings guest overlay
    const settingsOverlay = document.querySelector('#tab-view-settings .preview-cta-overlay');
    if (settingsOverlay) {
      settingsOverlay.style.display = 'none';
    }

    // Update settings controls states
    updateSettingsFields(budgetData);

    // Trigger onboarding check for first-time user on landing page
    if (session && session.user) {
      const onboardingSeen = localStorage.getItem(`onboarding_seen_${session.user.id}`);
      if (!onboardingSeen) {
        showOnboardingModal();
      }
    }

  } catch (error) {
    console.error('[HOME] Error loading real budget data:', error);
  }
}

// Setup client-side tab switching
function initTabSwitching() {
  const menuItems = document.querySelectorAll('.dashboard-sidebar .menu-item');
  const headerTitle = document.getElementById('header-tab-title');
  const headerSubtitle = document.getElementById('header-tab-subtitle');

  const tabMeta = {
    home: {
      title: 'Good Morning!',
      subtitle: "Here's your financial snapshot for today."
    },
    transactions: {
      title: 'Transactions Ledger',
      subtitle: 'Preview your past daily ledger items.'
    },
    budget: {
      title: 'Budget Envelope Preview',
      subtitle: 'Preview planned vs actual category limits.'
    },
    goals: {
      title: 'Savings Milestones',
      subtitle: 'Preview milestone savings goals progress.'
    },
    reports: {
      title: 'Visual Analytics',
      subtitle: 'Preview category expenditure reports.'
    },
    categories: {
      title: 'Sticky-Note Envelopes',
      subtitle: 'Preview customizable category cards.'
    },
    settings: {
      title: 'Preference Settings',
      subtitle: 'Preview user settings configuration.'
    }
  };

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      if (!tabId) return;

      // Update active menu item
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // Update active tab view
      const tabViews = document.querySelectorAll('.dashboard-tab-view');
      tabViews.forEach(view => view.classList.remove('active'));
      const targetView = document.getElementById(`tab-view-${tabId}`);
      if (targetView) targetView.classList.add('active');

      // Update header titles
      const meta = tabMeta[tabId];
      if (meta && headerTitle && headerSubtitle) {
        headerTitle.innerHTML = `${meta.title} <span class="highlight-stroke" style="position: absolute; left: 0; bottom: 0; width: 100%; height: 8px; background-color: rgba(255, 249, 219, 0.7); z-index: -1; border-radius: 4px;"></span>`;
        headerSubtitle.textContent = meta.subtitle;
      }

      // If switching back to home, redraw the pie chart or load real data
      if (tabId === 'home') {
        if (currentSession) {
          loadRealData(currentSession);
        } else {
          initPieChart();
        }
      } else if (tabId === 'reports') {
        if (reportsDonutChartInstance) {
          try { reportsDonutChartInstance.draw(); } catch (_) {}
        }
      }
    });
  });
}

// Setup redirection for Call-To-Actions (CTAs)
function initCTAListeners() {
  // Bind any button with cta-btn or within the tab previews or quick actions
  const ctaButtons = document.querySelectorAll('.cta-btn, .preview-cta-overlay a, #home-bell-btn');
  ctaButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentSession) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/login';
      }
    });
  });

  // Bind quick action buttons to switch tabs
  const quickActionButtons = document.querySelectorAll('.quick-action-btn');
  quickActionButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        const menuItem = document.querySelector(`.dashboard-sidebar .menu-item[data-tab="${tabId}"]`);
        if (menuItem) {
          menuItem.click();
        }
      }
    });
  });
}

function initBudgetEditor() {
  const categorySelect = document.getElementById('home-budget-category');
  const limitInput = document.getElementById('home-budget-limit');
  const customCategoryWrapper = document.getElementById('home-custom-category-wrapper');
  const customCategoryInput = document.getElementById('home-budget-custom-category');
  const budgetForm = document.getElementById('home-budget-form');
  
  // Set up Sticky Note Close Button
  const stickyModal = document.getElementById('sticky-note-modal');
  const stickyCloseBtn = document.getElementById('sticky-note-close-btn');
  if (stickyModal && stickyCloseBtn) {
    stickyCloseBtn.addEventListener('click', () => {
      stickyModal.style.display = 'none';
    });
  }

  if (categorySelect && limitInput && customCategoryWrapper && customCategoryInput) {
    categorySelect.addEventListener('change', () => {
      const val = categorySelect.value;
      if (val === '__CUSTOM__') {
        customCategoryWrapper.style.display = 'flex';
        customCategoryInput.required = true;
        limitInput.value = '';
      } else {
        customCategoryWrapper.style.display = 'none';
        customCategoryInput.required = false;
        customCategoryInput.value = '';
        
        // Pre-fill existing limit target if found
        if (currentBudgetData && currentBudgetData.expenses) {
          const found = currentBudgetData.expenses.find(e => e.category === val);
          if (found) {
            limitInput.value = found.budget || 0;
          } else {
            limitInput.value = '';
          }
        }
      }
    });
  }
  
  if (budgetForm) {
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSession || !currentBudgetData) {
        showStickyNote('You must be logged in to manage budget envelopes.');
        return;
      }
      
      const categoryVal = categorySelect.value;
      let targetCategory = '';
      if (categoryVal === '__CUSTOM__') {
        targetCategory = customCategoryInput.value.trim();
      } else {
        targetCategory = categoryVal;
      }
      
      if (!targetCategory) {
        showStickyNote('Please specify a category envelope name.');
        return;
      }
      
      const limitVal = parseFloat(limitInput.value);
      if (isNaN(limitVal) || limitVal < 0) {
        showStickyNote('Please enter a valid limit target.');
        return;
      }
      
      // Update state
      if (!currentBudgetData.expenses) {
        currentBudgetData.expenses = [];
      }
      
      let found = currentBudgetData.expenses.find(item => item.category && item.category.toLowerCase() === targetCategory.toLowerCase());
      if (found) {
        found.budget = limitVal;
      } else {
        let emptySlot = currentBudgetData.expenses.find(item => !item.category);
        if (emptySlot) {
          emptySlot.category = targetCategory;
          emptySlot.budget = limitVal;
          emptySlot.actual = 0;
        } else {
          currentBudgetData.expenses.push({
            id: Date.now(),
            category: targetCategory,
            budget: limitVal,
            actual: 0
          });
        }
      }
      
      // Send the update to the backend
      try {
        const response = await fetch(`${API_BASE_URL}/api/budget`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          },
          body: JSON.stringify({
            month: currentBudgetData.settings.month.toUpperCase(),
            year: currentBudgetData.settings.year.toString(),
            data: currentBudgetData
          })
        });
        
        if (response.ok) {
          showStickyNote(`Success: Budget envelope "${targetCategory}" updated to ${currentBudgetData.settings.currency || '₹'}${formatNumber(limitVal)}!`);
          budgetForm.reset();
          if (customCategoryWrapper) {
            customCategoryWrapper.style.display = 'none';
            customCategoryInput.required = false;
          }
          loadRealData(currentSession);
        } else {
          throw new Error('Save budget envelope failed');
        }
      } catch (err) {
        console.error('[HOME BUDGET SAVE] Error:', err);
        showStickyNote('Failed to save budget envelope. Please try again.');
      }
    });
  }
}

// ============================================================
//  GOALS TAB – render goal cards
// ============================================================
function renderGoalsTab(goals) {
  const grid = document.getElementById('home-goals-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!goals || goals.length === 0) {
    grid.innerHTML = `
      <div class="goals-empty-state">
        <span class="empty-icon">🎯</span>
        No goals yet! Use the form below to add your first savings goal.
      </div>
    `;
    return;
  }

  goals.forEach((goal, idx) => {
    const target = Number(goal.target) || 1;
    const saved  = Number(goal.saved)  || 0;
    const pct    = Math.min(100, Math.round((saved / target) * 100));
    const colorClass = goal.color || 'fill-blue';
    const colorMap = {
      'fill-blue':   '#D0EBFF',
      'fill-green':  '#E3F9E5',
      'fill-pink':   '#fce7f3',
      'fill-yellow': '#fef9c3',
      'fill-purple': '#ede9fe'
    };
    const barBg = colorMap[colorClass] || '#D0EBFF';

    let motivation = '';
    if (pct >= 100)       motivation = '🎉 Reached!';
    else if (pct >= 75)   motivation = '✨ Almost there!';
    else if (pct >= 50)   motivation = '💪 Halfway point!';
    else if (pct >= 25)   motivation = '🌱 Started!';
    else                   motivation = '📌 Just beginning!';

    let dateStr = '';
    if (goal.date) {
      try {
        const d = new Date(goal.date);
        dateStr = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
      } catch (_) { dateStr = goal.date; }
    }

    const card = document.createElement('div');
    card.className = 'summary-card goal-card';
    card.style.animationDelay = `${idx * 0.06}s`;
    card.innerHTML = `
      <div class="goal-header font-handwriting" style="position: relative;">
        <h4 style="margin: 0; font-size: 18px;">${escapeHTML(goal.name)}</h4>
        <div style="display:flex; align-items:center; gap: 8px;">
          <span class="goal-amount">${formatCurrency(saved)} / ${formatCurrency(target)}</span>
          <button class="goal-delete-btn" data-idx="${idx}" title="Delete goal">✕</button>
        </div>
      </div>
      ${dateStr ? `<p class="goal-desc">Target: ${escapeHTML(dateStr)}</p>` : ''}
      <div class="sketchy-progress-outer">
        <div class="sketchy-progress-inner ${colorClass}" style="width: ${pct}%; height: 100%; background-color: ${barBg};">
          <div class="sketchy-progress-scribble" style="width:100%; height:100%;"></div>
        </div>
      </div>
      <div class="goal-footer">
        <span class="card-subtext">${pct}% Saved</span>
        <span class="card-comparison" style="color: #5C4A3A;">${motivation}</span>
      </div>
    `;

    // Wire delete
    card.querySelector('.goal-delete-btn').addEventListener('click', async () => {
      const confirmDelete = await showConfirmDialog({
        title: 'Delete Goal',
        message: `Are you sure you want to delete goal "<strong>${escapeHTML(goal.name)}</strong>"?`,
        isDestructive: true
      });
      if (!confirmDelete) return;
      if (!currentBudgetData) return;
      currentBudgetData.goals = (currentBudgetData.goals || []).filter((_, i) => i !== idx);
      await saveGoals(currentBudgetData);
      renderGoalsTab(currentBudgetData.goals);
      renderHomeSummaryGoals(currentBudgetData.goals, currentBudgetData.settings?.currency || '₹');
    });

    grid.appendChild(card);
  });
}

// ── Home Summary Widget ──────────────────────────────────────
function renderHomeSummaryGoals(goals, currencySymbol = '₹') {
  const container = document.getElementById('home-goals-summary-list');
  if (!container) return;
  container.innerHTML = '';

  if (!goals || goals.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; font-family: 'Patrick Hand', cursive; color: #7A695C; font-size: 15px;">No goals yet. Add one in the Goals tab!</div>`;
    return;
  }

  const colorMap = {
    'fill-blue':   '#D0EBFF',
    'fill-green':  '#E3F9E5',
    'fill-pink':   '#fce7f3',
    'fill-yellow': '#fef9c3',
    'fill-purple': '#ede9fe'
  };

  goals.slice(0, 4).forEach(goal => {
    const target = Number(goal.target) || 1;
    const saved  = Number(goal.saved)  || 0;
    const pct    = Math.min(100, Math.round((saved / target) * 100));
    const barBg  = colorMap[goal.color || 'fill-blue'] || '#D0EBFF';

    let dateStr = '';
    if (goal.date) {
      try {
        const d = new Date(goal.date);
        dateStr = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
      } catch (_) { dateStr = goal.date; }
    }

    const div = document.createElement('div');
    div.className = 'home-goal-mini-item';
    div.innerHTML = `
      <div class="home-goal-mini-header">
        <span class="home-goal-mini-name">${escapeHTML(goal.name)}</span>
        <span class="home-goal-mini-pct">${formatCurrency(saved, currencySymbol)} / ${formatCurrency(target, currencySymbol)} &middot; ${pct}%</span>
      </div>
      <div class="home-goal-mini-bar-outer">
        <div class="home-goal-mini-bar-inner" style="width: ${pct}%; background-color: ${barBg}; border-right: 2px solid #2B2118;"></div>
      </div>
      ${dateStr ? `<span class="home-goal-mini-date">Target: ${escapeHTML(dateStr)}</span>` : ''}
    `;
    container.appendChild(div);
  });
}

// ── Persist goals inside budget data ────────────────────────
async function saveGoals(budgetData) {
  if (!currentSession) return;
  const monthSelect = document.getElementById('home-month-select');
  const yearInput   = document.getElementById('home-year-input');
  if (!monthSelect || !yearInput) return;

  const month = monthSelect.value.toUpperCase();
  const year  = Number(yearInput.value);

  try {
    const res = await fetch(`${API_BASE_URL}/api/budget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({ month, year, data: budgetData })
    });
    if (!res.ok) throw new Error('Save goals failed');
  } catch (err) {
    console.error('[GOALS] Save error:', err);
    showStickyNote('Could not save goal. Please try again.');
  }
}

// ── Goals Editor Form ────────────────────────────────────────
function initGoalsEditor() {
  const form = document.getElementById('home-goal-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentSession) { showStickyNote('Please sign in to add goals.'); return; }
    if (!currentBudgetData) return;

    const name   = (document.getElementById('goal-name')?.value || '').trim();
    const target = Number(document.getElementById('goal-target')?.value) || 0;
    const saved  = Number(document.getElementById('goal-saved')?.value)  || 0;
    const date   = document.getElementById('goal-date')?.value  || '';
    const color  = document.getElementById('goal-color')?.value || 'fill-blue';

    if (!name || target <= 0) {
      showStickyNote('Please enter a goal name and a valid target amount.');
      return;
    }

    const btn = document.getElementById('home-goal-submit-btn');
    if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

    try {
      if (!currentBudgetData.goals) currentBudgetData.goals = [];
      currentBudgetData.goals.push({ name, target, saved, date, color });
      await saveGoals(currentBudgetData);

      // Reset form
      form.reset();
      document.getElementById('goal-saved').value = '0';

      renderGoalsTab(currentBudgetData.goals);
      renderHomeSummaryGoals(currentBudgetData.goals, currentBudgetData.settings?.currency || '₹');

      showStickyNote(`Goal "${name}" added! 🎯`);
    } catch (err) {
      console.error('[GOALS] Add error:', err);
      showStickyNote('Failed to add goal. Please try again.');
    } finally {
      if (btn) { btn.textContent = '+ Add Goal'; btn.disabled = false; }
    }
  });
}

function initHome() {
  initTheme();

  // Resize handler for visual charts
  window.addEventListener('resize', () => {
    if (homePieChartInstance) {
      try { homePieChartInstance.draw(); } catch (_) {}
    }
    if (reportsDonutChartInstance) {
      try { reportsDonutChartInstance.draw(); } catch (_) {}
    }
  });
  
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

  // Initialize month select and year input values from localStorage or current date
  const monthSelect = document.getElementById('home-month-select');
  const yearInput = document.getElementById('home-year-input');
  if (monthSelect && yearInput) {
    const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    const currentMonthIndex = new Date().getMonth();
    const currentMonth = monthNames[currentMonthIndex];
    const currentYear = new Date().getFullYear().toString();

    const activeMonth = localStorage.getItem('last_opened_month') || currentMonth;
    const activeYear = localStorage.getItem('last_opened_year') || currentYear;

    monthSelect.value = activeMonth.toUpperCase();
    yearInput.value = activeYear;

    // Listen to changes to fetch new data
    monthSelect.addEventListener('change', () => {
      if (currentSession) {
        loadRealData(currentSession);
      }
    });
    yearInput.addEventListener('change', () => {
      if (currentSession) {
        loadRealData(currentSession);
      }
    });
  }

  // Check Supabase session
  supabase.auth.getSession().then(({ data: { session } }) => {
    currentSession = session;
    updateNavbar(session);
    if (session) {
      loadRealData(session);
    } else {
      window.location.href = '/login';
    }
  }).catch(err => {
    console.warn('[AUTH] Failed to fetch session on landing load:', err);
    updateNavbar(null);
    window.location.href = '/login';
  });

  // Keep checking auth status updates
  supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    updateNavbar(session);
    if (session) {
      loadRealData(session);
    } else if (event === 'SIGNED_OUT') {
      window.location.href = '/login';
    }
  });

  // Notebook interactive preview logic
  initTabSwitching();
  initPieChart();
  initCTAListeners();
  initBudgetEditor();
  initGoalsEditor();
  initCategoriesEditor();
  initSettingsListeners();
  initTransactionEditor();

  // "View All Goals" button on Home summary widget
  const gotoGoalsBtn = document.getElementById('home-goto-goals-btn');
  if (gotoGoalsBtn) {
    gotoGoalsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Switch to the Goals tab
      const goalsMenuItem = document.querySelector('.menu-item[data-tab="goals"]');
      if (goalsMenuItem) goalsMenuItem.click();
    });
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}

function renderReportsTab(budgetData) {
  const currencySymbol = budgetData.settings?.currency || '₹';

  // 1. Calculate KPI Metrics
  let totalIncome = 0;
  if (budgetData.income) {
    budgetData.income.forEach(inc => {
      totalIncome += inc.actual || 0;
    });
  }

  let totalBillsActual = 0;
  if (budgetData.bills) {
    budgetData.bills.forEach(b => {
      totalBillsActual += b.actual || 0;
    });
  }

  let totalExpensesActual = 0;
  if (budgetData.expenses) {
    budgetData.expenses.forEach(e => {
      totalExpensesActual += e.actual || 0;
    });
  }

  let totalDebtActual = 0;
  if (budgetData.debt) {
    budgetData.debt.forEach(d => {
      totalDebtActual += d.actual || 0;
    });
  }

  const savingsActual = (budgetData.cashFlowSummary && budgetData.cashFlowSummary.savingsActual) || 0;
  const totalSpent = totalBillsActual + totalExpensesActual + totalDebtActual;
  const totalOutflow = totalSpent + savingsActual;

  const savingsRate = totalIncome > 0 ? Math.round((savingsActual / totalIncome) * 100) : 0;

  // Aggregate Category spending
  const categorySpent = {};
  if (budgetData.expenses) {
    budgetData.expenses.forEach(e => {
      if (e.category && e.actual > 0) {
        categorySpent[e.category] = (categorySpent[e.category] || 0) + e.actual;
      }
    });
  }
  if (budgetData.bills) {
    budgetData.bills.forEach(b => {
      if (b.actual > 0) {
        categorySpent['Bills'] = (categorySpent['Bills'] || 0) + b.actual;
      }
    });
  }
  if (budgetData.debt) {
    budgetData.debt.forEach(d => {
      if (d.actual > 0) {
        categorySpent['Debt / Loans'] = (categorySpent['Debt / Loans'] || 0) + d.actual;
      }
    });
  }
  if (savingsActual > 0) {
    categorySpent['Savings'] = (categorySpent['Savings'] || 0) + savingsActual;
  }

  // Find Top Category
  let topCategory = '—';
  let topAmount = 0;
  for (const [cat, amt] of Object.entries(categorySpent)) {
    if (amt > topAmount) {
      topCategory = cat;
      topAmount = amt;
    }
  }

  const displayTopCategory = topAmount > 0 ? `${escapeHTML(topCategory)} (${formatCurrency(topAmount, currencySymbol)})` : '—';

  // Render KPI values
  const rptIncomeEl = document.getElementById('rpt-total-income');
  const rptSpentEl = document.getElementById('rpt-total-spent');
  const rptSavingsRateEl = document.getElementById('rpt-savings-rate');
  const rptTopCategoryEl = document.getElementById('rpt-top-category');

  if (rptIncomeEl) rptIncomeEl.textContent = formatCurrency(totalIncome, currencySymbol);
  if (rptSpentEl) rptSpentEl.textContent = formatCurrency(totalSpent, currencySymbol);
  if (rptSavingsRateEl) rptSavingsRateEl.textContent = `${savingsRate}%`;
  if (rptTopCategoryEl) {
    rptTopCategoryEl.textContent = displayTopCategory;
    rptTopCategoryEl.title = displayTopCategory;
  }

  // 2. Category Spending Breakdown Vertical Bar Chart
  const barChartContainer = document.getElementById('rpt-bar-chart-container');
  if (barChartContainer) {
    barChartContainer.innerHTML = '';
    const chartCategories = Object.entries(categorySpent)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]);

    if (chartCategories.length === 0) {
      barChartContainer.innerHTML = `<div class="rpt-empty-state">No spending data for this month yet.</div>`;
    } else {
      const maxVal = Math.max(...chartCategories.map(c => c[1]), 1);
      const colors = ['#fef08a', '#fbcfe8', '#ede9fe', '#dcfce7', '#ffedd5', '#fed7aa', '#bfdbfe', '#c7d2fe', '#fbcfe8'];
      
      chartCategories.forEach(([cat, value], idx) => {
        const heightPct = Math.min(100, Math.round((value / maxVal) * 100));
        const color = colors[idx % colors.length];
        
        const barItem = document.createElement('div');
        barItem.className = 'rpt-bar-item';
        barItem.innerHTML = `
          <div class="rpt-bar-value">${formatCurrency(value, currencySymbol)}</div>
          <div class="rpt-bar-inner" style="height: ${heightPct}%; background-color: ${color};"></div>
          <div class="rpt-bar-label" title="${escapeHTML(cat)}">${escapeHTML(cat)}</div>
        `;
        barChartContainer.appendChild(barItem);
      });
    }
  }

  // 3. Budget vs. Actual horizontal progress bars
  const budgetVsActualContainer = document.getElementById('rpt-budget-vs-actual');
  if (budgetVsActualContainer) {
    budgetVsActualContainer.innerHTML = '';
    
    const activeEnvelopes = (budgetData.expenses || []).filter(e => e.category && (e.budget > 0 || e.actual > 0));
    
    if (activeEnvelopes.length === 0) {
      budgetVsActualContainer.innerHTML = `<div class="rpt-empty-state">No budget envelopes set up yet.</div>`;
    } else {
      activeEnvelopes.forEach(e => {
        const budgetVal = e.budget || 0;
        const actualVal = e.actual || 0;
        const remainingVal = budgetVal - actualVal;
        
        const pct = budgetVal > 0 ? Math.min(100, Math.round((actualVal / budgetVal) * 100)) : (actualVal > 0 ? 100 : 0);
        const isOver = remainingVal < 0;
        
        const barColor = isOver ? '#ff85a2' : '#dcfce7';
        const textClass = isOver ? 'red-ink' : 'green-ink';
        
        let statusText = '';
        if (budgetVal === 0) {
          statusText = `Spent ${formatCurrency(actualVal, currencySymbol)} (No budget limit set)`;
        } else if (isOver) {
          statusText = `${formatCurrency(actualVal, currencySymbol)} spent of ${formatCurrency(budgetVal, currencySymbol)} budget (${formatCurrency(Math.abs(remainingVal), currencySymbol)} over)`;
        } else {
          statusText = `${formatCurrency(actualVal, currencySymbol)} spent of ${formatCurrency(budgetVal, currencySymbol)} budget (${formatCurrency(remainingVal, currencySymbol)} remaining)`;
        }
        
        const budgetItem = document.createElement('div');
        budgetItem.className = 'rpt-budget-item';
        budgetItem.innerHTML = `
          <div class="rpt-budget-header">
            <span>${escapeHTML(e.category)}</span>
            <span class="${textClass}">${statusText}</span>
          </div>
          <div class="rpt-budget-bar-outer">
            <div class="rpt-budget-bar-inner" style="width: ${pct}%; background-color: ${barColor};"></div>
          </div>
        `;
        budgetVsActualContainer.appendChild(budgetItem);
      });
    }
  }

  // 4. Spending distribution donut chart (by Type)
  const donutWrap = document.getElementById('rpt-donut-wrap');
  const donutLegend = document.getElementById('rpt-donut-legend');
  
  if (donutWrap && donutLegend) {
    donutWrap.innerHTML = '';
    donutLegend.innerHTML = '';
    
    const typeData = [];
    if (totalExpensesActual > 0) typeData.push({ label: 'Expenses', value: totalExpensesActual, color: '#ffccd5', pattern: 'dots' });
    if (totalBillsActual > 0) typeData.push({ label: 'Bills', value: totalBillsActual, color: '#ede9fe', pattern: 'hatch-diagonal' });
    if (totalDebtActual > 0) typeData.push({ label: 'Debt', value: totalDebtActual, color: '#fef9c3', pattern: 'hatch-cross' });
    if (savingsActual > 0) typeData.push({ label: 'Savings', value: savingsActual, color: '#dcfce7', pattern: 'cash' });
    
    if (typeData.length === 0) {
      donutWrap.innerHTML = `<div class="rpt-empty-state">No data yet.</div>`;
      reportsDonutChartInstance = null;
    } else {
      // Create canvas dynamically
      const canvas = document.createElement('canvas');
      canvas.id = 'rpt-donut-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '180px';
      canvas.style.display = 'block';
      donutWrap.appendChild(canvas);
      
      try {
        const chart = new HandDrawnPieChart(canvas, typeData);
        reportsDonutChartInstance = chart;
        chart.draw();
      } catch (err) {
        console.error('[REPORTS] Donut chart draw error:', err);
      }
      
      // Render Legend
      typeData.forEach(item => {
        const pct = totalOutflow > 0 ? Math.round((item.value / totalOutflow) * 100) : 0;
        const legendItem = document.createElement('div');
        legendItem.className = 'rpt-donut-legend-item';
        legendItem.innerHTML = `
          <div>
            <span class="rpt-donut-color-box" style="background-color: ${item.color};"></span>
            <span>${escapeHTML(item.label)}</span>
          </div>
          <strong>${formatCurrency(item.value, currencySymbol)} (${pct}%)</strong>
        `;
        donutLegend.appendChild(legendItem);
      });
    }
  }

  // 5. Smart Recommendations List
  const suggestionsList = document.getElementById('rpt-suggestions-list');
  if (suggestionsList) {
    suggestionsList.innerHTML = '';
    const tips = [];
    
    // Overspending alerts
    if (budgetData.expenses) {
      budgetData.expenses.forEach(e => {
        if (e.category && e.budget > 0 && e.actual > e.budget) {
          const diff = e.actual - e.budget;
          tips.push({
            icon: '⚠️',
            title: `Budget Exceeded for ${escapeHTML(e.category)}`,
            text: `You spent ${formatCurrency(e.actual, currencySymbol)} which exceeds your ${formatCurrency(e.budget, currencySymbol)} limit by ${formatCurrency(diff, currencySymbol)}. Try pausing non-essential spending here.`
          });
        }
      });
    }
    
    // Savings rate feedback
    if (totalIncome > 0) {
      if (savingsRate >= 20) {
        tips.push({
          icon: '🎉',
          title: 'Strong Savings Rate!',
          text: `You're currently saving ${savingsRate}% of your income. That's a healthy financial buffer that keeps you on track for your long-term goals.`
        });
      } else if (savingsRate > 0) {
        tips.push({
          icon: '💡',
          title: 'Optimize Savings Potential',
          text: `You're saving ${savingsRate}% of your income. Increasing this to the recommended 20% mark by cutting small discretionary expenses could significantly speed up your goals.`
        });
      } else {
        tips.push({
          icon: '📌',
          title: 'Pay Yourself First',
          text: 'No savings recorded this month. Try automated transfers to savings immediately when your income is received, even if it is just 5% to start.'
        });
      }
    }
    
    // Top Expense Category optimization
    if (topAmount > 0 && topCategory !== 'Savings') {
      const pct = totalSpent > 0 ? Math.round((topAmount / totalSpent) * 100) : 0;
      if (pct > 25) {
        tips.push({
          icon: '🔍',
          title: `Analyze Top Category: ${escapeHTML(topCategory)}`,
          text: `Your biggest expenditure is on ${escapeHTML(topCategory)} at ${formatCurrency(topAmount, currencySymbol)} (${pct}% of total spent). Take a close look to see if this can be optimized.`
        });
      }
    }
    
    // Unallocated leftover income (Zero-based budgeting)
    const leftover = totalIncome - totalOutflow;
    if (leftover > 0) {
      tips.push({
        icon: '✏️',
        title: 'Allocate Leftover Income',
        text: `You have ${formatCurrency(leftover, currencySymbol)} unallocated. To practice zero-based budgeting, assign this amount to additional savings, debt payoff, or goal milestones.`
      });
    }
    
    // Debt burden warning
    if (totalDebtActual > 0 && totalIncome > 0) {
      const debtPct = Math.round((totalDebtActual / totalIncome) * 100);
      if (debtPct > 30) {
        tips.push({
          icon: '⚠️',
          title: 'High Debt Burden',
          text: `Debt payments consume ${debtPct}% of your monthly income. Keeping this ratio below 30% helps ensure you have enough cash flow for savings and emergencies.`
        });
      }
    }

    if (tips.length === 0) {
      suggestionsList.innerHTML = `<div class="rpt-empty-state">Add transactions or budgets to generate suggestions.</div>`;
    } else {
      tips.forEach(tip => {
        const div = document.createElement('div');
        div.className = 'rpt-suggestion-item';
        div.innerHTML = `
          <div class="rpt-suggestion-icon">${tip.icon}</div>
          <div class="rpt-suggestion-content">
            <div class="rpt-suggestion-title">${tip.title}</div>
            <p class="rpt-suggestion-text">${tip.text}</p>
          </div>
        `;
        suggestionsList.appendChild(div);
      });
    }
  }
}

// ── Categories Tab ──────────────────────────────────────────
function renderCategoriesTab(budgetData) {
  const container = document.getElementById('home-sticky-notes-container');
  if (!container) return;
  container.innerHTML = '';

  const expenses = budgetData.expenses || [];
  const currencySymbol = budgetData.settings?.currency || '₹';

  const defaultColors = ['note-pink', 'note-green', 'note-blue', 'note-yellow', 'note-purple'];

  if (expenses.length === 0) {
    container.innerHTML = `
      <div style="font-family: 'Patrick Hand', cursive; color: #7A695C; font-size: 16px; padding: 24px; text-align: center; width: 100%;">
        No categories found. Add one below to see your cozy envelope sticky notes!
      </div>
    `;
    return;
  }

  expenses.forEach((e, idx) => {
    if (!e.category) return;

    const limit = e.budget || 0;
    const spent = e.actual || 0;
    const colorClass = e.color || defaultColors[idx % defaultColors.length];
    const desc = e.description || '';

    // Calculate rotation and style nicely like hand-drawn sticky notes
    const rotation = idx % 2 === 0 ? -1.5 + (idx % 3) * 0.5 : 1.5 - (idx % 3) * 0.5;

    const note = document.createElement('div');
    note.className = `sticky-note ${colorClass}`;
    note.style.transform = `rotate(${rotation}deg)`;
    note.style.margin = '8px';
    note.style.width = '160px';
    note.style.minHeight = '160px';
    note.style.padding = '18px';

    note.innerHTML = `
      <div class="sticky-tape"></div>
      <div class="note-content">
        <h3 class="note-title" style="font-size: 18px; margin: 0 0 4px 0; font-family: 'CabinSketch', cursive; font-weight: 700;">${escapeHTML(e.category)}</h3>
        <p class="note-amount" style="font-size: 16px; margin: 0 0 8px 0; font-family: 'Caveat', cursive; color: #5c4a3a; font-weight: 700;">
          Limit: ${formatCurrency(limit, currencySymbol)}<br>
          <span style="font-size: 14px; color: ${spent > limit ? '#c62828' : '#2e7d32'}; font-family: 'Patrick Hand', cursive;">
            Spent: ${formatCurrency(spent, currencySymbol)}
          </span>
        </p>
        ${desc ? `<p class="note-body" style="font-size: 13px; line-height: 1.2; margin: 0; color: #555;">${escapeHTML(desc)}</p>` : ''}
      </div>
    `;
    container.appendChild(note);
  });
}

function initCategoriesEditor() {
  const categorySelect = document.getElementById('home-cat-name');
  const limitInput = document.getElementById('home-cat-limit');
  const customCategoryWrapper = document.getElementById('home-cat-custom-wrapper');
  const customCategoryInput = document.getElementById('home-cat-custom-name');
  const colorSelect = document.getElementById('home-cat-color');
  const descriptionInput = document.getElementById('home-cat-description');
  const categoriesForm = document.getElementById('home-categories-form');

  if (categorySelect && limitInput && customCategoryWrapper && customCategoryInput) {
    categorySelect.addEventListener('change', () => {
      const val = categorySelect.value;
      if (val === '__CUSTOM__') {
        customCategoryWrapper.style.display = 'flex';
        customCategoryInput.required = true;
        limitInput.value = '';
        if (descriptionInput) descriptionInput.value = '';
      } else {
        customCategoryWrapper.style.display = 'none';
        customCategoryInput.required = false;
        customCategoryInput.value = '';
        
        // Pre-fill existing limit target & description if found
        if (currentBudgetData && currentBudgetData.expenses) {
          const found = currentBudgetData.expenses.find(e => e.category === val);
          if (found) {
            limitInput.value = found.budget || 0;
            if (descriptionInput) descriptionInput.value = found.description || '';
            if (colorSelect) colorSelect.value = found.color || 'note-pink';
          } else {
            limitInput.value = '';
            if (descriptionInput) descriptionInput.value = '';
            if (colorSelect) colorSelect.value = 'note-pink';
          }
        }
      }
    });
  }

  if (categoriesForm) {
    categoriesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSession || !currentBudgetData) {
        showStickyNote('You must be logged in to manage category envelopes.');
        return;
      }

      const categoryVal = categorySelect.value;
      let targetCategory = '';
      if (categoryVal === '__CUSTOM__') {
        targetCategory = customCategoryInput.value.trim();
      } else {
        targetCategory = categoryVal;
      }

      if (!targetCategory) {
        showStickyNote('Please specify a category envelope name.');
        return;
      }

      const limitVal = parseFloat(limitInput.value);
      if (isNaN(limitVal) || limitVal < 0) {
        showStickyNote('Please enter a valid limit target.');
        return;
      }

      const colorVal = colorSelect?.value || 'note-pink';
      const descVal = descriptionInput?.value.trim() || '';

      // Update state
      if (!currentBudgetData.expenses) {
        currentBudgetData.expenses = [];
      }

      let found = currentBudgetData.expenses.find(item => item.category && item.category.toLowerCase() === targetCategory.toLowerCase());
      if (found) {
        found.budget = limitVal;
        found.color = colorVal;
        found.description = descVal;
      } else {
        let emptySlot = currentBudgetData.expenses.find(item => !item.category);
        if (emptySlot) {
          emptySlot.category = targetCategory;
          emptySlot.budget = limitVal;
          emptySlot.actual = 0;
          emptySlot.color = colorVal;
          emptySlot.description = descVal;
        } else {
          currentBudgetData.expenses.push({
            id: Date.now(),
            category: targetCategory,
            budget: limitVal,
            actual: 0,
            color: colorVal,
            description: descVal
          });
        }
      }

      // Send the update to the backend
      try {
        const response = await fetch(`${API_BASE_URL}/api/budget`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          },
          body: JSON.stringify({
            month: currentBudgetData.settings.month.toUpperCase(),
            year: currentBudgetData.settings.year.toString(),
            data: currentBudgetData
          })
        });

        if (response.ok) {
          showStickyNote(`Success: Envelope "${targetCategory}" saved! ✉️`);
          categoriesForm.reset();
          if (customCategoryWrapper) {
            customCategoryWrapper.style.display = 'none';
            customCategoryInput.required = false;
          }
          loadRealData(currentSession);
        } else {
          throw new Error('Save budget envelope failed');
        }
      } catch (err) {
        console.error('[HOME CATEGORIES SAVE] Error:', err);
        showStickyNote('Failed to save category envelope. Please try again.');
      }
    });
  }
}

// ── Settings Tab ─────────────────────────────────────────────
function updateSettingsFields(budgetData) {
  const isDark = document.body.classList.contains('dark-mode');
  const lightBtn = document.getElementById('settings-theme-light');
  const darkBtn = document.getElementById('settings-theme-dark');
  
  if (lightBtn && darkBtn) {
    if (isDark) {
      lightBtn.classList.remove('btn-primary-sketch');
      lightBtn.classList.add('btn-secondary-sketch');
      darkBtn.classList.remove('btn-secondary-sketch');
      darkBtn.classList.add('btn-primary-sketch');
    } else {
      lightBtn.classList.remove('btn-secondary-sketch');
      lightBtn.classList.add('btn-primary-sketch');
      darkBtn.classList.remove('btn-primary-sketch');
      darkBtn.classList.add('btn-secondary-sketch');
    }
  }

  const currencySelect = document.getElementById('settings-currency');
  if (currencySelect) {
    currencySelect.value = budgetData.settings?.currency || '₹';
  }
}

function initSettingsListeners() {
  const lightBtn = document.getElementById('settings-theme-light');
  const darkBtn = document.getElementById('settings-theme-dark');
  const currencySelect = document.getElementById('settings-currency');

  if (lightBtn && darkBtn) {
    lightBtn.addEventListener('click', () => {
      if (document.body.classList.contains('dark-mode')) {
        toggleTheme();
        if (currentBudgetData) updateSettingsFields(currentBudgetData);
      }
    });

    darkBtn.addEventListener('click', () => {
      if (!document.body.classList.contains('dark-mode')) {
        toggleTheme();
        if (currentBudgetData) updateSettingsFields(currentBudgetData);
      }
    });
  }

  if (currencySelect) {
    currencySelect.addEventListener('change', async () => {
      if (!currentSession || !currentBudgetData) {
        showStickyNote('You must be logged in to modify settings.');
        return;
      }

      const newCurrency = currencySelect.value;
      if (!currentBudgetData.settings) {
        currentBudgetData.settings = {};
      }
      
      currentBudgetData.settings.currency = newCurrency;

      // Save updated settings to backend
      try {
        const response = await fetch(`${API_BASE_URL}/api/budget`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          },
          body: JSON.stringify({
            month: currentBudgetData.settings.month.toUpperCase(),
            year: currentBudgetData.settings.year.toString(),
            data: currentBudgetData
          })
        });

        if (response.ok) {
          showStickyNote(`Currency changed to ${newCurrency}!`);
          loadRealData(currentSession);
        } else {
          throw new Error('Save settings failed');
        }
      } catch (err) {
        console.error('[HOME SETTINGS SAVE] Error:', err);
        showStickyNote('Failed to save preferred currency.');
      }
    });
  }
}

// ── Transactions Editor ──────────────────────────────────────
function updateTransactionCategoryDropdown() {
  const typeSelect = document.getElementById('home-tx-type');
  const catSelect = document.getElementById('home-tx-category');
  if (!typeSelect || !catSelect) return;

  const type = typeSelect.value;
  catSelect.innerHTML = '';

  let options = [];
  if (type === 'expense') {
    const expenseCats = new Set();
    if (currentBudgetData && currentBudgetData.expenses) {
      currentBudgetData.expenses.forEach(e => {
        if (e.category) expenseCats.add(e.category);
      });
    }
    defaultCategories.forEach(c => expenseCats.add(c));
    options = Array.from(expenseCats);
  } else if (type === 'income') {
    const incomeCats = new Set(['Income', 'Paycheck', 'Side Hustle']);
    if (currentBudgetData && currentBudgetData.income) {
      currentBudgetData.income.forEach(i => {
        if (i.description) incomeCats.add(i.description);
      });
    }
    options = Array.from(incomeCats);
  } else if (type === 'bill') {
    const billCats = new Set(['Bills']);
    if (currentBudgetData && currentBudgetData.bills) {
      currentBudgetData.bills.forEach(b => {
        if (b.description) billCats.add(b.description);
      });
    }
    options = Array.from(billCats);
  } else if (type === 'debt') {
    const debtCats = new Set(['Debt / Loans']);
    if (currentBudgetData && currentBudgetData.debt) {
      currentBudgetData.debt.forEach(d => {
        if (d.description) debtCats.add(d.description);
      });
    }
    options = Array.from(debtCats);
  }

  options.forEach(optVal => {
    const opt = document.createElement('option');
    opt.value = optVal;
    opt.textContent = optVal;
    catSelect.appendChild(opt);
  });
}

function initTransactionEditor() {
  const typeSelect = document.getElementById('home-tx-type');
  const txForm = document.getElementById('home-transaction-form');
  const dateInput = document.getElementById('home-tx-date');

  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', updateTransactionCategoryDropdown);
  }

  const viewMoreBtn = document.getElementById('home-tx-view-more-btn');
  if (viewMoreBtn) {
    viewMoreBtn.addEventListener('click', () => {
      isTransactionsExpanded = !isTransactionsExpanded;
      if (currentSession) {
        loadRealData(currentSession);
      }
    });
  }

  if (txForm) {
    txForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSession || !currentBudgetData) {
        showStickyNote('You must be logged in to add a transaction.');
        return;
      }

      const descInput = document.getElementById('home-tx-desc');
      const catInput = document.getElementById('home-tx-category');
      const amountInput = document.getElementById('home-tx-amount');

      if (!dateInput || !descInput || !typeSelect || !catInput || !amountInput) return;

      const dateVal = dateInput.value;
      const descVal = descInput.value.trim();
      const typeVal = typeSelect.value;
      const catVal = catInput.value;
      const amountVal = parseFloat(amountInput.value);

      if (!dateVal || !descVal || isNaN(amountVal) || amountVal <= 0) {
        showStickyNote('Please enter valid transaction details.');
        return;
      }

      const dateObj = new Date(dateVal);
      const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formattedDate = `${dateObj.getDate()} ${monthNamesShort[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

      const newTx = {
        id: Date.now().toString(),
        date: formattedDate,
        description: descVal,
        category: catVal,
        amount: amountVal,
        type: typeVal === 'income' ? 'received' : 'sent',
        table: typeVal
      };

      if (!currentBudgetData.settings) currentBudgetData.settings = {};
      if (!currentBudgetData.settings.importedStatements) {
        currentBudgetData.settings.importedStatements = [];
      }

      let manualStmt = currentBudgetData.settings.importedStatements.find(s => s.filename === "Manual Transactions");
      if (!manualStmt) {
        manualStmt = {
          id: "manual_stmt_" + Date.now(),
          filename: "Manual Transactions",
          transactions: []
        };
        currentBudgetData.settings.importedStatements.push(manualStmt);
      }
      manualStmt.transactions.push(newTx);

      if (typeVal === 'income') {
        let incRow = currentBudgetData.income.find(i => i.description === catVal);
        if (!incRow) {
          incRow = currentBudgetData.income.find(i => i.description === '');
        }
        if (incRow) {
          incRow.description = catVal;
          incRow.actual = (incRow.actual || 0) + amountVal;
        } else {
          currentBudgetData.income.push({
            id: Date.now(),
            description: catVal,
            expected: 0,
            actual: amountVal
          });
        }
      } else if (typeVal === 'bill') {
        let billRow = currentBudgetData.bills.find(b => b.description === catVal);
        if (!billRow) {
          billRow = currentBudgetData.bills.find(b => b.description === '');
        }
        if (billRow) {
          billRow.description = catVal;
          billRow.actual = (billRow.actual || 0) + amountVal;
          billRow.checked = true;
        } else {
          currentBudgetData.bills.push({
            id: Date.now(),
            checked: true,
            description: catVal,
            dueDate: formattedDate,
            budget: 0,
            actual: amountVal
          });
        }
      } else if (typeVal === 'debt') {
        let debtRow = currentBudgetData.debt.find(d => d.description === catVal);
        if (!debtRow) {
          debtRow = currentBudgetData.debt.find(d => d.description === '');
        }
        if (debtRow) {
          debtRow.description = catVal;
          debtRow.actual = (debtRow.actual || 0) + amountVal;
        } else {
          currentBudgetData.debt.push({
            id: Date.now(),
            description: catVal,
            dueDate: formattedDate,
            budget: 0,
            actual: amountVal
          });
        }
      } else if (typeVal === 'expense') {
        let expRow = currentBudgetData.expenses.find(e => e.category && e.category.toLowerCase() === catVal.toLowerCase());
        if (!expRow) {
          expRow = currentBudgetData.expenses.find(e => !e.category);
        }
        if (expRow) {
          expRow.category = catVal;
          expRow.actual = (expRow.actual || 0) + amountVal;
        } else {
          currentBudgetData.expenses.push({
            id: Date.now(),
            category: catVal,
            budget: 0,
            actual: amountVal
          });
        }
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/budget`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          },
          body: JSON.stringify({
            month: currentBudgetData.settings.month.toUpperCase(),
            year: currentBudgetData.settings.year.toString(),
            data: currentBudgetData
          })
        });

        if (response.ok) {
          showStickyNote('Success: Transaction added successfully!');
          descInput.value = '';
          amountInput.value = '';
          loadRealData(currentSession);
        } else {
          throw new Error('Save transaction failed');
        }
      } catch (err) {
        console.error('[HOME ADD TRANSACTION SAVE] Error:', err);
        showStickyNote('Failed to add transaction. Please try again.');
      }
    });
  }
}
