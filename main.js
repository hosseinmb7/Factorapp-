/* ============================
   یکپارچه: State & Storage
   ============================ */
const STORAGE_KEYS = {
  customers: 'customers',
  products: 'products',
  invoices: 'invoices',
  invoiceCounter: 'invoiceCounter',
  uiDense: 'uiDense'
};

let customers = JSON.parse(localStorage.getItem(STORAGE_KEYS.customers) || '[]');
let products  = JSON.parse(localStorage.getItem(STORAGE_KEYS.products)  || '[]');
let invoices  = JSON.parse(localStorage.getItem(STORAGE_KEYS.invoices)  || '[]');

// invoiceCounter behavior: keep next-to-use integer in storage
function syncInvoiceCounterWithInvoices(){
  try{
    const maxNo = invoices.reduce((mx,inv)=> Math.max(mx, Number(inv.no||0)), 0);
    const stored = parseInt(localStorage.getItem(STORAGE_KEYS.invoiceCounter)||'0',10) || 0;
    // ensure counter is at least maxNo+1
    const next = Math.max(stored, maxNo + 1);
    localStorage.setItem(STORAGE_KEYS.invoiceCounter, String(next));
    return next;
  }catch(e){
    localStorage.setItem(STORAGE_KEYS.invoiceCounter, '1');
    return 1;
  }
}
function getNextInvoiceNo(){
  // return the current counter value, then increment
  let c = parseInt(localStorage.getItem(STORAGE_KEYS.invoiceCounter)||'1',10);
  if(!Number.isFinite(c) || c<1) c = syncInvoiceCounterWithInvoices();
  localStorage.setItem(STORAGE_KEYS.invoiceCounter, String(c+1));
  return c;
}

function saveData(){
  localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(customers));
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
  localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(invoices));
  // Keep invoiceCounter consistent
  syncInvoiceCounterWithInvoices();
}

/* ============================
   Utilities: digits, escape, normalize
   ============================ */
function toPersianDigits(input){
  return String(input).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}
function normalizeDigits(s){
  return String(s||'')
    .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/٬/g,'') // arabic thousands sep
    .replace(/،/g,'') // persian comma
    .replace(/٫/g,'.') // persian decimal
    .trim();
}
function esc(s){
  return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function toNum(x){
  const n = parseFloat(normalizeDigits(x));
  return Number.isFinite(n) ? n : 0;
}

/* cleanDate returns yyyy/m/d (no leading zeros), or '' */
function cleanDate(s){
  const [y,m,d] = String(s||'').split(/[\/\-.]/).map(part => part||'');
  if(!y || !m || !d) return '';
  const mm = String(Number(m));
  const dd = String(Number(d));
  return `${String(y)}/${mm}/${dd}`;
}

/* ============================
   Navigation
   ============================ */
document.getElementById('menu').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-section]');
  if(!btn) return;
  document.querySelectorAll('.menu button').forEach(b=>b.classList.toggle('active', b===btn));
  const section = btn.dataset.section;
  showSection(section);
});

/* ============================
   Rendering: sections
   ============================ */

let lastShownInvoiceIndex = null;
let editingInvoiceIndex = null; // index هنگام ویرایش فاکتور
let editingIndex = null;        // index هنگام ویرایش مشتری/کالا

