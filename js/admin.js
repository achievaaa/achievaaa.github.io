// ==================== KONFIGURASI 2 FIREBASE PROJECT ====================

// Project 1: Untuk AUTHENTICATION ADMIN (projek baru pentadbir)
const adminFirebaseConfig = {
  apiKey: "AIzaSyAp6p6y3eCQ952qJ-aMcwsrR9ZGqvAlACI",
  authDomain: "achievaaa-pentadbir.firebaseapp.com",
  projectId: "achievaaa-pentadbir",
  storageBucket: "achievaaa-pentadbir.firebasestorage.app",
  messagingSenderId: "1033212301304",
  appId: "1:1033212301304:web:9717bc5e6b09ff997d500d",
  measurementId: "G-7BNTWGG2HJ"
};

// Project 2: Untuk DATA PENGGUNA (projek asal)
const userFirebaseConfig = {
  apiKey: "AIzaSyCwnb1D-qqyjUDNimf1tV6jREshvkGujgY",
  authDomain: "achievaaa-a8b1d.firebaseapp.com",
  projectId: "achievaaa-a8b1d",
  storageBucket: "achievaaa-a8b1d.firebasestorage.app",
  messagingSenderId: "1019216709115",
  appId: "1:1019216709115:web:4782960e4363bd7f56f75e",
  measurementId: "G-D95B646RQF"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Initialize Admin App (untuk authentication admin)
const adminApp = initializeApp(adminFirebaseConfig, "adminApp");
const adminAuth = getAuth(adminApp);

// Initialize User App (untuk data pengguna dan authentication user)
const userApp = initializeApp(userFirebaseConfig, "userApp");
const userAuth = getAuth(userApp);
const userDb = getFirestore(userApp);

// Email admin yang dibenarkan (guna email dari projek pentadbir)
const ALLOWED_ADMIN_EMAIL = "seasaltfloat@gmail.com";

let currentAdmin = null;
let allUsers = [];
let selectedUserId = null;
let currentDeleteUserId = null;

const FORMULAS = { '70/20/10':{needs:70,wants:20,savings:10}, '50/30/20':{needs:50,wants:30,savings:20} };

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, function(m){if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m;}); }

function showToast(msg, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function openDeletePopup(userId) {
  currentDeleteUserId = userId;
  document.getElementById('deleteConfirmText').value = '';
  document.getElementById('popupDeleteAccount').style.display = 'flex';
}

function closeDeletePopup() {
  document.getElementById('popupDeleteAccount').style.display = 'none';
  currentDeleteUserId = null;
}

async function confirmDeleteUser() {
  const confirmText = document.getElementById('deleteConfirmText').value;
  if (confirmText !== 'DELETE') {
    showToast('Taip "DELETE" untuk sahkan pemadaman akaun.', true);
    return;
  }
  
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  
  try {
    const uid = currentDeleteUserId;
    const userToDelete = allUsers.find(u => u.id === uid);
    
    if (!userToDelete || !userToDelete.email) {
      throw new Error('Maklumat pengguna tidak ditemui');
    }
    
    // 1. Padam semua goals dalam subkoleksi
    const goalsSnap = await getDocs(collection(userDb, 'users', uid, 'goals'));
    for (const docSnap of goalsSnap.docs) {
      await deleteDoc(doc(userDb, 'users', uid, 'goals', docSnap.id));
    }
    
    // 2. Padam dokumen pengguna dari Firestore
    await deleteDoc(doc(userDb, 'users', uid));
    
    // 3. Padam akaun Firebase Auth pengguna
    // Kita perlu sign in sebagai user tersebut atau guna Firebase Admin SDK
    // Cara: sign in dengan credentials user, then delete
    try {
      // Sign in sebagai user (perlu password? alternatif: guna Firebase Admin SDK via Cloud Function)
      // Memandangkan kita tiada password user, kita akan guna cara lain - 
      // Untuk production, lebih baik guna Cloud Function dengan Admin SDK
      showToast('Akaun Firebase Auth tidak boleh dipadam dari client tanpa password user. Data Firestore telah dipadam.', true);
    } catch (authError) {
      console.warn('Auth deletion error:', authError);
      // Data Firestore sudah dipadam, ini yang paling penting
    }
    
    // Refresh senarai pengguna
    await loadAllUsers();
    closeDeletePopup();
    showToast(`Data pengguna ${userToDelete.username || userToDelete.email} telah dipadam!`);
    
  } catch (error) {
    console.error('Delete error:', error);
    showToast(error.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Padam Akaun';
  }
}

// ================ Papar dashboard & muat data dari user database ================
async function showAdminDashboard(user) {
  currentAdmin = user;
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';

  const adminName = user.displayName || user.email.split('@')[0];
  document.getElementById('adminName').textContent = adminName;
  document.getElementById('adminEmailDisplay').textContent = user.email;
  const avatarEl = document.getElementById('adminAvatar');
  avatarEl.textContent = adminName[0].toUpperCase();

  await loadAllUsers();
}

function hideAdminDashboard() {
  document.getElementById('loginPanel').style.display = 'flex';
  document.getElementById('adminDashboard').style.display = 'none';
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminPassword').value = '';
  document.getElementById('loginError').style.display = 'none';
  currentAdmin = null;
}

// ================ Login manual ================
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errorDiv = document.getElementById('loginError');
  errorDiv.style.display = 'none';
  if (!email || !password) {
    errorDiv.textContent = 'Sila isi e-mel dan kata laluan.';
    errorDiv.style.display = 'block';
    return;
  }
  const loginBtn = document.getElementById('adminLoginBtn');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Log masuk...';
  try {
    const userCredential = await signInWithEmailAndPassword(adminAuth, email, password);
    if (userCredential.user.email !== ALLOWED_ADMIN_EMAIL) {
      await signOut(adminAuth);
      throw new Error('Akses ditolak. Hanya pentadbir yang dibenarkan.');
    }
  } catch (err) {
    errorDiv.textContent = err.message || 'Log masuk gagal. Periksa e-mel/kata laluan.';
    errorDiv.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log Masuk Sebagai Pentadbir';
  }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(adminAuth);
  showToast('Log keluar');
});

