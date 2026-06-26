import './style.css';
import './journal.css';
import { supabase } from './supabase.js';
import { HandDrawnPieChart } from './hand-drawn-chart.js';

let currentSession = null;
let currentBudgetData = null;
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

// Render Home spending pie chart
function initPieChart() {
  const canvas = document.getElementById('home-spending-pie-canvas');
  if (!canvas) return;

  const spendingData = [
    { label: 'Rent / Living', value: 19125, color: '#fef08a', pattern: 'none' },
    { label: 'Food & Groceries', value: 10625, color: '#fbcfe8', pattern: 'dots' },
    { label: 'Bills & Utilities', value: 6375, color: '#e9d5ff', pattern: 'hatch-diagonal' },
    { label: 'Transport', value: 4250, color: '#dcfce7', pattern: 'hatch-vertical' },
    { label: 'Others', value: 2125, color: '#ffedd5', pattern: 'hatch-cross' }
  ];

  try {
    const chart = new HandDrawnPieChart(canvas, spendingData);
    chart.draw();
    
    // Redraw on window resize to keep it crisp
    window.addEventListener('resize', () => {
      chart.draw();
    });
  } catch (e) {
    console.error('[CHART] Error rendering home spending pie chart:', e);
  }
}

function updatePieChartAndLegend(spendingData, totalSum) {
  const canvas = document.getElementById('home-spending-pie-canvas');
  if (!canvas) return;

  try {
    const chart = new HandDrawnPieChart(canvas, spendingData.length > 0 ? spendingData : [{ label: 'No expenses', value: 1, color: '#f3f4f6', pattern: 'none' }]);
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
      } else {
        txList.forEach(tx => {
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

    const realSpendingData = [];
    const colors = ['#fef08a', '#fbcfe8', '#e9d5ff', '#dcfce7', '#ffedd5', '#fed7aa', '#bfdbfe', '#c7d2fe', '#fbcfe8'];
    const patterns = ['none', 'dots', 'hatch-diagonal', 'hatch-vertical', 'hatch-cross', 'none', 'dots', 'hatch-diagonal', 'hatch-vertical'];
    
    let colorIdx = 0;
    for (const [label, val] of Object.entries(categoryTotals)) {
      realSpendingData.push({
        label,
        value: val,
        color: colors[colorIdx % colors.length],
        pattern: patterns[colorIdx % patterns.length]
      });
      colorIdx++;
    }

    realSpendingData.sort((a, b) => b.value - a.value);
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
      }
    });
  });
}

// Setup redirection for Call-To-Actions (CTAs)
function initCTAListeners() {
  // Bind any button with cta-btn or within the tab previews or quick actions
  const ctaButtons = document.querySelectorAll('.cta-btn, .quick-action-btn, .preview-cta-overlay a, #home-bell-btn');
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
    }
  }).catch(err => {
    console.warn('[AUTH] Failed to fetch session on landing load:', err);
    updateNavbar(null);
  });

  // Keep checking auth status updates
  supabase.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    updateNavbar(session);
    if (session) {
      loadRealData(session);
    }
  });

  // Notebook interactive preview logic
  initTabSwitching();
  initPieChart();
  initCTAListeners();
  initBudgetEditor();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}
