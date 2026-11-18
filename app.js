
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const money = n =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(n) || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

const SUPABASE_URL = 'https://ioipssucsxkfbzlgblif.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JDul63-lWA2ut4dGnRQwng_ghSxA1E7';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let invoices = [];
let activeInvoiceId = null;
let toastTimer;
let currentUser = null;
let authMode = 'signup';
let currentProfile = null;

// ------------------------------
// General helpers
// ------------------------------

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function formatDate(d) {
  if (!d) return '—';

  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function total(inv) {
  return Number(inv.total) || 0;
}

function invoiceStatus(inv) {
  if (inv.status === 'paid' || inv.status === 'Paid') return 'Paid';

  if (inv.dueDate && inv.dueDate < todayISO()) return 'Overdue';

  return 'Pending';
}

function statusBadge(status) {
  const cls =
    status === 'Paid' ? 'status-paid' :
    status === 'Overdue' ? 'status-late' :
    'status-pending';

  return `<span class="status ${cls}">${status}</span>`;
}

function empty(label, sub) {
  return `<div class="empty-state"><strong>${label}</strong>${sub}</div>`;
}

// ------------------------------
// Authentication
// ------------------------------

function showAuthMessage(message, type = '') {
  const el = $('#auth-message');

  el.textContent = message;
  el.className = 'auth-message';

  if (type) el.classList.add(type);
}

function setAuthMode(mode) {
  authMode = mode;

  const isSignup = mode === 'signup';

  $('#auth-title').textContent = isSignup
    ? 'Create your account'
    : 'Welcome back';

  $('#auth-description').textContent = isSignup
    ? 'Set up your secure workspace to manage invoices and payments.'
    : 'Log in to access your Nudge workspace.';

  $('#auth-submit').textContent = isSignup
    ? 'Create account'
    : 'Log in';

  $('#auth-switch-prompt').textContent = isSignup
    ? 'Already have an account?'
    : "Don't have an account?";

  $('#auth-switch').textContent = isSignup
    ? 'Log in'
    : 'Create account';

  $('#auth-name-field').classList.toggle('hidden', !isSignup);
  $('#auth-business-field').classList.toggle('hidden', !isSignup);

  $('#auth-password').autocomplete = isSignup
    ? 'new-password'
    : 'current-password';

  showAuthMessage('');
}

function showAuthScreen() {
  $('#workspace-area').classList.add('hidden');
  $('#auth-screen').classList.remove('hidden');
  setAuthMode('signup');
}

async function ensureProfile(user) {
  const metadata = user.user_metadata || {};

  const profile = {
    id: user.id,
    owner_name: metadata.owner_name || user.email?.split('@')[0] || '',
    business_name: metadata.business_name || '',
    email: user.email || ''
  };

  const { error } = await supabaseClient
    .from('profiles')
    .upsert(profile, { onConflict: 'id' });

  if (error) throw error;

  const { data, error: readError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (readError) throw readError;

  currentProfile = data;
}

async function handleAuthSubmit(e) {
  e.preventDefault();

  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;

  const submitButton = $('#auth-submit');

  submitButton.disabled = true;
  submitButton.textContent = 'Please wait...';
  showAuthMessage('');

  try {
    if (authMode === 'signup') {
      const ownerName = $('#auth-name').value.trim();
      const businessName = $('#auth-business').value.trim();

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            owner_name: ownerName,
            business_name: businessName
          }
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        currentUser = data.user;
        await ensureProfile(data.user);
        await enterWorkspace();
        showToast('Your Nudge account is ready.');
      } else {
        showAuthMessage(
          'Account created. Please check your email and confirm your address. Then log in here.',
          'success'
        );

        setAuthMode('login');
        $('#auth-email').value = email;
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      currentUser = data.user;
      await ensureProfile(data.user);
      await enterWorkspace();
      showToast('Welcome back to Nudge.');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    showAuthMessage(error.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = authMode === 'signup'
      ? 'Create account'
      : 'Log in';
  }
}

async function handleSignOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showToast(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  invoices = [];

  showAuthScreen();
  openWorkspace();
  showToast('You have signed out.');
}

async function enterWorkspace() {
  if (!currentUser) return;

  $('#auth-screen').classList.add('hidden');
  $('#workspace-area').classList.remove('hidden');
  $('#sign-out').classList.remove('hidden');

  const name =
    currentProfile?.owner_name ||
    currentUser.email?.split('@')[0] ||
    'Your workspace';

  $('#workspace-user-name').textContent = name;
  $('#workspace-user-email').textContent = currentUser.email || '';
  $('#user-avatar').textContent = name.slice(0, 2).toUpperCase();
  $('#account-label').textContent = 'SECURE WORKSPACE';

  if (currentProfile?.business_name) {
    $('#business-name').value = currentProfile.business_name;
  }

  await loadInvoices();
  showView('overview');
}

// ------------------------------
// Workspace navigation
// ------------------------------

function openWorkspace(view = 'overview') {
  $('#app-shell').classList.add('open');
  $('#app-shell').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (currentUser) {
    $('#auth-screen').classList.add('hidden');
    $('#workspace-area').classList.remove('hidden');
    showView(view);
  } else {
    showAuthScreen();
  }
}

function closeWorkspace() {
  $('#app-shell').classList.remove('open');
  $('#app-shell').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showView(view) {
  $$('.view').forEach(v => v.classList.add('hidden'));

  const selected = $('#view-' + view);
  if (!selected) return;

  selected.classList.remove('hidden');

  $$('.side-link').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  $('#workspace-title').textContent = ({
    overview: 'Overview',
    invoices: 'Invoices',
    clients: 'Clients'
  })[view] || 'Overview';

  renderWorkspace();
}

// ------------------------------
// Supabase invoice data
// ------------------------------

async function loadInvoices() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from('invoices')
    .select('*, customers(*), invoice_items(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Invoice loading error:', error);
    showToast('Could not load invoices: ' + error.message);
    return;
  }

  invoices = (data || []).map(row => {
    const customer = row.customers || {};

    const items = (row.invoice_items || []).map(item => ({
      id: item.id,
      description: item.description,
      qty: Number(item.quantity),
      rate: Number(item.unit_price)
    }));

    return {
      id: row.id,
      number: row.invoice_number,
      business: currentProfile?.business_name || '',
      client: customer.name || 'Client',
      email: customer.email || '',
      phone: customer.phone || '',
      date: row.issue_date,
      dueDate: row.due_date,
      items,
      notes: row.notes || '',
      subtotal: Number(row.subtotal) || 0,
      taxRate: items.length
        ? Number(row.tax_amount || 0) / (Number(row.subtotal) || 1) * 100
        : 0,
      tax: Number(row.tax_amount) || 0,
      total: Number(row.total_amount) || 0,
      status: row.status,
      createdAt: new Date(row.created_at).getTime()
    };
  });

  renderWorkspace();
}

async function findOrCreateCustomer(inv) {
  let query = supabaseClient
    .from('customers')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('name', inv.client)
    .limit(1);

  if (inv.email) {
    query = query.eq('email', inv.email);
  }

  const { data: existing, error: searchError } = await query;

  if (searchError) throw searchError;

  if (existing && existing.length) {
    const { error: updateError } = await supabaseClient
      .from('customers')
      .update({
        phone: inv.phone || null
      })
      .eq('id', existing[0].id)
      .eq('user_id', currentUser.id);

    if (updateError) throw updateError;

    return existing[0].id;
  }

  const { data, error } = await supabaseClient
    .from('customers')
    .insert({
      user_id: currentUser.id,
      name: inv.client,
      email: inv.email || null,
      phone: inv.phone || null
    })
    .select('id')
    .single();

  if (error) throw error;

  return data.id;
}

async function saveInvoiceToDatabase(inv) {
  const customerId = await findOrCreateCustomer(inv);

  const { data: savedInvoice, error: invoiceError } = await supabaseClient
    .from('invoices')
    .insert({
      user_id: currentUser.id,
      customer_id: customerId,
      invoice_number: inv.number,
      issue_date: inv.date,
      due_date: inv.dueDate,
      subtotal: inv.subtotal,
      tax_amount: inv.tax,
      total_amount: inv.total,
      amount_paid: 0,
      currency: 'INR',
      status: 'sent',
      notes: inv.notes || null
    })
    .select('id')
    .single();

  if (invoiceError) throw invoiceError;

  const itemRows = inv.items.map(item => ({
    user_id: currentUser.id,
    invoice_id: savedInvoice.id,
    description: item.description,
    quantity: item.qty,
    unit_price: item.rate,
    tax_rate: inv.taxRate,
    line_total: item.qty * item.rate
  }));

  const { error: itemsError } = await supabaseClient
    .from('invoice_items')
    .insert(itemRows);

  if (itemsError) {
    await supabaseClient
      .from('invoices')
      .delete()
      .eq('id', savedInvoice.id)
      .eq('user_id', currentUser.id);

    throw itemsError;
  }

  return savedInvoice.id;
}

async function updateInvoiceStatus(inv, newStatus) {
  const dbStatus = newStatus === 'Paid' ? 'paid' : 'sent';
  const amountPaid = newStatus === 'Paid' ? inv.total : 0;

  const { error } = await supabaseClient
    .from('invoices')
    .update({
      status: dbStatus,
      amount_paid: amountPaid
    })
    .eq('id', inv.id)
    .eq('user_id', currentUser.id);

  if (error) throw error;

  inv.status = dbStatus;
  await loadInvoices();
}

// ------------------------------
// Dashboard rendering
// ------------------------------

function invoiceRows(list) {
  if (!list.length) {
    return empty('No invoices yet', 'Create your first invoice to see it here.');
  }

  return `
    <table class="invoice-table">
      <thead>
        <tr>
          <th>INVOICE</th>
          <th>CLIENT</th>
          <th>DUE DATE</th>
          <th>AMOUNT</th>
          <th>STATUS</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(inv => `
          <tr>
            <td>${escapeHtml(inv.number)}</td>
            <td>${escapeHtml(inv.client)}</td>
            <td>${formatDate(inv.dueDate)}</td>
            <td>${money(inv.total)}</td>
            <td>${statusBadge(invoiceStatus(inv))}</td>
            <td><button class="table-action" data-open-invoice="${inv.id}">View</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderWorkspace() {
  const paid = invoices
    .filter(i => invoiceStatus(i) === 'Paid')
    .reduce((s, i) => s + total(i), 0);

  const outstanding = invoices
    .filter(i => invoiceStatus(i) !== 'Paid')
    .reduce((s, i) => s + total(i), 0);

  const overdue = invoices
    .filter(i => invoiceStatus(i) === 'Overdue')
    .reduce((s, i) => s + total(i), 0);

  $('#metric-total').textContent = money(
    invoices.reduce((s, i) => s + total(i), 0)
  );

  $('#metric-paid').textContent = money(paid);
  $('#metric-outstanding').textContent = money(outstanding);
  $('#metric-overdue').textContent = money(overdue);

  $('#recent-table').innerHTML = invoiceRows(invoices.slice(0, 5));
  $('#all-invoices-table').innerHTML = invoiceRows(invoices);

  const clients = [
    ...new Map(invoices.map(i => [i.client.toLowerCase(), i])).values()
  ];

  $('#clients-list').innerHTML = clients.length
    ? `
      <table class="invoice-table">
        <thead>
          <tr>
            <th>CLIENT</th>
            <th>EMAIL</th>
            <th>PHONE</th>
            <th>INVOICES</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(c => `
            <tr>
              <td>${escapeHtml(c.client)}</td>
              <td>${escapeHtml(c.email || '—')}</td>
              <td>${escapeHtml(c.phone || '—')}</td>
              <td>${invoices.filter(i =>
                i.client.toLowerCase() === c.client.toLowerCase()
              ).length}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : empty('No clients yet', 'Clients will appear here after you create an invoice.');
}

// ------------------------------
// Invoice form
// ------------------------------

function openInvoiceModal() {
  if (!currentUser) {
    openWorkspace();
    return;
  }

  $('#invoice-form').reset();
  $('#invoice-items').innerHTML = '';
  addItemRow();

  $('#invoice-date').value = todayISO();

  const due = new Date();
  due.setDate(due.getDate() + 7);
  $('#due-date').value = due.toISOString().slice(0, 10);

  $('#invoice-number').value = 'NUD-' + String(Date.now()).slice(-6);
  $('#tax-rate').value = '0';

  if (currentProfile?.business_name) {
    $('#business-name').value = currentProfile.business_name;
  }

  calculateTotals();

  $('#invoice-modal').classList.remove('hidden');
  $('#invoice-modal').setAttribute('aria-hidden', 'false');
}

function closeInvoiceModal() {
  $('#invoice-modal').classList.add('hidden');
  $('#invoice-modal').setAttribute('aria-hidden', 'true');
}

function addItemRow(desc = '', qty = 1, rate = '') {
  const row = document.createElement('div');
  row.className = 'item-row';

  row.innerHTML = `
    <input class="item-desc" placeholder="Service or product"
      value="${escapeHtml(desc)}" required>
    <input class="item-qty" type="number" min="0.01" step="0.01"
      value="${qty}" required>
    <input class="item-rate" type="number" min="0" step="0.01"
      placeholder="0.00" value="${rate}" required>
    <button type="button" class="remove-item" aria-label="Remove item">×</button>
  `;

  $('#invoice-items').append(row);

  row.addEventListener('input', calculateTotals);

  $('.remove-item', row).addEventListener('click', () => {
    if ($$('.item-row').length > 1) row.remove();
    calculateTotals();
  });
}

function calculateTotals() {
  let subtotal = 0;

  $$('.item-row').forEach(r => {
    subtotal +=
      (Number($('.item-qty', r).value) || 0) *
      (Number($('.item-rate', r).value) || 0);
  });

  const taxRate = Math.min(
    100,
    Math.max(0, Number($('#tax-rate').value) || 0)
  );

  const tax = subtotal * taxRate / 100;

  $('#subtotal').textContent = money(subtotal);
  $('#tax-amount').textContent = money(tax);
  $('#grand-total').textContent = money(subtotal + tax);
}

async function submitInvoice(e) {
  e.preventDefault();

  if (!currentUser) {
    showToast('Please log in before creating an invoice.');
    return;
  }

  const submitButton = $('#invoice-form button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    const items = $$('.item-row').map(r => ({
      description: $('.item-desc', r).value.trim(),
      qty: Number($('.item-qty', r).value),
      rate: Number($('.item-rate', r).value)
    }));

    if (items.some(i => !i.description || i.qty <= 0 || i.rate < 0)) {
      showToast('Please check your invoice items.');
      return;
    }

    const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
    const taxRate = Number($('#tax-rate').value) || 0;
    const tax = subtotal * taxRate / 100;

    const inv = {
      number: $('#invoice-number').value.trim(),
      business: $('#business-name').value.trim(),
      client: $('#client-name').value.trim(),
      email: $('#client-email').value.trim(),
      phone: $('#client-phone').value.trim(),
      date: $('#invoice-date').value,
      dueDate: $('#due-date').value,
      items,
      notes: $('#invoice-notes').value.trim(),
      subtotal,
      taxRate,
      tax,
      total: subtotal + tax
    };

    if (!inv.number || !inv.business || !inv.client || !inv.date || !inv.dueDate) {
      showToast('Please complete all required invoice details.');
      return;
    }

    const savedId = await saveInvoiceToDatabase(inv);

    await loadInvoices();

    closeInvoiceModal();
    showView('invoices');
    showToast('Invoice saved securely in Supabase.');
    openDetail(savedId);

  } catch (error) {
    console.error('Invoice save error:', error);
    showToast('Could not save invoice: ' + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Save invoice';
  }
}

// ------------------------------
// Invoice details and sharing
// ------------------------------

function openDetail(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) return;

  activeInvoiceId = id;

  $('#detail-title').textContent = inv.number;

  $('#detail-body').innerHTML = `
    <div class="detail-info">
      <div><small>CLIENT</small><strong>${escapeHtml(inv.client)}</strong></div>
      <div><small>STATUS</small><strong>${statusBadge(invoiceStatus(inv))}</strong></div>
      <div><small>INVOICE DATE</small><strong>${formatDate(inv.date)}</strong></div>
      <div><small>DUE DATE</small><strong>${formatDate(inv.dueDate)}</strong></div>
      <div><small>EMAIL</small><strong>${escapeHtml(inv.email || '—')}</strong></div>
      <div><small>PHONE</small><strong>${escapeHtml(inv.phone || '—')}</strong></div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr><th>DESCRIPTION</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr>
      </thead>
      <tbody>
        ${inv.items.map(i => `
          <tr>
            <td>${escapeHtml(i.description)}</td>
            <td>${i.qty}</td>
            <td>${money(i.rate)}</td>
            <td>${money(i.qty * i.rate)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="text-align:right;margin-top:18px;font-size:12px;line-height:2;color:#667085">
      Subtotal: ${money(inv.subtotal)}<br>
      Tax (${Number(inv.taxRate).toFixed(2)}%): ${money(inv.tax)}<br>
      <strong style="font:800 20px Manrope;color:#172b4d">
        Total: ${money(inv.total)}
      </strong>
    </div>

    ${inv.notes ? `
      <p style="font-size:11px;color:#667085;margin-top:18px">
        Note: ${escapeHtml(inv.notes)}
      </p>
    ` : ''}

    <div class="detail-actions">
      <button class="btn btn-primary btn-small" id="download-invoice">Print / Save PDF</button>
      <button class="btn btn-outline btn-small" id="share-whatsapp">Share WhatsApp</button>
      <button class="btn btn-outline btn-small" id="share-email">Email client</button>
      <button class="btn btn-outline btn-small" id="toggle-paid">
        ${invoiceStatus(inv) === 'Paid' ? 'Mark pending' : 'Mark as paid'}
      </button>
    </div>

    <p style="font-size:9px;color:#929bad;margin-top:14px">
      Payment collection and automatic reminders are planned for a future update.
    </p>
  `;

  $('#detail-modal').classList.remove('hidden');
  $('#detail-modal').setAttribute('aria-hidden', 'false');

  $('#download-invoice').onclick = () => printInvoice(inv);
  $('#share-whatsapp').onclick = () => shareWhatsApp(inv);
  $('#share-email').onclick = () => shareEmail(inv);

  $('#toggle-paid').onclick = async () => {
    const newStatus = invoiceStatus(inv) === 'Paid' ? 'Pending' : 'Paid';

    try {
      await updateInvoiceStatus(inv, newStatus);
      closeDetail();
      openDetail(id);
      showToast(newStatus === 'Paid'
        ? 'Invoice marked as paid.'
        : 'Invoice marked as pending.');
    } catch (error) {
      console.error(error);
      showToast('Could not update invoice: ' + error.message);
    }
  };
}

function closeDetail() {
  $('#detail-modal').classList.add('hidden');
  $('#detail-modal').setAttribute('aria-hidden', 'true');
}

function invoiceText(inv) {
  return `Invoice ${inv.number}
From: ${inv.business}
To: ${inv.client}
Due: ${formatDate(inv.dueDate)}
Total: ${money(inv.total)}

Please let me know if you have any questions. Thank you!`;
}

function shareWhatsApp(inv) {
  const phone = (inv.phone || '').replace(/\D/g, '');
  const url = 'https://wa.me/' + phone + '?text=' +
    encodeURIComponent(invoiceText(inv));

  window.open(url, '_blank', 'noopener');
}

function shareEmail(inv) {
  const subject = encodeURIComponent(`Invoice ${inv.number} from ${inv.business}`);
  const body = encodeURIComponent(invoiceText(inv));

  window.location.href =
    `mailto:${encodeURIComponent(inv.email || '')}?subject=${subject}&body=${body}`;
}

function printInvoice(inv) {
  const old = $('#print-area');
  if (old) old.remove();

  const area = document.createElement('div');
  area.id = 'print-area';

  area.innerHTML = `
    <div class="print-header">
      <div>
        <h1>${escapeHtml(inv.business)}</h1>
        <p>Invoice from Nudge workspace</p>
      </div>
      <div>
        <h2>INVOICE</h2>
        <p>${escapeHtml(inv.number)}</p>
        <p>Date: ${formatDate(inv.date)}</p>
        <p>Due: ${formatDate(inv.dueDate)}</p>
      </div>
    </div>
    <hr>
    <p><b>Bill to:</b><br>
      ${escapeHtml(inv.client)}<br>
      ${escapeHtml(inv.email || '')}
    </p>
    <table class="print-table">
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${inv.items.map(i => `
          <tr>
            <td>${escapeHtml(i.description)}</td>
            <td>${i.qty}</td>
            <td>${money(i.rate)}</td>
            <td>${money(i.qty * i.rate)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="print-total">
      Subtotal: ${money(inv.subtotal)}<br>
      Tax (${Number(inv.taxRate).toFixed(2)}%): ${money(inv.tax)}
      <h2>Total due: ${money(inv.total)}</h2>
    </div>
    <p>${escapeHtml(inv.notes || 'Thank you for your business.')}</p>
  `;

  document.body.appendChild(area);
  window.print();
  setTimeout(() => area.remove(), 1000);
}

// ------------------------------
// Modal controls
// ------------------------------

function closeModalFromTarget(e) {
  if (e.target.matches('[data-close-modal]')) closeInvoiceModal();
  if (e.target.matches('[data-close-detail]')) closeDetail();
}

// ------------------------------
// Start application
// ------------------------------

async function startApp() {
  $('#year').textContent = new Date().getFullYear();

  $('#today-label').textContent = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  $('#auth-form').addEventListener('submit', handleAuthSubmit);

  $('#auth-switch').addEventListener('click', () => {
    setAuthMode(authMode === 'signup' ? 'login' : 'signup');
  });

  $('#sign-out').addEventListener('click', handleSignOut);

  ['#open-app-top', '#cta-open-app'].forEach(s => {
    $(s).addEventListener('click', () => openWorkspace());
  });

  $('#start-creating').addEventListener('click', () => {
    openWorkspace();

    if (currentUser) {
      openInvoiceModal();
    }
  });

  $$('.plan-start').forEach(b => {
    b.addEventListener('click', () => {
      openWorkspace();
      showToast('Plans are not enabled yet. Try the free workspace.');
    });
  });

  $('#close-app').addEventListener('click', closeWorkspace);
  $('#app-backdrop').addEventListener('click', closeWorkspace);

  $('#new-invoice').addEventListener('click', openInvoiceModal);
  $('#new-invoice-2').addEventListener('click', openInvoiceModal);

  $('#add-item').addEventListener('click', () => addItemRow());
  $('#tax-rate').addEventListener('input', calculateTotals);

  $('#invoice-form').addEventListener('submit', submitInvoice);

  $('#invoice-modal').addEventListener('click', closeModalFromTarget);
  $('#detail-modal').addEventListener('click', closeModalFromTarget);

  $$('.side-link').forEach(b => {
    b.addEventListener('click', () => showView(b.dataset.view));
  });

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open-invoice]');
    if (open) openDetail(open.dataset.openInvoice);

    const go = e.target.closest('[data-goto]');
    if (go) showView(go.dataset.goto);
  });

  $('#menu-toggle').addEventListener('click', () => {
    $('.main-nav').classList.toggle('show');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeInvoiceModal();
      closeDetail();
      closeWorkspace();
    }
  });

  renderWorkspace();

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error('Session check error:', error);
    showAuthScreen();
    return;
  }

  if (data.session?.user) {
    currentUser = data.session.user;

    try {
      await ensureProfile(currentUser);
      await enterWorkspace();
    } catch (profileError) {
      console.error('Profile setup error:', profileError);
      showAuthScreen();
      showToast('Could not load your profile. Please log in again.');
    }
  } else {
    showAuthScreen();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      currentUser = null;
      currentProfile = null;
      invoices = [];
      showAuthScreen();
    }
  });
}

document.addEventListener('DOMContentLoaded', startApp);