// ================ Firebase Auth Observer (untuk admin auth sahaja) ================
onAuthStateChanged(adminAuth, async (user) => {
  if (user && user.email === ALLOWED_ADMIN_EMAIL) {
    await showAdminDashboard(user);
  } else {
    if (user && user.email !== ALLOWED_ADMIN_EMAIL) {
      await signOut(adminAuth);
    }
    hideAdminDashboard();
  }
});

// ================ Fungsi muat data dari USER FIRESTORE (projek asal) ================
async function loadAllUsers() {
  try {
    const q = query(collection(userDb, 'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUserList();
    updateStats();
  } catch(e) { console.error(e); showToast("Gagal memuat pengguna", true); }
}

function updateStats() {
  const total = allUsers.length;
  const withPlan = allUsers.filter(u => u.plan && u.plan.income > 0).length;
  const team = allUsers.filter(u => u.isTeamMember === true).length;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Jumlah Pengguna</div></div>
    <div class="stat-card"><div class="stat-number">${withPlan}</div><div class="stat-label">Pengguna Aktif (ada pelan)</div></div>
    <div class="stat-card"><div class="stat-number">${team}</div><div class="stat-label">⭐ Ahli Pasukan</div></div>
    <div class="stat-card"><button class="btn-export" id="exportCSVBtn">📥 Eksport CSV</button></div>
  `;
  document.getElementById('exportCSVBtn')?.addEventListener('click', () => exportToCSV());
}

async function exportToCSV() {
  let csvRows = [["ID","Username","Email","Team Member","Pendapatan","Formula","Simpanan/Bulan"]];
  for (const u of allUsers) {
    const plan = u.plan || {};
    const income = plan.income || 0;
    let savingsAmt = 0;
    if (plan.formula === 'free' && plan.freePct) savingsAmt = Math.round(income * plan.freePct.savings / 100);
    else if (FORMULAS[plan.formula]) savingsAmt = Math.round(income * FORMULAS[plan.formula].savings / 100);
    csvRows.push([u.id, u.username || '', u.email || '', u.isTeamMember ? "Ya" : "Tidak", income, plan.formula || "-", savingsAmt]);
  }
  const csvContent = csvRows.map(row => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tabungku_users.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Eksport CSV selesai");
}

function renderUserList() {
  const searchTerm = document.getElementById('searchUser').value.toLowerCase();
  const filtered = allUsers.filter(u => (u.username || '').toLowerCase().includes(searchTerm) || (u.email || '').toLowerCase().includes(searchTerm));
  const container = document.getElementById('userListContainer');
  if (filtered.length === 0) { container.innerHTML = '<div class="no-users">Tiada pengguna</div>'; return; }
  container.innerHTML = filtered.map(user => {
    const initial = (user.username || user.email || 'U')[0].toUpperCase();
    const avatarHtml = user.avatarUrl 
      ? `<img src="${user.avatarUrl}" onerror="this.parentElement.textContent='${initial}'">` 
      : initial;
    return `
      <div class="user-item ${selectedUserId === user.id ? 'active' : ''}" data-id="${user.id}">
        <div class="user-avatar-small">${avatarHtml}</div>
        <div class="user-info">
          <div class="user-name">
            ${escapeHtml(user.username || 'Tanpa nama')}
            ${user.isTeamMember ? '<span class="team-badge">⭐ Ahli Pasukan</span>' : ''}
          </div>
          <div class="user-email">${escapeHtml(user.email)}</div>
        </div>
      </div>
    `;
  }).join('');
  document.querySelectorAll('.user-item').forEach(el => {
    el.addEventListener('click', () => selectUser(el.dataset.id));
  });
}

document.getElementById('searchUser').addEventListener('input', () => renderUserList());

async function selectUser(uid) {
  selectedUserId = uid;
  renderUserList();
  const user = allUsers.find(u => u.id === uid);
  document.getElementById('selectedUserName').innerHTML = `${escapeHtml(user.username)} ${user.isTeamMember ? '<span class="team-badge">⭐ Ahli Pasukan</span>' : ''}`;
  const toggleBtn = document.getElementById('toggleTeamBtn');
  toggleBtn.style.display = 'inline-flex';
  toggleBtn.innerHTML = user.isTeamMember ? '⭐ Buang Ahli Pasukan' : '⭐ Jadikan Ahli Pasukan';
  toggleBtn.onclick = () => toggleTeamMember(uid);
  await loadUserFullDetail(uid);
}

async function toggleTeamMember(uid) {
  const user = allUsers.find(u => u.id === uid);
  const newStatus = !user.isTeamMember;
  await updateDoc(doc(userDb, 'users', uid), { isTeamMember: newStatus });
  user.isTeamMember = newStatus;
  renderUserList();
  selectUser(uid);
  updateStats();
  showToast(newStatus ? 'Pengguna kini Ahli Pasukan ⭐' : 'Status ahli pasukan dibuang');
}

async function loadUserFullDetail(uid) {
  try {
    const userDoc = await getDoc(doc(userDb, 'users', uid));
    const userProfile = userDoc.exists() ? userDoc.data() : {};
    const goalsSnap = await getDocs(collection(userDb, 'users', uid, 'goals'));
    const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('tabProfile').innerHTML = renderProfileTab(uid, userProfile);
    document.getElementById('tabPlan').innerHTML = renderPlanTab(uid, userProfile.plan);
    document.getElementById('tabGoals').innerHTML = renderGoalsTab(uid, goals);
    document.getElementById('tabDanger').innerHTML = renderDangerTab(uid);
    attachPlanTabEvents(uid);
    attachGoalsTabEvents(uid);
    attachProfileEvents(uid, userProfile);
    attachDangerEvent(uid);
  } catch(e) { console.error(e); showToast("Ralat memuat butiran pengguna", true); }
}

function attachProfileEvents(uid, profile) {
  const editBtn = document.getElementById('editProfileBtn');
  const resetBtn = document.getElementById('resetPwBtn');
  if (editBtn) editBtn.onclick = async () => {
    const newUsername = prompt('Nama pengguna baharu:', profile.username || '');
    if (newUsername && newUsername.trim()) {
      await updateDoc(doc(userDb, 'users', uid), { username: newUsername.trim() });
      showToast('Nama pengguna dikemas kini');
      loadAllUsers();
      selectUser(uid);
    }
    const newAvatar = prompt('URL Avatar baharu (kosong untuk kosongkan):', profile.avatarUrl || '');
    if (newAvatar !== null) {
      await updateDoc(doc(userDb, 'users', uid), { avatarUrl: newAvatar || '' });
      showToast('Avatar dikemas kini');
      loadAllUsers();
      selectUser(uid);
    }
  };
  if (resetBtn) resetBtn.onclick = async () => {
    if (profile.email) {
      try {
        await sendPasswordResetEmail(userAuth, profile.email);
        showToast(`E-mel reset kata laluan dihantar ke ${profile.email}`);
      } catch(e) { showToast(e.message, true); }
    }
  };
}

function renderProfileTab(uid, profile) {
  return `<div class="section-card"><div class="section-title">👤 MAKLUMAT ASAS</div>
    <div class="info-row"><span class="info-label">Nama Pengguna</span><span class="info-value">${escapeHtml(profile.username || '-')}</span></div>
    <div class="info-row"><span class="info-label">E-mel</span><span class="info-value">${escapeHtml(profile.email || '-')}</span></div>
    <div class="info-row"><span class="info-label">Avatar URL</span><span class="info-value">${profile.avatarUrl || 'Tiada'}</span></div>
    <div class="info-row"><span class="info-label">Tarikh Daftar</span><span class="info-value">${profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('ms-MY') : '-'}</span></div>
    <div class="inline-actions"><button class="btn-edit" id="editProfileBtn">✏️ Sunting Profil</button><button class="btn-edit" id="resetPwBtn">📧 Reset Kata Laluan</button></div></div>`;
}

function renderPlanTab(uid, plan) {
  if (!plan) return `<div class="section-card"><div class="section-title">📋 PELAN KEWANGAN</div><div class="info-row">Tiada pelan disimpan.</div><button class="btn-edit" id="createEmptyPlanBtn">+ Buat Pelan Kosong</button></div>`;
  const income = plan.income || 0;
  const formula = plan.formula || '50/30/20';
  let pct = { needs: 50, wants: 30, savings: 20 };
  if (formula === 'free' && plan.freePct) pct = plan.freePct;
  else if (FORMULAS[formula]) pct = FORMULAS[formula];
  const savingsAmt = Math.round(income * pct.savings / 100);
  const commitments = plan.commitments || [];
  const commitTotal = commitments.reduce((s,c)=> s + (c.amount||0),0);
  return `<div class="section-card"><div class="section-title">📊 PELAN AKTIF (${formula === 'free' ? 'BEBAS' : formula})</div>
    <div class="info-row"><span class="info-label">Pendapatan bulanan</span><span class="info-value">RM ${income.toLocaleString('ms-MY')}</span></div>
    <div class="info-row"><span class="info-label">Simpanan / bulan</span><span class="info-value">RM ${savingsAmt.toLocaleString('ms-MY')} (${pct.savings}%)</span></div>
    <div class="info-row"><span class="info-label">Keperluan (${pct.needs}%)</span><span class="info-value">RM ${Math.round(income * pct.needs/100).toLocaleString('ms-MY')}</span></div>
    <div class="info-row"><span class="info-label">Kehendak (${pct.wants}%)</span><span class="info-value">RM ${Math.round(income * pct.wants/100).toLocaleString('ms-MY')}</span></div>
    <div class="info-row"><span class="info-label">Komitmen</span><span class="info-value">${commitments.length} item (Jumlah: RM ${commitTotal.toLocaleString('ms-MY')})</span></div>
    <div class="inline-actions"><button class="btn-edit" id="editPlanBtn">✏️ Edit Pelan</button><button class="btn-edit btn-danger" id="clearPlanBtn">🗑️ Padam Pelan</button></div>
    <div id="planEditor" style="display:none; margin-top:16px;"></div></div>`;
}

function renderGoalsTab(uid, goals) {
  const active = goals.filter(g => !g.completed);
  const completed = goals.filter(g => g.completed);
  let activeHtml = active.map(g => `<div class="goal-card"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;"><strong>${escapeHtml(g.name)}</strong><span style="background:${g.priority==='high'?'#ff606020':'#f5b73120'}; color:${g.priority==='high'?'#ff9090':'#f5b731'}; padding:2px 8px; border-radius:20px; font-size:11px;">${g.priority}</span></div>
    <div>Sasaran: RM ${(g.target||0).toLocaleString('ms-MY')}</div><div>Terkumpul: RM ${(g.saved||0).toLocaleString('ms-MY')}</div>
    <div class="progress-bar-mini"><div class="progress-fill-mini" style="width:${Math.min(100, ((g.saved||0)/(g.target||1))*100)}%"></div></div>
    <div class="inline-actions" style="margin-top:8px;"><input type="number" id="savingsAdd-${g.id}" placeholder="+ RM" style="width:100px; background:#0e1a14; border:1px solid #2a3d2e; border-radius:8px; padding:6px;" />
    <button class="btn-edit" onclick="window.adminAddSavings('${uid}','${g.id}')">Tambah</button>
    <button class="btn-edit" onclick="window.adminCompleteGoal('${uid}','${g.id}')">✓ Selesai</button>
    <button class="btn-edit btn-danger" onclick="window.adminDeleteGoal('${uid}','${g.id}')">Padam</button>
    <button class="btn-edit btn-danger" onclick="openDeletePopup('${uid}')" style="background:rgba(220,60,60,0.1);">🗑️ Padam Akaun</button>
    </div></div>`).join('');
  let completedHtml = completed.map(g => `<div class="goal-card" style="opacity:0.7"><div><strong>✅ ${escapeHtml(g.name)}</strong> (Selesai) - RM ${(g.target||0).toLocaleString('ms-MY')}</div><button class="btn-edit" onclick="window.adminUncompleteGoal('${uid}','${g.id}')">↩️ Pulihkan</button></div>`).join('');
  return `<div class="section-card"><div class="section-title">🎯 MATLAMAT AKTIF</div>${activeHtml || '<div class="info-row">Tiada matlamat aktif.</div>'}
    <div style="margin-top:12px;"><button class="btn-edit" id="adminAddGoalBtn">+ Tambah Matlamat</button></div>
    ${completed.length ? `<div class="section-title" style="margin-top:16px;">🏆 PENCAPAIAN (${completed.length})</div>${completedHtml}` : ''}</div>`;
}

function renderDangerTab(uid) {
  return `<div class="section-card" style="border-color: rgba(220,60,60,0.3);">
    <div class="section-title" style="color:#e05555">⚠️ ZON BAHAYA</div>
    <div class="info-row">Padam semua data kewangan & matlamat pengguna. Tindakan tidak boleh balik.</div>
    <button class="btn-edit btn-danger" onclick="openDeletePopup('${uid}')" style="margin-top:8px;">🗑️ Padam Semua Data & Akaun Pengguna</button>
  </div>`;
}

function attachPlanTabEvents(uid) {
  const editBtn = document.getElementById('editPlanBtn');
  const clearBtn = document.getElementById('clearPlanBtn');
  const createEmptyBtn = document.getElementById('createEmptyPlanBtn');
  if (editBtn) editBtn.onclick = () => showPlanEditor(uid);
  if (clearBtn) clearBtn.onclick = () => clearUserPlan(uid);
  if (createEmptyBtn) createEmptyBtn.onclick = () => createEmptyPlan(uid);
}
function attachGoalsTabEvents(uid) {
  const addBtn = document.getElementById('adminAddGoalBtn');
  if (addBtn) addBtn.onclick = () => showAddGoalPopup(uid);
}
function attachDangerEvent(uid) {
  // Event sudah di handle oleh onclick dalam render
}

async function showPlanEditor(uid) {
  const editorDiv = document.getElementById('planEditor');
  const userDoc = await getDoc(doc(userDb, 'users', uid));
  const plan = userDoc.data()?.plan || {};
  const income = plan.income || '';
  const formula = plan.formula || '50/30/20';
  let freePct = plan.freePct || { needs:50, wants:30, savings:20 };
  editorDiv.style.display = 'block';
  editorDiv.innerHTML = `<div class="form-group"><label>Pendapatan Bulanan (RM)</label><input type="number" id="editIncome" class="admin-input" value="${income}" /></div>
    <div class="form-group"><label>Formula Simpanan</label><select id="editFormula" class="admin-select"><option value="50/30/20" ${formula==='50/30/20'?'selected':''}>50/30/20</option><option value="70/20/10" ${formula==='70/20/10'?'selected':''}>70/20/10</option><option value="free" ${formula==='free'?'selected':''}>BEBAS</option></select></div>
    <div id="freePctFields" style="${formula!=='free'?'display:none':''}"><div class="form-group"><label>Keperluan %</label><input type="number" id="freeNeeds" class="admin-input" value="${freePct.needs}" /></div>
    <div class="form-group"><label>Kehendak %</label><input type="number" id="freeWants" class="admin-input" value="${freePct.wants}" /></div>
    <div class="form-group"><label>Simpanan %</label><input type="number" id="freeSavings" class="admin-input" value="${freePct.savings}" /></div></div>
    <div class="inline-actions"><button class="btn-edit" id="savePlanChanges">Simpan</button><button class="btn-edit" id="cancelPlanEdit">Batal</button></div>`;
  document.getElementById('editFormula').addEventListener('change', (e) => { document.getElementById('freePctFields').style.display = e.target.value === 'free' ? 'block' : 'none'; });
  document.getElementById('savePlanChanges').onclick = async () => {
    const newIncome = parseFloat(document.getElementById('editIncome').value) || 0;
    const newFormula = document.getElementById('editFormula').value;
    let newPct = null;
    if (newFormula === 'free') {
      const needs = parseFloat(document.getElementById('freeNeeds').value) || 0;
      const wants = parseFloat(document.getElementById('freeWants').value) || 0;
      const savings = parseFloat(document.getElementById('freeSavings').value) || 0;
      if (needs+wants+savings !== 100) { showToast('Jumlah peratusan mesti 100%', true); return; }
      newPct = { needs, wants, savings };
    }
    const updatedPlan = { income: newIncome, formula: newFormula, commitments: plan.commitments || [] };
    if (newFormula === 'free') updatedPlan.freePct = newPct;
    await updateDoc(doc(userDb, 'users', uid), { plan: updatedPlan });
    showToast('Pelan dikemas kini');
    editorDiv.style.display = 'none';
    loadUserFullDetail(uid);
    loadAllUsers();
  };
  document.getElementById('cancelPlanEdit').onclick = () => { editorDiv.style.display = 'none'; };
}
async function clearUserPlan(uid) {
  if (confirm('Padamkan keseluruhan pelan kewangan pengguna?')) {
    await updateDoc(doc(userDb, 'users', uid), { plan: null });
    showToast('Pelan dipadam');
    loadUserFullDetail(uid);
    loadAllUsers();
  }
}
async function createEmptyPlan(uid) {
  await updateDoc(doc(userDb, 'users', uid), { plan: { income: 0, formula: '50/30/20', commitments: [] } });
  showToast('Pelan kosong dicipta');
  loadUserFullDetail(uid);
  loadAllUsers();
}
async function showAddGoalPopup(uid) {
  const name = prompt('Nama matlamat:');
  if (!name) return;
  const target = parseFloat(prompt('Sasaran (RM):'));
  if (isNaN(target) || target <= 0) return;
  const priority = prompt('Keutamaan (high/medium/low):', 'medium');
  await setDoc(doc(collection(userDb, 'users', uid, 'goals')), { name, target, priority, saved: 0, completed: false, createdAt: Date.now() });
  showToast('Matlamat ditambah');
  loadUserFullDetail(uid);
  loadAllUsers();
}

window.adminAddSavings = async (uid, goalId) => {
  const input = document.getElementById(`savingsAdd-${goalId}`);
  const addVal = parseFloat(input.value);
  if (isNaN(addVal) || addVal <= 0) { showToast('Jumlah sah diperlukan', true); return; }
  const goalRef = doc(userDb, 'users', uid, 'goals', goalId);
  const goalSnap = await getDoc(goalRef);
  const current = goalSnap.data()?.saved || 0;
  await updateDoc(goalRef, { saved: current + addVal });
  showToast(`+RM ${addVal.toLocaleString('ms-MY')} ditambah`);
  loadUserFullDetail(uid);
  loadAllUsers();
};
window.adminCompleteGoal = async (uid, goalId) => {
  await updateDoc(doc(userDb, 'users', uid, 'goals', goalId), { completed: true, completedAt: Date.now() });
  showToast('Matlamat ditanda selesai');
  loadUserFullDetail(uid);
  loadAllUsers();
};
window.adminDeleteGoal = async (uid, goalId) => {
  if (confirm('Padam matlamat ini secara kekal?')) {
    await deleteDoc(doc(userDb, 'users', uid, 'goals', goalId));
    showToast('Matlamat dipadam');
    loadUserFullDetail(uid);
    loadAllUsers();
  }
};
window.adminUncompleteGoal = async (uid, goalId) => {
  await updateDoc(doc(userDb, 'users', uid, 'goals', goalId), { completed: false, completedAt: null });
  showToast('Matlamat dipulihkan ke aktif');
  loadUserFullDetail(uid);
  loadAllUsers();
};

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
  });
});

window.closeDeletePopup = closeDeletePopup;
window.confirmDeleteUser = confirmDeleteUser;
window.openDeletePopup = openDeletePopup;
