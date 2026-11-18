const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0);
const todayISO = () => new Date().toISOString().slice(0,10);
let invoices = [];
try { invoices = JSON.parse(localStorage.getItem('nudge_invoices') || '[]'); } catch { invoices = []; }
let activeInvoiceId = null;
let toastTimer;

function save(){ localStorage.setItem('nudge_invoices', JSON.stringify(invoices)); renderWorkspace(); }
function showToast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600); }
function openWorkspace(view='overview'){ $('#app-shell').classList.add('open'); $('#app-shell').setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; showView(view); }
function closeWorkspace(){ $('#app-shell').classList.remove('open'); $('#app-shell').setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
function showView(view){ $$('.view').forEach(v=>v.classList.add('hidden')); $('#view-'+view).classList.remove('hidden'); $$('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); $('#workspace-title').textContent=({overview:'Overview',invoices:'Invoices',clients:'Clients'})[view]; renderWorkspace(); }
function invoiceStatus(inv){ if(inv.status==='Paid') return 'Paid'; return inv.dueDate < todayISO() ? 'Overdue' : 'Pending'; }
function total(inv){return Number(inv.total)||0}
function statusBadge(status){let cls=status==='Paid'?'status-paid':status==='Overdue'?'status-late':'status-pending';return `<span class="status ${cls}">${status}</span>`}
function empty(label,sub){return `<div class="empty-state"><strong>${label}</strong>${sub}</div>`}
function invoiceRows(list){if(!list.length)return empty('No invoices yet','Create your first invoice to see it here.');return `<table class="invoice-table"><thead><tr><th>INVOICE</th><th>CLIENT</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th><th></th></tr></thead><tbody>${list.map(inv=>`<tr><td>${escapeHtml(inv.number)}</td><td>${escapeHtml(inv.client)}</td><td>${formatDate(inv.dueDate)}</td><td>${money(inv.total)}</td><td>${statusBadge(invoiceStatus(inv))}</td><td><button class="table-action" data-open-invoice="${inv.id}">View</button></td></tr>`).join('')}</tbody></table>`}
function renderWorkspace(){
 const paid=invoices.filter(i=>invoiceStatus(i)==='Paid').reduce((s,i)=>s+total(i),0);
 const outstanding=invoices.filter(i=>invoiceStatus(i)!=='Paid').reduce((s,i)=>s+total(i),0);
 const overdue=invoices.filter(i=>invoiceStatus(i)==='Overdue').reduce((s,i)=>s+total(i),0);
 $('#metric-total').textContent=money(invoices.reduce((s,i)=>s+total(i),0));
 $('#metric-paid').textContent=money(paid); $('#metric-outstanding').textContent=money(outstanding); $('#metric-overdue').textContent=money(overdue);
 $('#recent-table').innerHTML=invoiceRows([...invoices].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5));
 $('#all-invoices-table').innerHTML=invoiceRows([...invoices].sort((a,b)=>b.createdAt-a.createdAt));
 const clients=[...new Map(invoices.map(i=>[i.client.toLowerCase(),i])).values()];
 $('#clients-list').innerHTML=clients.length?`<table class="invoice-table"><thead><tr><th>CLIENT</th><th>EMAIL</th><th>PHONE</th><th>INVOICES</th></tr></thead><tbody>${clients.map(c=>`<tr><td>${escapeHtml(c.client)}</td><td>${escapeHtml(c.email||'—')}</td><td>${escapeHtml(c.phone||'—')}</td><td>${invoices.filter(i=>i.client.toLowerCase()===c.client.toLowerCase()).length}</td></tr>`).join('')}</tbody></table>`:empty('No clients yet','Clients will appear here after you create an invoice.');
}
function formatDate(d){if(!d)return '—';return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function openInvoiceModal(){
 $('#invoice-form').reset(); $('#invoice-items').innerHTML=''; addItemRow();
 $('#invoice-date').value=todayISO(); const due=new Date();due.setDate(due.getDate()+7);$('#due-date').value=due.toISOString().slice(0,10);
 $('#invoice-number').value='NUD-'+String(Date.now()).slice(-6); $('#tax-rate').value='0'; calculateTotals();
 $('#invoice-modal').classList.remove('hidden'); $('#invoice-modal').setAttribute('aria-hidden','false');
}
function closeInvoiceModal(){ $('#invoice-modal').classList.add('hidden'); $('#invoice-modal').setAttribute('aria-hidden','true');}
function addItemRow(desc='',qty=1,rate=''){
 const row=document.createElement('div');row.className='item-row';
 row.innerHTML=`<input class="item-desc" placeholder="Service or product" value="${escapeHtml(desc)}" required><input class="item-qty" type="number" min="0.01" step="0.01" value="${qty}" required><input class="item-rate" type="number" min="0" step="0.01" placeholder="0.00" value="${rate}" required><button type="button" class="remove-item" aria-label="Remove item">×</button>`;
 $('#invoice-items').append(row); row.addEventListener('input',calculateTotals); $('.remove-item',row).addEventListener('click',()=>{if($$('.item-row').length>1)row.remove();calculateTotals();});
}
function calculateTotals(){
 let subtotal=0;$$('.item-row').forEach(r=>subtotal+=(Number($('.item-qty',r).value)||0)*(Number($('.item-rate',r).value)||0));
 const taxRate=Math.min(100,Math.max(0,Number($('#tax-rate').value)||0)),tax=subtotal*taxRate/100;
 $('#subtotal').textContent=money(subtotal);$('#tax-amount').textContent=money(tax);$('#grand-total').textContent=money(subtotal+tax);
}
function submitInvoice(e){
 e.preventDefault();
 const items=$$('.item-row').map(r=>({description:$('.item-desc',r).value.trim(),qty:Number($('.item-qty',r).value),rate:Number($('.item-rate',r).value)}));
 if(items.some(i=>!i.description||i.qty<=0||i.rate<0)){showToast('Please check your invoice items.');return;}
 const subtotal=items.reduce((s,i)=>s+i.qty*i.rate,0),taxRate=Number($('#tax-rate').value)||0,tax=subtotal*taxRate/100;
 const inv={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),number:$('#invoice-number').value.trim(),business:$('#business-name').value.trim(),client:$('#client-name').value.trim(),email:$('#client-email').value.trim(),phone:$('#client-phone').value.trim(),date:$('#invoice-date').value,dueDate:$('#due-date').value,items,notes:$('#invoice-notes').value.trim(),subtotal,taxRate,tax,total:subtotal+tax,status:'Pending',createdAt:Date.now()};
 invoices.push(inv);save();closeInvoiceModal();showView('invoices');showToast('Invoice saved in this browser.');openDetail(inv.id);
}
function openDetail(id){
 const inv=invoices.find(i=>i.id===id);if(!inv)return;activeInvoiceId=id;
 $('#detail-title').textContent=inv.number;
 $('#detail-body').innerHTML=`<div class="detail-info"><div><small>CLIENT</small><strong>${escapeHtml(inv.client)}</strong></div><div><small>STATUS</small><strong>${statusBadge(invoiceStatus(inv))}</strong></div><div><small>INVOICE DATE</small><strong>${formatDate(inv.date)}</strong></div><div><small>DUE DATE</small><strong>${formatDate(inv.dueDate)}</strong></div><div><small>EMAIL</small><strong>${escapeHtml(inv.email||'—')}</strong></div><div><small>PHONE</small><strong>${escapeHtml(inv.phone||'—')}</strong></div></div><table class="invoice-table"><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>${inv.items.map(i=>`<tr><td>${escapeHtml(i.description)}</td><td>${i.qty}</td><td>${money(i.rate)}</td><td>${money(i.qty*i.rate)}</td></tr>`).join('')}</tbody></table><div style="text-align:right;margin-top:18px;font-size:12px;line-height:2;color:#667085">Subtotal: ${money(inv.subtotal)}<br>Tax (${inv.taxRate}%): ${money(inv.tax)}<br><strong style="font:800 20px Manrope;color:#172b4d">Total: ${money(inv.total)}</strong></div>${inv.notes?`<p style="font-size:11px;color:#667085;margin-top:18px">Note: ${escapeHtml(inv.notes)}</p>`:''}<div class="detail-actions"><button class="btn btn-primary btn-small" id="download-invoice">Print / Save PDF</button><button class="btn btn-outline btn-small" id="share-whatsapp">Share WhatsApp</button><button class="btn btn-outline btn-small" id="share-email">Email client</button><button class="btn btn-outline btn-small" id="toggle-paid">${inv.status==='Paid'?'Mark pending':'Mark as paid'}</button></div><p style="font-size:9px;color:#929bad;margin-top:14px">Payment collection and automatic reminders are not connected in this demo.</p>`;
 $('#detail-modal').classList.remove('hidden');$('#detail-modal').setAttribute('aria-hidden','false');
 $('#download-invoice').onclick=()=>printInvoice(inv);
 $('#share-whatsapp').onclick=()=>shareWhatsApp(inv);
 $('#share-email').onclick=()=>shareEmail(inv);
 $('#toggle-paid').onclick=()=>{inv.status=inv.status==='Paid'?'Pending':'Paid';save();closeDetail();openDetail(id);showToast(inv.status==='Paid'?'Invoice marked as paid.':'Invoice marked as pending.');};
}
function closeDetail(){$('#detail-modal').classList.add('hidden');$('#detail-modal').setAttribute('aria-hidden','true');}
function invoiceText(inv){return `Invoice ${inv.number}\nFrom: ${inv.business}\nTo: ${inv.client}\nDue: ${formatDate(inv.dueDate)}\nTotal: ${money(inv.total)}\n\nPlease let me know if you have any questions. Thank you!`;}
function shareWhatsApp(inv){const phone=(inv.phone||'').replace(/\D/g,'');const url='https://wa.me/'+(phone||'')+'?text='+encodeURIComponent(invoiceText(inv));window.open(url,'_blank','noopener');}
function shareEmail(inv){const subject=encodeURIComponent(`Invoice ${inv.number} from ${inv.business}`),body=encodeURIComponent(invoiceText(inv));window.location.href=`mailto:${encodeURIComponent(inv.email||'')}?subject=${subject}&body=${body}`;}
function printInvoice(inv){
 const old=$('#print-area');if(old)old.remove();
 const area=document.createElement('div');area.id='print-area';
 area.innerHTML=`<div class="print-header"><div><h1>${escapeHtml(inv.business)}</h1><p>Invoice from Nudge workspace</p></div><div><h2>INVOICE</h2><p>${escapeHtml(inv.number)}</p><p>Date: ${formatDate(inv.date)}</p><p>Due: ${formatDate(inv.dueDate)}</p></div></div><hr><p><b>Bill to:</b><br>${escapeHtml(inv.client)}<br>${escapeHtml(inv.email||'')}</p><table class="print-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${inv.items.map(i=>`<tr><td>${escapeHtml(i.description)}</td><td>${i.qty}</td><td>${money(i.rate)}</td><td>${money(i.qty*i.rate)}</td></tr>`).join('')}</tbody></table><div class="print-total">Subtotal: ${money(inv.subtotal)}<br>Tax (${inv.taxRate}%): ${money(inv.tax)}<h2>Total due: ${money(inv.total)}</h2></div><p>${escapeHtml(inv.notes||'Thank you for your business.')}</p>`;
 document.body.appendChild(area);window.print();setTimeout(()=>area.remove(),1000);
}
function closeModalFromTarget(e){if(e.target.matches('[data-close-modal]'))closeInvoiceModal();if(e.target.matches('[data-close-detail]'))closeDetail();}

$('#year').textContent=new Date().getFullYear();$('#today-label').textContent=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
['#open-app-top','#cta-open-app'].forEach(s=>$(s).addEventListener('click',()=>openWorkspace()));
$('#start-creating').addEventListener('click',()=>{openWorkspace();openInvoiceModal();});
$('#close-app').addEventListener('click',closeWorkspace);$('#app-backdrop').addEventListener('click',closeWorkspace);
$('#new-invoice').addEventListener('click',openInvoiceModal);$('#new-invoice-2').addEventListener('click',openInvoiceModal);
$('#add-item').addEventListener('click',()=>addItemRow());$('#tax-rate').addEventListener('input',calculateTotals);
$('#invoice-form').addEventListener('submit',submitInvoice);
$('#invoice-modal').addEventListener('click',closeModalFromTarget);$('#detail-modal').addEventListener('click',closeModalFromTarget);
$$('.side-link').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.addEventListener('click',e=>{const open=e.target.closest('[data-open-invoice]');if(open)openDetail(open.dataset.openInvoice);const go=e.target.closest('[data-goto]');if(go)showView(go.dataset.goto);});
$$('.plan-start').forEach(b=>b.addEventListener('click',()=>{openWorkspace();showToast('Plans are not enabled yet. Try the invoice demo first.');}));
$('#menu-toggle').addEventListener('click',()=>$('.main-nav').classList.toggle('show'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeInvoiceModal();closeDetail();closeWorkspace();}});
renderWorkspace();