function showSection(section, invoiceToEdit=null){
  const content = document.getElementById('content');
  if(section === 'invoice'){
    content.innerHTML = `
      <h2 class="section-header">صدور فاکتور</h2>
      <div class="date-inputs">
        <label>تاریخ:</label>
        <select id="daySelect">${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>
        <select id="monthSelect">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>
        <select id="yearSelect">${Array.from({length:17},(_,i)=>`<option value="${1404+i}">${1404+i}</option>`).join('')}</select>
      </div>
      <select id="customerSelect">
        <option value="">انتخاب مشتری</option>
        ${customers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <div id="invoiceItems" style="margin-top:10px;">
        ${createItemRow().trim()}
      </div>
      <div class="totalbar">
        <button class="btn secondary" id="addItemBtn">➕ افزودن کالا</button>
        <div id="totalAmount">مجموع کل: ۰</div>
      </div>
      <div style="margin-top:10px">
        <button id="saveInvoiceBtn" class="btn">ثبت فاکتور</button>
      </div>
    `;

    // attach handlers that operate on dynamic content
    document.getElementById('addItemBtn').addEventListener('click', ()=> addItem());
    document.getElementById('saveInvoiceBtn').addEventListener('click', generateInvoice);

    // IMPORTANT: attach listeners to any pre-existing row(s) (fix for live calculation bug)
    document.querySelectorAll('#invoiceItems .item-row').forEach(attachRowEvents);

    if(invoiceToEdit){
      // parse date and set selects (we expect yyyy/m/d)
      const parts = (invoiceToEdit.date||'').split('/');
      document.getElementById('yearSelect').value = parts[0] || '';
      document.getElementById('monthSelect').value = parts[1] || '';
      document.getElementById('daySelect').value = parts[2] || '';
      document.getElementById('customerSelect').value = invoiceToEdit.customer || '';
      // clear items and add from invoice (addItem will attach events)
      const wrap = document.getElementById('invoiceItems');
      wrap.innerHTML = '';
      invoiceToEdit.items.forEach(it => addItem(it));
      calculateLineTotal();
      document.getElementById('saveInvoiceBtn').textContent = 'ذخیره تغییرات';
    } else {
      calculateLineTotal();
    }
  }
  else if(section === 'customers'){
    content.innerHTML = `
      <h2 class="section-header">تعریف اشخاص</h2>
      <div class="card edit-form" style="margin-bottom:12px;">
        <input type="text" id="newCustomer" placeholder="نام شخص جدید">
        <button class="btn" id="addCustomerBtn">➕ افزودن شخص</button>
      </div>
      <table>
        <thead><tr><th>نام شخص</th><th>عملیات</th></tr></thead>
        <tbody>
          ${customers.length===0 ? `<tr><td colspan="2">هیچ شخصی ثبت نشده است.</td></tr>` :
            customers.map((c,i)=>`
              <tr>
                <td>${esc(c)}</td>
                <td>
                  <button class="table-btn edit" data-act="edit-customer" data-i="${i}">🖊️</button>
                  <button class="table-btn" data-act="del-customer" data-i="${i}">❌</button>
                </td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    `;
    // Event delegation for customer actions
    content.querySelector('#addCustomerBtn').addEventListener('click', addCustomer);
    content.querySelectorAll('button[data-act="edit-customer"]').forEach(btn=> btn.addEventListener('click', e=> editCustomer(Number(e.currentTarget.dataset.i))));
    content.querySelectorAll('button[data-act="del-customer"]').forEach(btn=> btn.addEventListener('click', e=> confirmDelete('customers', Number(e.currentTarget.dataset.i))));
  }
  else if(section === 'products'){
    content.innerHTML = `
      <h2 class="section-header">تعریف کالا</h2>
      <div class="card edit-form" style="margin-bottom:12px;">
        <input type="text" id="newProduct" placeholder="نام کالای جدید">
        <button class="btn" id="addProductBtn">➕ افزودن کالا</button>
      </div>
      <table>
        <thead><tr><th>نام کالا</th><th>عملیات</th></tr></thead>
        <tbody>
          ${products.length===0 ? `<tr><td colspan="2">هیچ کالایی ثبت نشده است.</td></tr>` :
            products.map((p,i)=>`
              <tr>
                <td>${esc(p)}</td>
                <td>
                  <button class="table-btn edit" data-act="edit-product" data-i="${i}">🖊️</button>
                  <button class="table-btn" data-act="del-product" data-i="${i}">❌</button>
                </td>
              </tr>`).join('')
          }
        </tbody>
      </table>
    `;
    content.querySelector('#addProductBtn').addEventListener('click', addProduct);
    content.querySelectorAll('button[data-act="edit-product"]').forEach(btn=> btn.addEventListener('click', e=> editProduct(Number(e.currentTarget.dataset.i))));
    content.querySelectorAll('button[data-act="del-product"]').forEach(btn=> btn.addEventListener('click', e=> confirmDelete('products', Number(e.currentTarget.dataset.i))));
  }
  else if(section === 'reports'){
    renderReportSection();
  }
  else if(section === 'backup'){
    content.innerHTML = `
      <h2 class="section-header">پشتیبان‌گیری و بازیابی</h2>
      <div class="card">
        <button class="btn" id="downloadBackupBtn">⬇ دانلود بکاپ</button>
        <div style="margin-top:8px">
          <input type="file" id="backupFile" accept=".json">
          <button class="btn secondary" id="restoreBackupBtn">⬆ بازیابی بکاپ</button>
        </div>
        <div id="backupStatus" class="status" style="display:none"></div>
      </div>
    `;
    document.getElementById('downloadBackupBtn').addEventListener('click', backupData);
    document.getElementById('restoreBackupBtn').addEventListener('click', restoreBackup);
  }
  else if(section === 'about'){
    content.innerHTML = `
      <h2 class="section-header">درباره</h2>
      <div class="card">
        <p>برنامه نویس: حسین قصاب. این اپلیکیشن برای صدور و بایگانی فاکتورها ساخته شده است. فعالیت ما در زمینهٔ فروش ماهی و آبزیان است.</p>
      </div>
    `;
  }
}

/* ============================
   Invoice rows: create / add / remove / calculate
   ============================ */

function createItemRow(item = {}){
  const name = item.name || '';
  const weight = (item.weight === undefined) ? '' : String(item.weight);
  const unitPrice = (item.unitPrice === undefined) ? '' : String(item.unitPrice);
  const extraOption = (name && !products.includes(name)) ? `<option value="${esc(name)}" selected>${esc(name)}</option>` : '';
  return `
    <div class="item-row">
      <select class="productName">
        <option value="">انتخاب کالا</option>
        ${extraOption}
        ${products.map(p => `<option value="${esc(p)}" ${name===p?'selected':''}>${esc(p)}</option>`).join('')}
      </select>
      <input type="text" class="productWeight" placeholder="وزن" maxlength="12" value="${esc(weight)}">
      <input type="text" class="productUnitPrice" placeholder="قیمت واحد" maxlength="16" value="${esc(unitPrice)}">
      <span class="lineTotal">۰</span>
      <button class="delete-btn" type="button">❌</button>
    </div>
  `;
}

/* Attach event listeners for a single row (prevents double-attaching) */
function attachRowEvents(row){
  if(!row || row.dataset.listenersAttached === '1') return;
  const weightInput = row.querySelector('.productWeight');
  const priceInput  = row.querySelector('.productUnitPrice');
  const delBtn = row.querySelector('.delete-btn');

  if(weightInput){
    weightInput.addEventListener('input', ()=> {
      weightInput.value = normalizeDigits(weightInput.value).replace(/[^\d.]/g,'');
      calculateLineTotal();
    });
  }
  if(priceInput){
    priceInput.addEventListener('input', ()=> {
      priceInput.value = normalizeDigits(priceInput.value).replace(/[^\d.]/g,'');
      calculateLineTotal();
    });
  }
  if(delBtn){
    delBtn.addEventListener('click', ()=> { row.remove(); calculateLineTotal(); });
  }

  // mark as attached
  row.dataset.listenersAttached = '1';
}

function addItem(item = {}){
  const wrap = document.getElementById('invoiceItems');
  wrap.insertAdjacentHTML('beforeend', createItemRow(item));
  const newRow = wrap.lastElementChild;
  // attach events via helper (prevents duplication)
  attachRowEvents(newRow);
  calculateLineTotal();
}

function calculateLineTotal(){
  const rows = document.querySelectorAll('#invoiceItems .item-row');
  let grand = 0;
  rows.forEach(row=>{
    const w = toNum(row.querySelector('.productWeight').value||'0') || 0;
    const u = toNum(row.querySelector('.productUnitPrice').value||'0') || 0;
    const sum = Math.max(0, w*u);
    grand += sum;
    row.querySelector('.lineTotal').textContent = sum ? toPersianDigits(Number(sum).toLocaleString('fa-IR')) : toPersianDigits(0);
  });
  document.getElementById('totalAmount').textContent = 'مجموع کل: ' + (grand? toPersianDigits(Number(grand).toLocaleString('fa-IR')) : toPersianDigits(0));
}

/* ============================
   Create / Update invoice
   ============================ */

function generateInvoice(){
  const y = document.getElementById('yearSelect').value;
  const m = document.getElementById('monthSelect').value;
  const d = document.getElementById('daySelect').value;
  const customer = document.getElementById('customerSelect').value.trim();

  const rows = [...document.querySelectorAll('#invoiceItems .item-row')];
  const items = [];
  for(const row of rows){
    const name = row.querySelector('.productName').value.trim();
    const weight = toNum(row.querySelector('.productWeight').value);
    const unitPrice = toNum(row.querySelector('.productUnitPrice').value);
    if(!name) { return alert('نام کالا را وارد کنید.'); }
    if(!(weight>0) || !(unitPrice>0)) { return alert('وزن و قیمت واحد باید بزرگتر از صفر باشند.'); }
    items.push({ name, weight, unitPrice });
  }
  if(!customer){ return alert('لطفاً یک مشتری انتخاب کنید.'); }
  if(items.length===0){ return alert('حداقل یک کالا لازم است.'); }

  const total = items.reduce((s,it)=> s + it.weight*it.unitPrice, 0);
  const date = `${y}/${m}/${d}`;

  let inv = { date, customer, items, total };
  if(editingInvoiceIndex === null || editingInvoiceIndex === undefined){
    inv.no = getNextInvoiceNo();
    invoices.push(inv);
    saveData();
    const idx = invoices.length - 1;
    showSection('invoice');
    showInvoicePopup(idx);
  } else {
    // preserve existing number if present
    inv.no = (invoices[editingInvoiceIndex] && invoices[editingInvoiceIndex].no) ? invoices[editingInvoiceIndex].no : getNextInvoiceNo();
    invoices[editingInvoiceIndex] = inv;
    saveData();
    const idx = editingInvoiceIndex;
    editingInvoiceIndex = null;
    showSection('reports');
    showInvoicePopup(idx);
  }
}

/* ============================
   Popup / copy / print
   ============================ */

function showInvoicePopup(index){
  const inv = invoices[index];
  if(!inv){ alert('فاکتور یافت نشد'); return; }
  lastShownInvoiceIndex = index;
  const rows = inv.items.map((it,i)=>`
    <tr>
      <td>${toPersianDigits(i+1)}</td>
      <td>${esc(it.name)}</td>
      <td>${toPersianDigits(it.weight)}</td>
      <td>${toPersianDigits(Number(it.unitPrice).toLocaleString('fa-IR'))}</td>
      <td>${toPersianDigits(Number((it.weight*it.unitPrice)).toLocaleString('fa-IR'))}</td>
    </tr>
  `).join('');
  const html = `
    <h3 style="margin:0 0 8px">فاکتور فروش</h3>
    <div>تاریخ: ${toPersianDigits(inv.date)}</div>
    <div>شماره: ${toPersianDigits(inv.no||'')}</div>
    <div>مشتری: ${esc(inv.customer)}</div>
    <table class="invoice-table" style="margin-top:10px">
      <thead><tr><th>ردیف</th><th>کالا</th><th>وزن</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <th colspan="4" style="text-align:left">جمع کل</th>
          <th>${toPersianDigits(Number(inv.total).toLocaleString('fa-IR'))}</th>
        </tr>
      </tfoot>
    </table>
  `;
  document.getElementById('invoiceDisplay').innerHTML = html;
  document.getElementById('invoicePopup').style.display = 'flex';
}

/* copy plain text fallback: attempt clipboard, fallback to textarea selection */
async function copyInvoiceText(){
  if(lastShownInvoiceIndex === null){ return alert('ابتدا فاکتور را نمایش دهید.'); }
  const inv = invoices[lastShownInvoiceIndex];
  let text = `فاکتور فروش\nتاریخ:\t${toPersianDigits(inv.date)}\nمشتری:\t${inv.customer}\n`;
  text += `ردیف\tکالا\tوزن\tقیمت واحد\tجمع\n`;
  inv.items.forEach((it,i)=>{
    const line = `${toPersianDigits(i+1)}\t${it.name}\t${toPersianDigits(it.weight)}\t${toPersianDigits(Number(it.unitPrice).toLocaleString('fa-IR'))}\t${toPersianDigits(Number((it.weight*it.unitPrice).toLocaleString('fa-IR')))}`
    text += line + '\n';
  });
  text += `جمع کل:\t${toPersianDigits(Number(inv.total).toLocaleString('fa-IR'))}\n`;

  try{
    await navigator.clipboard.writeText(text);
    alert('متن فاکتور کپی شد.');
  }catch(e){
    // fallback: create temporary textarea and select
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand('copy');
      alert('متن فاکتور کپی شد (fallback).');
    }catch(err){
      alert('کپی ناموفق بود. متن در پنجره قرار داده شد.');
      // show it in popup area so user can manually select
      document.getElementById('invoiceDisplay').innerHTML = `<pre style="white-space:pre-wrap">${esc(text)}</pre>`;
    }finally{
      ta.remove();
    }
  }
}

function printInvoice(){
  if(lastShownInvoiceIndex === null){ return alert('ابتدا فاکتور را نمایش دهید.'); }
  const content = document.getElementById('invoiceDisplay').innerHTML;
  const header = `<div style="border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">
    <div style="float:left">تلفن:۰۹۱۶۶۴۲۵۳۲۱</div>
    <div style="text-align:center;font-weight:700;font-size:18px">پخش ماهی قصاب</div>
    <div style="float:right">پخش انواع ماهی و میگو دریایی و ماهی قزل آلا</div>
    <div style="clear:both"></div>
  </div>`;
  const printWin = window.open('', '_blank');
  const html = `
    <html lang="fa"><head><meta charset="UTF-8"><title>چاپ فاکتور</title>
    <style>
      body{ font-family:Tahoma, sans-serif; direction:rtl; padding:12px; }
      table{ width:100%; border-collapse:collapse; }
      th,td{ border:1px solid #999; padding:8px; }
      thead th{ background:#eee }
    </style>
    </head><body>${header}${content}</body></html>`;
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  printWin.print();
}

/* ============================
   CRUD customers/products & helpers
   ============================ */

function addCustomer(){
  const input = document.getElementById('newCustomer');
  const val = (input.value||'').trim();
  if(!val) return alert('نام را وارد کنید.');
  if(customers.some(c=>c.trim()===val)) return alert('نام تکراری است.');
  customers.push(val);
  saveData();
  showSection('customers');
}
function editCustomer(index){
  const content = document.getElementById('content');
  editingIndex = index;
  content.innerHTML = `
    <h2 class="section-header">ویرایش شخص</h2>
    <div class="card edit-form">
      <input type="text" id="editCustomerInput" value="${esc(customers[index])}">
      <button class="btn" id="saveCustomerEditBtn">ذخیره</button>
      <button class="btn secondary" id="cancelCustomerEditBtn">انصراف</button>
    </div>`;
  document.getElementById('saveCustomerEditBtn').addEventListener('click', saveCustomerEdit);
  document.getElementById('cancelCustomerEditBtn').addEventListener('click', ()=> { editingIndex = null; showSection('customers'); });
}
function saveCustomerEdit(){
  const val = (document.getElementById('editCustomerInput').value||'').trim();
  if(!val) return alert('نام نمی‌تواند خالی باشد.');
  if(customers.some((c,i)=>i!==editingIndex && c.trim()===val)) return alert('نام تکراری است.');
  customers[editingIndex] = val;
  saveData();
  editingIndex = null;
  showSection('customers');
}

function addProduct(){
  const input = document.getElementById('newProduct');
  const val = (input.value||'').trim();
  if(!val) return alert('نام کالا را وارد کنید.');
  if(products.some(p=>p.trim()===val)) return alert('نام کالا تکراری است.');
  products.push(val);
  saveData();
  showSection('products');
}
function editProduct(index){
  const content = document.getElementById('content');
  editingIndex = index;
  content.innerHTML = `
    <h2 class="section-header">ویرایش کالا</h2>
    <div class="card edit-form">
      <input type="text" id="editProductInput" value="${esc(products[index])}">
      <button class="btn" id="saveProductEditBtn">ذخیره</button>
      <button class="btn secondary" id="cancelProductEditBtn">انصراف</button>
    </div>`;
  document.getElementById('saveProductEditBtn').addEventListener('click', saveProductEdit);
  document.getElementById('cancelProductEditBtn').addEventListener('click', ()=> { editingIndex = null; showSection('products'); });
}
function saveProductEdit(){
  const val = (document.getElementById('editProductInput').value||'').trim();
  if(!val) return alert('نام نمی‌تواند خالی باشد.');
  if(products.some((p,i)=>i!==editingIndex && p.trim()===val)) return alert('نام کالا تکراری است.');
  products[editingIndex] = val;
  saveData();
  editingIndex = null;
  showSection('products');
}

/* confirmDelete generalized for customers/products */
function confirmDelete(type, index){
  if(!confirm('آیا مطمئن هستید؟ حذف برگشت‌ناپذیر است.')) return;
  if(type === 'customers'){
    if(index >=0 && index < customers.length) customers.splice(index,1);
    // also remove invoices referencing deleted customer? we keep invoices but they will show name as-is
  } else if(type === 'products'){
    if(index >=0 && index < products.length) products.splice(index,1);
    // invoices keep product names as text
  }
  saveData();
  const active = document.querySelector('.menu button.active')?.dataset.section || 'invoice';
  showSection(active);
}

/* ============================
   Reports (single consistent implementation)
   ============================ */

function renderReportSection(){
  const content = document.getElementById('content');
  const uniqueCustomers = [...new Set(customers)];
  const uniqueProducts = [...new Set(products)];
  content.innerHTML = `
    <h2 class="section-header">گزارشات</h2>
    <div class="card" style="margin-bottom:10px">
      <div class="date-inputs">
        <label>سال:</label>
        <select id="filterYear">
          <option value="">همه</option>
          ${Array.from({length:17},(_,i)=>`<option value="${1404+i}">${1404+i}</option>`).join('')}
        </select>
        <label>ماه:</label>
        <select id="filterMonth">
          <option value="">همه</option>
          ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
        </select>
        <label>روز:</label>
        <select id="filterDay">
          <option value="">همه</option>
          ${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
        </select>
        <label>مشتری:</label>
        <select id="filterCustomer">
          <option value="">همه</option>
          ${uniqueCustomers.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <label>کالا:</label>
        <select id="filterProduct">
          <option value="">همه</option>
          ${uniqueProducts.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
        </select>
        <button class="btn" id="applyFilterBtn">اعمال فیلتر</button>
        <button class="btn secondary" id="clearFilterBtn">پاک کردن فیلتر</button>
      </div>
    </div>
    <div id="reportTable" class="card"></div>
  `;
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilters);
  document.getElementById('clearFilterBtn').addEventListener('click', ()=> {
    ['filterYear','filterMonth','filterDay','filterCustomer','filterProduct'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
    applyFilters();
  });
  // initial render
  requestAnimationFrame(()=> applyFilters());
}

function applyFilters(){
  const fy = document.getElementById('filterYear')?.value || '';
  const fm = document.getElementById('filterMonth')?.value || '';
  const fd = document.getElementById('filterDay')?.value || '';
  const fc = document.getElementById('filterCustomer')?.value || '';
  const fp = document.getElementById('filterProduct')?.value || '';

  const hasFilter = !!(fy || fm || fd || fc || fp);

  if(!hasFilter){
    renderReportTable(invoices.slice());
    return;
  }

  const filtered = invoices.filter(inv => {
    // normalized parts (cleanDate ensures consistent format)
    const clean = cleanDate(inv.date || '');
    if(!clean) return false;
    const parts = clean.split('/');
    const yy = String(parts[0]||'');
    const mm = String(Number(parts[1]||0) || '');
    const dd = String(Number(parts[2]||0) || '');
    if(fy && yy!==fy) return false;
    if(fm && mm!==fm) return false;
    if(fd && dd!==fd) return false;
    if(fc && inv.customer!==fc) return false;
    if(fp && !inv.items?.some(it => it?.name === fp)) return false;
    return true;
  });
  renderReportTable(filtered);
}

function renderReportTable(data){
  const wrap = document.getElementById('reportTable');
  if(!data || data.length===0){
    wrap.innerHTML = `<div>فاکتوری موجود نیست.</div>`;
    return;
  }
  const rows = data.map((inv)=>{
    const idx = invoices.indexOf(inv);
    return `
      <tr>
        <td>${toPersianDigits(inv.no||'')}</td>
        <td>${toPersianDigits(inv.date)}</td>
        <td>${esc(inv.customer)}</td>
        <td>${toPersianDigits(inv.items.length)}</td>
        <td>${toPersianDigits(Number(inv.total).toLocaleString('fa-IR'))}</td>
        <td>
          <button class="table-btn" data-act="view-inv" data-i="${idx}">👁️</button>
          <button class="table-btn edit" data-act="edit-inv" data-i="${idx}">✏️</button>
          <button class="table-btn" data-act="del-inv" data-i="${idx}">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>شماره</th><th>تاریخ</th><th>مشتری</th><th>تعداد اقلام</th><th>جمع کل</th><th>عملیات</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  // attach actions
  wrap.querySelectorAll('button[data-act="view-inv"]').forEach(b => b.addEventListener('click', e => showInvoicePopup(Number(e.currentTarget.dataset.i))));
  wrap.querySelectorAll('button[data-act="edit-inv"]').forEach(b => b.addEventListener('click', e => editInvoice(Number(e.currentTarget.dataset.i))));
  wrap.querySelectorAll('button[data-act="del-inv"]').forEach(b => b.addEventListener('click', e => deleteInvoice(Number(e.currentTarget.dataset.i))));
}

/* ============================
   Invoice edit / delete
   ============================ */

function deleteInvoice(index){
  if(!confirm('آیا مطمئن هستید؟ حذف برگشت‌ناپذیر است.')) return;
  invoices.splice(index,1);
  saveData();
  const active = document.querySelector('.menu button.active')?.dataset.section;
  if(active==='reports') renderReportSection(); else showSection(active||'invoice');
}

function editInvoice(index){
  editingInvoiceIndex = index;
  showSection('invoice', invoices[index]);
}

/* ============================
   Backup / Restore (robust)
   ============================ */

function backupData(){
  const data = { customers, products, invoices };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  const today = new Date();
  const yyyy = today.getFullYear(), mm = String(today.getMonth()+1).padStart(2,'0'), dd = String(today.getDate()).padStart(2,'0');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_${yyyy}-${mm}-${dd}.json`;
  a.click();
  showBackupStatus('فایل پشتیبان دانلود شد.', true);
}
function showBackupStatus(msg, ok){
  const el = document.getElementById('backupStatus');
  if(!el) return;
  el.textContent = msg;
  el.className = 'status ' + (ok?'ok':'err');
  el.style.display = 'block';
}

// restoreBackup supports both: exported full object OR array-of-invoices OR legacy variants
function restoreBackup(){
  const input = document.getElementById('backupFile');
  if(!input || !input.files || !input.files[0]){ showBackupStatus('لطفاً فایل JSON را انتخاب کنید.', false); return; }
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      let data = JSON.parse(e.target.result);
      // if user exported only invoices as array, build object with existing customers/products
      if(Array.isArray(data)){
        data = { customers: JSON.parse(localStorage.getItem(STORAGE_KEYS.customers) || '[]'),
                 products:  JSON.parse(localStorage.getItem(STORAGE_KEYS.products)  || '[]'),
                 invoices:  data };
      }
      if(!data || !Array.isArray(data.customers) || !Array.isArray(data.products) || !Array.isArray(data.invoices)){
        showBackupStatus('فایل معتبر نیست.', false); return;
      }
      // migrate invoices: be tolerant of different field names, ensure numeric fields are numbers
      const migratedInvoices = [];
      for(const rawInv of data.invoices){
        if(!rawInv || typeof rawInv !== 'object') continue;
        const date = cleanDate(rawInv.date || rawInv.invoiceDate || '');
        const customer = String(rawInv.customer || rawInv.client || '').trim();
        const itemsRaw = Array.isArray(rawInv.items) ? rawInv.items : [];
        const cleanItems = [];
        for(const it of itemsRaw){
          if(!it || typeof it!=='object') continue;
          const name = String(it.name || it.product || '').trim();
          const weight = toNum(it.weight);
          const unitPrice = toNum(it.unitPrice || it.price);
          if(!name) continue;
          cleanItems.push({ name, weight, unitPrice });
        }
        let total = toNum(rawInv.total);
        if(!Number.isFinite(total) || total <= 0){
          total = cleanItems.reduce((s,it)=> s + (toNum(it.weight)*toNum(it.unitPrice)), 0);
        }
        if(!date || !customer || cleanItems.length===0) continue;
        // preserve invoice number if present
        const no = (rawInv.no || rawInv.number || rawInv.invoiceNo);
        const itemInvoice = { date, customer, items: cleanItems, total };
        if(no !== undefined && no !== null && String(no).trim() !== '') itemInvoice.no = Number(no);
        migratedInvoices.push(itemInvoice);
      }
      if(migratedInvoices.length === 0){
        showBackupStatus('ساختار فاکتورها نامعتبر است.', false); return;
      }
      customers = data.customers.map(String);
      products  = data.products.map(String);
      invoices  = migratedInvoices;
      // ensure invoiceCounter is at least maxNo+1
      syncInvoiceCounterWithInvoices();
      saveData();
      showBackupStatus('بازیابی با موفقیت انجام شد.', true);
      const active = document.querySelector('.menu button.active')?.dataset.section || 'invoice';
      showSection(active);
    }catch(err){
      console.error(err);
      showBackupStatus('خواندن فایل ناموفق بود.', false);
    }
  };
  reader.readAsText(file, 'utf-8');
}

/* ============================
   UI: theme and dense toggle, popup controls
   ============================ */

const themeSelect = document.getElementById('themeSelect');
if(themeSelect){
  themeSelect.addEventListener('change', function(e){
    document.body.classList.remove('theme-bluegrey','theme-blue','theme-green','theme-dark');
    const v = e.target.value;
    if(v) document.body.classList.add(v);
  });
}

// Dense mode persist
(function(){
  const KEY = STORAGE_KEYS.uiDense;
  const body = document.body;
  function applyDense(state){
    body.classList.toggle('dense', state);
    try{ localStorage.setItem(KEY, state? '1':'0'); }catch{}
  }
  let stored=null;
  try{ stored = localStorage.getItem(KEY); }catch{}
  applyDense(stored==='1');
  document.getElementById('denseToggle').addEventListener('click', ()=>{
    applyDense(!body.classList.contains('dense'));
  });
})();

// Popup controls
document.getElementById('closePopupBtn').addEventListener('click', ()=> document.getElementById('invoicePopup').style.display='none');
document.getElementById('copyInvoiceBtn').addEventListener('click', copyInvoiceText);
document.getElementById('printInvoiceBtn').addEventListener('click', printInvoice);

// Initialize UI
showSection('invoice');
syncInvoiceCounterWithInvoices();
