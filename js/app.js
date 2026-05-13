// ===== FIREBASE INIT (module loaded from index.html) =====
// window._fb is set by the inline module script in index.html

// ===== GLOBAL STATE =====
let currentStep = 1;
let selectedFormula = '50/30/20';
let newGoalPriority = 'medium';
let commitments = [];
let goals = [];           // planner wizard goals
let editFormula = '50/30/20';
let popupGoalPriority = 'medium';
let activeUpdateGoalId = null;
let dashGoals = [];
let dashAchievements = [];

// NEW: saving mode state for popup & planner
let popupSavingMode = 'duration';   // 'duration' | 'monthly'
let plannerSavingMode = 'duration'; // 'duration' | 'monthly'

const FORMULAS = {
  '70/20/10': { needs: 70, wants: 20, savings: 10 },
  '50/30/20': { needs: 50, wants: 30, savings: 20 },
  'free': null,
};

// ===== HELPERS =====
function fmt(n) { return Math.round(n).toLocaleString('ms-MY'); }
function round(n) { return Math.round(n); }

function renderTeamBadge(isTeamMember) {
  if (isTeamMember) {
    return '<span class="team-badge">⭐ Ahli Pasukan</span>';
  }
  return '';
}

// ===== TOAST =====
let toastTimer;
function showToast(msg, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 3500);
}

// ===== MODE SWITCHING =====
function enterUserMode() {
  const u = window.currentUser;
  const isTeamMember = u.isTeamMember === true;

  document.getElementById('plannerView').style.display = 'none';
  document.getElementById('guestFooter').style.display = 'none';
  document.getElementById('dashboardView').classList.remove('visible');
  document.getElementById('settingsView').classList.remove('visible');
  document.getElementById('userHeader').classList.add('visible');

  const username = u.username || u.email.split('@')[0];
  document.getElementById('headerUsername').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;
  document.getElementById('sidePanelName').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;
  document.getElementById('sidePanelEmail').textContent = u.email;
  document.getElementById('dashUsername').textContent = username;
  document.getElementById('settingsUsername').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;
  document.getElementById('profileName').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;

  const initial = username[0].toUpperCase();
  const setAvatar = (el) => {
    if (u.avatarUrl) {
      el.innerHTML = `<img src="${u.avatarUrl}" onerror="this.parentElement.textContent='${initial}'" />`;
    } else {
      el.textContent = initial;
    }
  };
  setAvatar(document.getElementById('sidePanelAvatar'));
  setAvatar(document.getElementById('headerAvatar'));

  closeAuthModal();
  showDashboard();
}

function enterGuestMode() {
  document.getElementById('plannerView').style.display = 'block';
  document.getElementById('guestFooter').style.display = 'block';
  document.getElementById('plannerHeader').style.display = 'block';
  document.getElementById('dashboardView').classList.remove('visible');
  document.getElementById('settingsView').classList.remove('visible');
  document.getElementById('userHeader').classList.remove('visible');
  renderSteps();
  updateAllPreviews();
}

function switchToPlanner() {
  const isLoggedIn = !!window.currentUser;
  document.getElementById('dashboardView').classList.remove('visible');
  document.getElementById('settingsView').classList.remove('visible');
  document.getElementById('plannerView').style.display = 'block';
  document.getElementById('plannerHeader').style.display = isLoggedIn ? 'none' : 'block';
  document.getElementById('guestFooter').style.display = isLoggedIn ? 'none' : 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return false;
}

function toggleMenu(e) {
  e.stopPropagation();
  const panel = document.getElementById('sidePanel');
  const overlay = document.getElementById('panelOverlay');
  const isOpen = panel.classList.contains('open');
  if (isOpen) { panel.classList.remove('open'); overlay.classList.remove('visible'); }
  else { panel.classList.add('open'); overlay.classList.add('visible'); }
}

function closeMenu() {
  document.getElementById('sidePanel')?.classList.remove('open');
  document.getElementById('panelOverlay')?.classList.remove('visible');
}

// ===== PROFILE MODAL =====
function openProfileModal() {
  const u = window.currentUser;
  const username = u.username || u.email.split('@')[0];
  const isTeamMember = u.isTeamMember === true;
  document.getElementById('profileName').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;
  document.getElementById('profileEmail').textContent = u.email;
  const picEl = document.getElementById('profilePicLarge');
  if (u.avatarUrl) {
    picEl.innerHTML = `<img src="${u.avatarUrl}" onerror="this.parentElement.textContent='${username[0].toUpperCase()}'" />`;
  } else {
    picEl.textContent = username[0].toUpperCase();
  }
  document.getElementById('profileModal').classList.add('visible');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('visible');
}

// ===== DASHBOARD =====
async function showDashboard() {
  document.getElementById('settingsView').classList.remove('visible');
  document.getElementById('dashboardView').classList.add('visible');
  document.getElementById('plannerView').style.display = 'none';
  document.getElementById('guestFooter').style.display = 'none';
  const u = window.currentUser;
  document.getElementById('dashUsername').textContent = u.username || u.email.split('@')[0];
  await loadDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadDashboard() {
  const u = window.currentUser;
  if (!u || !window._fb) return;
  const { db, doc, getDoc, collection, getDocs } = window._fb;

  const planDoc = await getDoc(doc(db, 'users', u.uid));
  const planData = planDoc.exists() ? planDoc.data() : {};

  if (planData.plan) {
    const p = planData.plan;
    const pct = p.formula === 'free' ? p.freePct : FORMULAS[p.formula];
    const savingsAmt = round(p.income * (pct?.savings || 0) / 100);
    const needsAmt = round(p.income * (pct?.needs || 0) / 100);
    const wantsAmt = round(p.income * (pct?.wants || 0) / 100);
    const totalCommit = p.commitments?.reduce((s, c) => s + c.amount, 0) || 0;
    const commitStr = p.commitments?.length > 0
      ? p.commitments.map(c => `${c.name} RM${fmt(c.amount)}`).join(', ')
      : 'Tiada';

    document.getElementById('planCardContent').innerHTML = `
      <div class="plan-row">Pendapatan: <b>RM ${fmt(p.income)}/bulan</b></div>
      <div class="plan-row">Formula: <b>${p.formula === 'free'
        ? `BEBAS (${pct.needs}% | ${pct.wants}% | ${pct.savings}%)`
        : `${p.formula} (Keperluan ${pct.needs}% | Kehendak ${pct.wants}% | Simpanan ${pct.savings}%)`
      }</b></div>
      <div class="plan-row savings-row">Simpanan bulanan: <b>RM ${fmt(savingsAmt)}</b></div>
      ${totalCommit > 0 ? `<div class="plan-row">Komitmen: <b>RM ${fmt(totalCommit)}</b> (${commitStr})</div>` : ''}
    `;

    document.getElementById('dashBreakdownCard').style.display = 'block';
    document.getElementById('dbNeeds').textContent = 'RM ' + fmt(needsAmt);
    document.getElementById('dbWants').textContent = 'RM ' + fmt(wantsAmt);
    document.getElementById('dbSavings').textContent = 'RM ' + fmt(savingsAmt);
    document.getElementById('dbIncome').textContent = 'RM ' + fmt(p.income);
    document.getElementById('dbSavingsMonthly').textContent = 'RM ' + fmt(savingsAmt);
    const commitRow = document.getElementById('dbCommitRow');
    if (totalCommit > 0) {
      commitRow.style.display = 'flex';
      document.getElementById('dbCommit').textContent = 'RM ' + fmt(totalCommit);
    } else {
      commitRow.style.display = 'none';
    }
    window._currentPlan = planData.plan;
  } else {
    document.getElementById('planCardContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">Tiada pelan lagi. <a href="#" onclick="switchToPlanner(); return false;" style="color:#3ecf6e">Buat pelan sekarang →</a></div>
      </div>`;
    document.getElementById('dashBreakdownCard').style.display = 'none';
    window._currentPlan = null;
  }

  const goalsSnap = await getDocs(collection(db, 'users', u.uid, 'goals'));
  dashGoals = [];
  dashAchievements = [];
  goalsSnap.forEach(d => {
    const g = { id: d.id, ...d.data() };
    if (g.completed) dashAchievements.push(g);
    else dashGoals.push(g);
  });
  dashGoals.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  dashAchievements.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  renderDashGoals();
  renderAchievements();
}

function renderDashGoals() {
  const list = document.getElementById('dashGoalList');
  if (dashGoals.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">Tiada matlamat lagi. Tambah matlamat pertama anda!</div></div>`;
    return;
  }
  const plan = window._currentPlan;
  list.innerHTML = dashGoals.map(g => {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.saved || 0) / g.target * 100)) : 0;
    const prioColor = g.priority === 'high' ? '#ff6060' : g.priority === 'medium' ? '#f5b731' : '#82b4e8';
    const prioLabel = g.priority === 'high' ? 'Tinggi' : g.priority === 'medium' ? 'Sederhana' : 'Rendah';

    // Build saving plan info line
    let savingPlanHtml = '';
    if (g.savingMode === 'duration' && g.savingDuration) {
      const monthly = round((g.target - (g.saved || 0)) / g.savingDuration);
      savingPlanHtml = `
        <div class="goal-saving-plan">
          📅 Simpan <b>RM ${fmt(monthly)}/bulan</b> selama <b>${g.savingDuration} bulan</b> lagi
          <button class="btn-edit-plan-small" onclick="openEditGoalSavingPlan('${g.id}')">✏️ Edit</button>
        </div>`;
    } else if (g.savingMode === 'monthly' && g.monthlyAmount) {
      const remaining = (g.target || 0) - (g.saved || 0);
      const months = remaining > 0 ? Math.ceil(remaining / g.monthlyAmount) : 0;
      const eta = new Date(); eta.setMonth(eta.getMonth() + months);
      savingPlanHtml = `
        <div class="goal-saving-plan">
          💰 Simpan <b>RM ${fmt(g.monthlyAmount)}/bulan</b> → Selesai dalam <b>${months} bulan</b>
          ${months > 0 ? `(${eta.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' })})` : ''}
          <button class="btn-edit-plan-small" onclick="openEditGoalSavingPlan('${g.id}')">✏️ Edit</button>
        </div>`;
    } else if (plan) {
      // Fallback: use plan savings
      const pct2 = plan.formula === 'free' ? plan.freePct : FORMULAS[plan.formula];
      const planSavings = round(plan.income * ((pct2?.savings || 0)) / 100);
      const remaining = (g.target || 0) - (g.saved || 0);
      if (planSavings > 0 && remaining > 0) {
        const months = Math.ceil(remaining / planSavings);
        const eta = new Date(); eta.setMonth(eta.getMonth() + months);
        savingPlanHtml = `
          <div class="goal-saving-plan">
            📊 Berdasarkan pelan: <b>${months} bulan</b> lagi (${eta.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' })})
            <button class="btn-edit-plan-small" onclick="openEditGoalSavingPlan('${g.id}')">Tetapkan →</button>
          </div>`;
      }
    }

    return `
      <div class="goal-dash-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div class="goal-dash-name">${g.name}</div>
          <span class="goal-dash-priority" style="background:${prioColor}20;color:${prioColor};border:1px solid ${prioColor}40">${prioLabel}</span>
        </div>
        <div class="goal-dash-meta">Sasaran: <b>RM ${fmt(g.target)}</b></div>
        <div class="progress-label"><span><b>RM ${fmt(g.saved || 0)}</b> / RM ${fmt(g.target)}</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${prioColor}"></div></div>
        ${savingPlanHtml}
        <div class="goal-dash-actions">
          <div class="add-savings-wrap">
            <div class="add-savings-prefix">RM</div>
            <input type="number" class="add-savings-input" id="addSav-${g.id}" placeholder="500" />
          </div>
          <button class="btn-add-savings" onclick="openUpdateGoal('${g.id}')">+</button>
          <button class="btn-complete" onclick="markGoalComplete('${g.id}')">✓ Selesai</button>
          <button class="btn-remove" onclick="deleteActiveGoal('${g.id}')" title="Padam" style="height:36px;padding:0 10px;font-size:16px;flex-shrink:0">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function renderAchievements() {
  const area = document.getElementById('achievementsArea');
  const list = document.getElementById('achieveList');
  if (dashAchievements.length === 0) { area.style.display = 'none'; return; }
  area.style.display = 'block';
  document.getElementById('achieveCount').textContent = `(${dashAchievements.length} matlamat selesai)`;
  list.innerHTML = dashAchievements.map(g => `
    <div class="achievement-item">
      <span class="achievement-check">✓</span>
      <span class="achievement-name">${g.name}</span>
      <span class="achievement-date">${g.completedAt ? new Date(g.completedAt).toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' }) : ''}</span>
      <span class="achievement-amt">RM ${fmt(g.target)}</span>
      <button class="btn-achievement-del" onclick="deleteAchievement('${g.id}')" title="Padam pencapaian">✕</button>
    </div>`).join('');
}

async function deleteAchievement(goalId) {
  if (!confirm('Padam pencapaian ini? Matlamat akan dipulihkan ke senarai aktif.')) return;
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db, 'users', window.currentUser.uid, 'goals', goalId), { completed: false, completedAt: null });
  await loadDashboard();
  showToast('Pencapaian dipadam, matlamat dipulihkan.');
}

async function deleteActiveGoal(goalId) {
  if (!confirm('Padam matlamat ini secara kekal?')) return;
  const { db, doc, deleteDoc } = window._fb;
  await deleteDoc(doc(db, 'users', window.currentUser.uid, 'goals', goalId));
  await loadDashboard();
  showToast('Matlamat dipadam.');
}

// ===== POPUP: EDIT GOAL SAVING PLAN (NEW) =====
let editSavingGoalId = null;

function openEditGoalSavingPlan(goalId) {
  const g = dashGoals.find(x => x.id === goalId);
  if (!g) return;
  editSavingGoalId = goalId;

  // Set mode
  const mode = g.savingMode || 'duration';
  setEditSavingMode(mode);

  // Pre-fill values
  if (g.savingMode === 'duration') {
    document.getElementById('editSavingDuration').value = g.savingDuration || '';
  } else if (g.savingMode === 'monthly') {
    document.getElementById('editSavingMonthly').value = g.monthlyAmount || '';
  }

  // Show goal info
  document.getElementById('editSavingGoalName').textContent = g.name;
  document.getElementById('editSavingTarget').textContent = `RM ${fmt(g.target)}`;
  document.getElementById('editSavingRemaining').textContent = `RM ${fmt((g.target || 0) - (g.saved || 0))}`;

  updateEditSavingPreview();
  document.getElementById('popupEditGoalSaving').classList.add('visible');
}

function setEditSavingMode(mode) {
  popupSavingMode = mode;
  document.querySelectorAll('.saving-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.getElementById('editSavingDurationField').style.display = mode === 'duration' ? 'block' : 'none';
  document.getElementById('editSavingMonthlyField').style.display = mode === 'monthly' ? 'block' : 'none';
  updateEditSavingPreview();
}

function updateEditSavingPreview() {
  const g = dashGoals.find(x => x.id === editSavingGoalId);
  if (!g) return;
  const remaining = (g.target || 0) - (g.saved || 0);
  const preview = document.getElementById('editSavingPreview');

  if (popupSavingMode === 'duration') {
    const months = parseInt(document.getElementById('editSavingDuration').value) || 0;
    if (months > 0 && remaining > 0) {
      const monthly = Math.ceil(remaining / months);
      preview.classList.add('visible');
      document.getElementById('editSavingPreviewMain').textContent = `RM ${fmt(monthly)} / bulan`;
      document.getElementById('editSavingPreviewSub').textContent = `selama ${months} bulan untuk capai RM ${fmt(g.target)}`;
    } else {
      preview.classList.remove('visible');
    }
  } else {
    const monthly = parseFloat(document.getElementById('editSavingMonthly').value) || 0;
    if (monthly > 0 && remaining > 0) {
      const months = Math.ceil(remaining / monthly);
      const eta = new Date(); eta.setMonth(eta.getMonth() + months);
      preview.classList.add('visible');
      document.getElementById('editSavingPreviewMain').textContent = `${months} bulan`;
      document.getElementById('editSavingPreviewSub').textContent = `Anggaran selesai: ${eta.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })}`;
    } else {
      preview.classList.remove('visible');
    }
  }
}

async function saveEditGoalSaving() {
  const g = dashGoals.find(x => x.id === editSavingGoalId);
  if (!g || !window._fb) return;

  let updateData = { savingMode: popupSavingMode };

  if (popupSavingMode === 'duration') {
    const months = parseInt(document.getElementById('editSavingDuration').value);
    if (!months || months <= 0) { showToast('Sila masukkan bilangan bulan!', true); return; }
    updateData.savingDuration = months;
    updateData.monthlyAmount = null;
  } else {
    const monthly = parseFloat(document.getElementById('editSavingMonthly').value);
    if (!monthly || monthly <= 0) { showToast('Sila masukkan jumlah simpanan sebulan!', true); return; }
    updateData.monthlyAmount = monthly;
    updateData.savingDuration = null;
  }

  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db, 'users', window.currentUser.uid, 'goals', g.id), updateData);
  closePopup('popupEditGoalSaving');
  await loadDashboard();
  showToast('Pelan simpanan dikemas kini! ✅');
}

// ===== POPUP: ADD NEW GOAL (DASHBOARD) =====
function openNewGoalPopup() {
  document.getElementById('newGoalNamePopup').value = '';
  document.getElementById('newGoalTargetPopup').value = '';
  document.getElementById('newGoalDuration').value = '';
  document.getElementById('newGoalMonthly').value = '';
  popupGoalPriority = 'medium';
  popupSavingMode = 'duration';
  document.querySelectorAll('#newGoalPriorityPopup .p-btn').forEach(b => {
    b.classList.toggle('sel', b.classList.contains('medium'));
  });
  setNewGoalSavingMode('duration');
  document.getElementById('popupNewGoal').classList.add('visible');
}

function setPopupPriority(p) {
  popupGoalPriority = p;
  document.querySelectorAll('#newGoalPriorityPopup .p-btn').forEach(b => {
    b.classList.toggle('sel', b.classList.contains(p));
  });
}

function setNewGoalSavingMode(mode) {
  popupSavingMode = mode;
  document.querySelectorAll('#newGoalSavingToggle .saving-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.getElementById('newGoalDurationField').style.display = mode === 'duration' ? 'block' : 'none';
  document.getElementById('newGoalMonthlyField').style.display = mode === 'monthly' ? 'block' : 'none';
  updateNewGoalCalcPreview();
}

function updateNewGoalCalcPreview() {
  const target = parseFloat(document.getElementById('newGoalTargetPopup').value) || 0;
  const preview = document.getElementById('newGoalCalcPreview');

  if (popupSavingMode === 'duration') {
    const months = parseInt(document.getElementById('newGoalDuration').value) || 0;
    if (target > 0 && months > 0) {
      const monthly = Math.ceil(target / months);
      preview.classList.add('visible');
      document.getElementById('newGoalCalcMain').textContent = `RM ${fmt(monthly)} / bulan`;
      document.getElementById('newGoalCalcSub').textContent = `Simpan selama ${months} bulan untuk capai RM ${fmt(target)}`;
    } else {
      preview.classList.remove('visible');
    }
  } else {
    const monthly = parseFloat(document.getElementById('newGoalMonthly').value) || 0;
    if (target > 0 && monthly > 0) {
      const months = Math.ceil(target / monthly);
      const eta = new Date(); eta.setMonth(eta.getMonth() + months);
      preview.classList.add('visible');
      document.getElementById('newGoalCalcMain').textContent = `${months} bulan`;
      document.getElementById('newGoalCalcSub').textContent = `Selesai: ${eta.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })}`;
    } else {
      preview.classList.remove('visible');
    }
  }
}

async function saveDashGoal() {
  const name = document.getElementById('newGoalNamePopup').value.trim();
  const target = parseFloat(document.getElementById('newGoalTargetPopup').value);
  if (!name || !target || target <= 0) { showToast('Sila isi nama dan sasaran matlamat!', true); return; }

  let savingData = { savingMode: popupSavingMode };
  if (popupSavingMode === 'duration') {
    const months = parseInt(document.getElementById('newGoalDuration').value);
    if (!months || months <= 0) { showToast('Sila masukkan berapa bulan nak simpan!', true); return; }
    savingData.savingDuration = months;
    savingData.monthlyAmount = Math.ceil(target / months);
  } else {
    const monthly = parseFloat(document.getElementById('newGoalMonthly').value);
    if (!monthly || monthly <= 0) { showToast('Sila masukkan jumlah simpanan sebulan!', true); return; }
    savingData.monthlyAmount = monthly;
    savingData.savingDuration = Math.ceil(target / monthly);
  }

  if (!window._fb) return;
  const { db, collection, addDoc } = window._fb;
  await addDoc(collection(db, 'users', window.currentUser.uid, 'goals'), {
    name, target: round(target), priority: popupGoalPriority,
    saved: 0, completed: false, createdAt: Date.now(),
    ...savingData
  });
  closePopup('popupNewGoal');
  await loadDashboard();
  showToast('Matlamat baharu ditambah! 🎯');
}

// ===== POPUP: UPDATE GOAL SAVINGS =====
function openUpdateGoal(goalId) {
  const g = dashGoals.find(x => x.id === goalId);
  if (!g) return;
  activeUpdateGoalId = goalId;
  const inlineInput = document.getElementById('addSav-' + goalId);
  document.getElementById('updateAmount').value = inlineInput?.value || '';
  document.getElementById('updateGoalName').textContent = g.name;
  document.getElementById('updateCurrentSaving').textContent = 'RM ' + fmt(g.saved || 0);
  const pct = g.target > 0 ? Math.round((g.saved || 0) / g.target * 100) : 0;
  document.getElementById('updateProgressFill').style.width = pct + '%';
  document.getElementById('updateProgressPct').textContent = pct + '%';
  document.getElementById('updatePreview').style.display = 'none';
  document.getElementById('popupUpdateGoal').classList.add('visible');
}

function previewUpdate() {
  const g = dashGoals.find(x => x.id === activeUpdateGoalId);
  if (!g) return;
  const add = parseFloat(document.getElementById('updateAmount').value) || 0;
  if (add <= 0) { document.getElementById('updatePreview').style.display = 'none'; return; }
  const newSaved = (g.saved || 0) + add;
  const newPct = g.target > 0 ? Math.min(100, Math.round(newSaved / g.target * 100)) : 0;
  document.getElementById('updateAfterAmt').textContent = 'RM ' + fmt(newSaved);
  document.getElementById('updateAfterPct').textContent = newPct + '%';
  document.getElementById('updatePreview').style.display = 'block';
}

async function saveGoalUpdate() {
  const g = dashGoals.find(x => x.id === activeUpdateGoalId);
  if (!g || !window._fb) return;
  const add = parseFloat(document.getElementById('updateAmount').value) || 0;
  if (add <= 0) { showToast('Masukkan jumlah simpanan!', true); return; }
  const newSaved = (g.saved || 0) + add;
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db, 'users', window.currentUser.uid, 'goals', g.id), { saved: newSaved });
  g.saved = newSaved;
  closePopup('popupUpdateGoal');
  renderDashGoals();
  showToast(`+RM ${fmt(add)} disimpan untuk ${g.name}!`);
  if (newSaved >= g.target) setTimeout(() => markGoalComplete(g.id, true), 500);
}

async function markGoalComplete(goalId, auto = false) {
  const g = dashGoals.find(x => x.id === goalId);
  if (!g || !window._fb) return;
  const { db, doc, updateDoc } = window._fb;
  const completedAt = Date.now();
  const months = g.createdAt ? Math.max(1, Math.round((completedAt - g.createdAt) / (1000 * 60 * 60 * 24 * 30))) : 1;
  const monthlyAvg = round((g.saved || g.target) / months);
  await updateDoc(doc(db, 'users', window.currentUser.uid, 'goals', g.id), { completed: true, completedAt });
  document.getElementById('celebGoalName').textContent = g.name;
  document.getElementById('celebTarget').textContent = 'RM ' + fmt(g.target);
  document.getElementById('celebTime').textContent = months + ' bulan';
  document.getElementById('celebMonthly').textContent = 'RM ' + fmt(monthlyAvg);
  document.getElementById('popupCelebration').classList.add('visible');
  await loadDashboard();
}

function closeCelebration() { document.getElementById('popupCelebration').classList.remove('visible'); }

// ===== POPUP: EDIT PLAN =====
function openEditPlan() {
  const plan = window._currentPlan;
  editFormula = plan ? plan.formula : '50/30/20';
  document.getElementById('editIncomeInput').value = plan ? plan.income : '';
  document.getElementById('editCurrentIncome').textContent = plan ? fmt(plan.income) : '-';
  selectEditFormula(editFormula);
  if (plan?.freePct) {
    document.getElementById('ef-needs').value = plan.freePct.needs;
    document.getElementById('ef-wants').value = plan.freePct.wants;
    document.getElementById('ef-savings').value = plan.freePct.savings;
  }
  updateEditPlanPreview();
  document.getElementById('popupEditPlan').classList.add('visible');
}

function selectEditFormula(f) {
  editFormula = f;
  ['70/20/10', '50/30/20', 'free'].forEach(key => {
    const id = key === '70/20/10' ? 'ef-7020' : key === '50/30/20' ? 'ef-5030' : 'ef-free';
    document.getElementById(id).classList.toggle('selected', key === f);
  });
  document.getElementById('editFreeGrid').classList.toggle('hidden', f !== 'free');
  updateEditPlanPreview();
}

function getEditPct() {
  if (editFormula === 'free') {
    return {
      needs: parseFloat(document.getElementById('ef-needs').value) || 0,
      wants: parseFloat(document.getElementById('ef-wants').value) || 0,
      savings: parseFloat(document.getElementById('ef-savings').value) || 0
    };
  }
  return FORMULAS[editFormula];
}

function updateEditPlanPreview() {
  const inc = parseFloat(document.getElementById('editIncomeInput').value) || 0;
  const plan = window._currentPlan;
  const oldSavings = plan ? round(plan.income * (plan.formula === 'free' ? plan.freePct.savings : FORMULAS[plan.formula].savings) / 100) : 0;
  const pct = getEditPct();
  const newSavings = inc > 0 ? round(inc * (pct?.savings || 0) / 100) : 0;
  document.getElementById('epSavingsChange').textContent = oldSavings > 0
    ? `RM ${fmt(oldSavings)} → RM ${fmt(newSavings)}`
    : `RM ${fmt(newSavings)}`;
  document.getElementById('epSavingsChange').style.color = newSavings >= oldSavings ? '#3ecf6e' : '#f5b731';
}

async function saveEditPlan() {
  const inc = parseFloat(document.getElementById('editIncomeInput').value);
  if (!inc || inc <= 0) { showToast('Sila masukkan pendapatan!', true); return; }
  const pct = getEditPct();
  if (editFormula === 'free' && (pct.needs + pct.wants + pct.savings) !== 100) {
    showToast('Jumlah peratusan mesti 100%!', true); return;
  }
  const { db, doc, updateDoc } = window._fb;
  const planData = { income: round(inc), formula: editFormula };
  if (editFormula === 'free') planData.freePct = pct;
  planData.commitments = window._currentPlan?.commitments || [];
  await updateDoc(doc(db, 'users', window.currentUser.uid), { plan: planData });
  window._currentPlan = planData;
  closePopup('popupEditPlan');
  await loadDashboard();
  showToast('Pelan berjaya dikemas kini!');
}

function closePopup(id) { document.getElementById(id).classList.remove('visible'); }

// ===== SETTINGS =====
function showSettings() {
  document.getElementById('dashboardView').classList.remove('visible');
  document.getElementById('plannerView').style.display = 'none';
  document.getElementById('settingsView').classList.add('visible');
  const u = window.currentUser;
  const username = u.username || u.email.split('@')[0];
  const isTeamMember = u.isTeamMember === true;
  document.getElementById('settingsUsername').innerHTML = `${username} ${renderTeamBadge(isTeamMember)}`;
  document.getElementById('settingsEmail').textContent = u.email;
  document.getElementById('settingsAvatarUrl').value = u.avatarUrl || '';
  renderSettingsAvatar(u.avatarUrl, username);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSettingsAvatar(url, username) {
  const el = document.getElementById('settingsAvatarPreview');
  if (url) {
    el.innerHTML = `<img src="${url}" onerror="this.parentElement.textContent='${(username || 'U')[0].toUpperCase()}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
  } else {
    el.textContent = (username || 'U')[0].toUpperCase();
  }
}

function previewSettingsAvatar() {
  const url = document.getElementById('settingsAvatarUrl').value.trim();
  const u = window.currentUser;
  renderSettingsAvatar(url, u ? (u.username || u.email.split('@')[0]) : 'U');
}

async function saveAvatar() {
  const url = document.getElementById('settingsAvatarUrl').value.trim();
  if (!window.currentUser || !window._fb) return;
  const { db, doc, updateDoc } = window._fb;
  await updateDoc(doc(db, 'users', window.currentUser.uid), { avatarUrl: url });
  window.currentUser.avatarUrl = url;
  const username = window.currentUser.username || window.currentUser.email.split('@')[0];
  const initial = username[0].toUpperCase();
  ['headerAvatar', 'sidePanelAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (url) el.innerHTML = `<img src="${url}" onerror="this.parentElement.textContent='${initial}'" />`;
    else el.textContent = initial;
  });
  showToast('Gambar profil dikemas kini!');
}

async function changePassword() {
  const oldPw = document.getElementById('settingsOldPw').value;
  const newPw = document.getElementById('settingsNewPw').value;
  const confirmPw = document.getElementById('settingsConfirmPw').value;
  if (!oldPw || !newPw || !confirmPw) { showToast('Sila isi semua ruangan kata laluan.', true); return; }
  if (newPw !== confirmPw) { showToast('Kata laluan baharu tidak sepadan!', true); return; }
  if (newPw.length < 6) { showToast('Kata laluan mesti sekurang-kurangnya 6 aksara.', true); return; }
  try {
    const { auth, reauthenticateWithCredential, EmailAuthProvider, updatePassword } = window._fb;
    const user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, oldPw);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPw);
    ['settingsOldPw', 'settingsNewPw', 'settingsConfirmPw'].forEach(id => document.getElementById(id).value = '');
    showToast('Kata laluan berjaya ditukar!');
  } catch (e) {
    showToast(e.code === 'auth/wrong-password' ? 'Kata laluan lama tidak betul.' : 'Ralat: ' + e.message, true);
  }
}

async function doLogout() {
  closeMenu();
  if (window._fb) await window._fb.signOut(window._fb.auth);
}

// ===== DELETE ACCOUNT =====
function openDeleteAccountPopup() {
  document.getElementById('deleteAccountPw').value = '';
  const btn = document.getElementById('btnConfirmDelete');
  btn.disabled = false; btn.textContent = 'Padam Akaun';
  document.getElementById('popupDeleteAccount').classList.add('visible');
}

async function doDeleteAccount() {
  const pw = document.getElementById('deleteAccountPw').value;
  if (!pw) { showToast('Sila masukkan kata laluan untuk sahkan.', true); return; }
  const btn = document.getElementById('btnConfirmDelete');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Memproses...';
  try {
    const { auth, db, reauthenticateWithCredential, EmailAuthProvider, doc, deleteDoc, collection, getDocs } = window._fb;
    const user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, pw);
    await reauthenticateWithCredential(user, cred);
    const uid = user.uid;
    const goalsSnap = await getDocs(collection(db, 'users', uid, 'goals'));
    for (const d of goalsSnap.docs) await deleteDoc(doc(db, 'users', uid, 'goals', d.id));
    await deleteDoc(doc(db, 'users', uid));
    await user.delete();
    closePopup('popupDeleteAccount');
    showToast('Akaun berjaya dipadam. Jumpa lagi! 👋');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Padam Akaun';
    showToast((e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') ? 'Kata laluan tidak betul.' : 'Ralat: ' + e.message, true);
  }
}

// ===== AUTH MODAL =====
let currentAuthTab = 'login';

function openAuthModal() { document.getElementById('authModal').classList.add('visible'); }
function closeAuthModal() { document.getElementById('authModal').classList.remove('visible'); clearAuthMessages(); }

function switchAuthTab(tab) {
  currentAuthTab = tab;
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogMasuk').classList.toggle('active', tab === 'login');
  document.getElementById('tabDaftar').classList.toggle('active', tab === 'register');
  clearAuthMessages();
}

function clearAuthMessages() {
  ['authError', 'authSuccess'].forEach(id => {
    const el = document.getElementById(id); el.style.display = 'none'; el.textContent = '';
  });
}

function showAuthError(msg) {
  const el = document.getElementById('authError'); el.textContent = msg; el.style.display = 'block';
  document.getElementById('authSuccess').style.display = 'none';
}

function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess'); el.textContent = msg; el.style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

function setAuthLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>Sila tunggu...` : label;
}

function translateAuthError(code) {
  const map = {
    'auth/user-not-found': 'Nama pengguna atau e-mel tidak dijumpai.',
    'auth/wrong-password': 'Kata laluan salah.',
    'auth/email-already-in-use': 'E-mel sudah didaftarkan.',
    'auth/weak-password': 'Kata laluan terlalu lemah (minimum 6 aksara).',
    'auth/invalid-email': 'Format e-mel tidak sah.',
    'auth/too-many-requests': 'Terlalu banyak percubaan. Cuba lagi kemudian.',
    'auth/invalid-credential': 'Nama pengguna/e-mel atau kata laluan tidak betul.',
  };
  return map[code] || 'Ralat berlaku. Cuba lagi.';
}

async function doLogin() {
  const input = document.getElementById('loginEmailOrUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!input || !password) { showAuthError('Sila isi semua ruangan.'); return; }
  setAuthLoading('btnLogin', true, 'Log Masuk');
  clearAuthMessages();
  try {
    const { auth, db, signInWithEmailAndPassword, collection, getDocs, query, where } = window._fb;
    let email = input;
    if (!input.includes('@')) {
      const snap = await getDocs(query(collection(db, 'users'), where('username', '==', input)));
      if (!snap.empty) { email = snap.docs[0].data().email; }
      else { showAuthError('Nama pengguna atau e-mel tidak dijumpai.'); setAuthLoading('btnLogin', false, 'Log Masuk'); return; }
    }
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    showAuthError((e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
      ? 'Nama pengguna/e-mel atau kata laluan tidak betul.'
      : translateAuthError(e.code));
  }
  setAuthLoading('btnLogin', false, 'Log Masuk');
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  if (!username || !email || !password || !confirm) { showAuthError('Sila isi semua ruangan.'); return; }
  if (password !== confirm) { showAuthError('Kata laluan tidak sepadan.'); return; }
  if (password.length < 6) { showAuthError('Kata laluan mesti sekurang-kurangnya 6 aksara.'); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { showAuthError('Nama pengguna hanya boleh mengandungi huruf, nombor, dan _'); return; }
  setAuthLoading('btnRegister', true, 'Daftar Sekarang');
  clearAuthMessages();
  try {
    const { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, doc, setDoc, collection, addDoc, getDocs, query, where } = window._fb;
    const usnSnap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!usnSnap.empty) { showAuthError(`Nama pengguna "${username}" sudah diambil.`); setAuthLoading('btnRegister', false, 'Daftar Sekarang'); return; }
    const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
    if (!emailSnap.empty) { showAuthError('E-mel ini sudah berdaftar. Cuba log masuk.'); setAuthLoading('btnRegister', false, 'Daftar Sekarang'); return; }

    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, email, password); }
    catch (e) {
      if (e.code === 'auth/email-already-in-use') cred = await signInWithEmailAndPassword(auth, email, password);
      else throw e;
    }

    const planData = { income: round(getIncome()), formula: selectedFormula, commitments: commitments.map(c => ({ name: c.name, amount: c.amount })) };
    if (selectedFormula === 'free') planData.freePct = getPct();
    await setDoc(doc(db, 'users', cred.user.uid), { username, email, createdAt: Date.now(), plan: planData });
    for (const g of goals) {
      await addDoc(collection(db, 'users', cred.user.uid, 'goals'), {
        name: g.name, target: g.target, priority: g.priority,
        saved: 0, completed: false, createdAt: Date.now(),
        savingMode: g.savingMode || 'duration',
        savingDuration: g.savingDuration || null,
        monthlyAmount: g.monthlyAmount || null
      });
    }
    commitments = []; goals = []; currentStep = 1;
    showAuthSuccess('Daftar berjaya! Pelan anda telah disimpan.');
    setTimeout(() => closeAuthModal(), 1500);
  } catch (e) { showAuthError(translateAuthError(e.code)); }
  setAuthLoading('btnRegister', false, 'Daftar Sekarang');
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

// ===== SAVE PLAN FROM PLANNER =====
async function savePlanToFirebase() {
  if (!window.currentUser || !window._fb) return;
  const { db, doc, setDoc, collection, addDoc } = window._fb;
  const pct = getPct();
  const planData = { income: round(getIncome()), formula: selectedFormula, commitments, freePct: selectedFormula === 'free' ? pct : null };
  await setDoc(doc(db, 'users', window.currentUser.uid), { plan: planData }, { merge: true });
  for (const g of goals) {
    await addDoc(collection(db, 'users', window.currentUser.uid, 'goals'), {
      name: g.name, target: g.target, priority: g.priority,
      saved: 0, completed: false, createdAt: Date.now(),
      savingMode: g.savingMode || 'duration',
      savingDuration: g.savingDuration || null,
      monthlyAmount: g.monthlyAmount || null
    });
  }
  window._currentPlan = planData;
  goals = []; commitments = []; currentStep = 1;
  showToast('Pelan berjaya disimpan!');
  setTimeout(() => showDashboard(), 1000);
}

// ===== PLANNER WIZARD =====
function getIncome() { return parseFloat(document.getElementById('incomeInput').value) || 0; }
function getPct() {
  if (selectedFormula === 'free') {
    return {
      needs: parseFloat(document.getElementById('freeNeeds').value) || 0,
      wants: parseFloat(document.getElementById('freeWants').value) || 0,
      savings: parseFloat(document.getElementById('freeSavings').value) || 0
    };
  }
  return FORMULAS[selectedFormula];
}

function updateAllPreviews() {
  if (selectedFormula === 'free') updateFreeFormula();
  else updateFormulaBreakdown();
}

function renderSteps() {
  const container = document.getElementById('stepsContainer');
  const labelsContainer = document.getElementById('stepsLabels');
  container.innerHTML = ''; labelsContainer.innerHTML = '';
  const stepNames = ['Pendapatan', 'Formula', 'Komitmen', 'Matlamat', 'Keputusan'];
  for (let s = 1; s <= 5; s++) {
    const dot = document.createElement('div');
    dot.className = 'step-dot' + (s === currentStep ? ' active' : s < currentStep ? ' done' : '');
    dot.textContent = s < currentStep ? '✓' : s;
    container.appendChild(dot);
    if (s < 5) { const line = document.createElement('div'); line.className = 'step-line' + (s < currentStep ? ' done' : ''); container.appendChild(line); }
  }
  for (let s = 0; s < stepNames.length; s++) {
    const lw = document.createElement('div'); lw.className = 'step-label-wrapper';
    const ls = document.createElement('span');
    ls.className = 'step-label-text' + (s + 1 === currentStep ? ' active' : s + 1 < currentStep ? ' done' : '');
    ls.textContent = stepNames[s];
    lw.appendChild(ls); labelsContainer.appendChild(lw);
    if (s < stepNames.length - 1) { const sp = document.createElement('div'); sp.className = 'step-label-spacer'; labelsContainer.appendChild(sp); }
  }
}

function goToStep(n) {
  if (n === 2 && getIncome() <= 0) { alert('Sila masukkan pendapatan dahulu!'); return; }
  if (n === 5) { calcResults(); return; }
  document.getElementById('step' + currentStep).classList.add('hidden');
  currentStep = n;
  document.getElementById('step' + currentStep).classList.remove('hidden');
  renderSteps();
  if (n === 2) updateAllPreviews();
  if (n === 3) updateCommitUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateIncomePreview() {
  const inc = getIncome();
  const preview = document.getElementById('incomePreview');
  if (inc > 0) { preview.style.display = ''; document.getElementById('incomePreviewAmt').textContent = 'RM ' + fmt(inc); }
  else preview.style.display = 'none';
}

function selectFormula(f) {
  selectedFormula = f;
  ['70/20/10', '50/30/20', 'free'].forEach(key => {
    const id = key === '70/20/10' ? 'f-7020' : key === '50/30/20' ? 'f-5030' : 'f-free';
    document.getElementById(id).classList.toggle('selected', key === f);
  });
  const freeModeDiv = document.getElementById('freeMode');
  const breakdownDiv = document.getElementById('formulaBreakdown');
  if (f === 'free') { freeModeDiv.classList.remove('hidden'); breakdownDiv.classList.add('hidden'); updateFreeFormula(); }
  else { freeModeDiv.classList.add('hidden'); breakdownDiv.classList.remove('hidden'); updateFormulaBreakdown(); }
}

function updateFormulaBreakdown() {
  const inc = getIncome(); if (inc === 0) return;
  const pct = getPct();
  document.getElementById('needsAmt').textContent = 'RM ' + fmt(round(inc * pct.needs / 100));
  document.getElementById('wantsAmt').textContent = 'RM ' + fmt(round(inc * pct.wants / 100));
  document.getElementById('savingsAmt').textContent = 'RM ' + fmt(round(inc * pct.savings / 100));
}

function updateFreeFormula() {
  const needs = parseFloat(document.getElementById('freeNeeds').value) || 0;
  const wants = parseFloat(document.getElementById('freeWants').value) || 0;
  const savings = parseFloat(document.getElementById('freeSavings').value) || 0;
  const total = needs + wants + savings;
  const warn = document.getElementById('freeTotalWarning');
  if (total !== 100) { warn.classList.remove('hidden'); warn.textContent = `⚠️ Jumlah peratusan mesti 100%. Sekarang: ${total}%.`; }
  else { warn.classList.add('hidden'); }
  const inc = getIncome();
  if (inc > 0) {
    document.getElementById('freeNeedsAmount').textContent = 'RM ' + fmt(round(inc * needs / 100));
    document.getElementById('freeWantsAmount').textContent = 'RM ' + fmt(round(inc * wants / 100));
    document.getElementById('freeSavingsAmount').textContent = 'RM ' + fmt(round(inc * savings / 100));
  }
}

function updateCommitUI() {
  const list = document.getElementById('commitmentList'); list.innerHTML = '';
  let total = 0;
  commitments.forEach(c => {
    total += c.amount;
    const div = document.createElement('div'); div.className = 'commitment-item';
    div.innerHTML = `<span class="commitment-name">${c.name}</span><span class="commitment-amount">RM ${fmt(c.amount)}</span><button class="btn-remove" onclick="removeCommitment(${c.id})">✕</button>`;
    list.appendChild(div);
  });
  const totalRow = document.getElementById('commitTotal');
  if (commitments.length > 0) { totalRow.classList.remove('hidden'); document.getElementById('commitTotalAmt').textContent = 'RM ' + fmt(total); }
  else totalRow.classList.add('hidden');
  const pct = getPct();
  const savingsAmt = round(getIncome() * (pct.savings || 0) / 100);
  const warn = document.getElementById('commitWarning');
  if (total > savingsAmt && savingsAmt > 0) {
    warn.classList.remove('hidden');
    warn.textContent = `⚠️ Komitmen (RM ${fmt(total)}) melebihi peruntukan simpanan (RM ${fmt(savingsAmt)}).`;
  } else warn.classList.add('hidden');
}

function addCommitment() {
  const name = document.getElementById('commitName').value.trim();
  const amt = parseFloat(document.getElementById('commitAmt').value);
  if (!name || !amt || amt <= 0) return;
  commitments.push({ id: Date.now(), name, amount: round(amt) });
  document.getElementById('commitName').value = '';
  document.getElementById('commitAmt').value = '';
  updateCommitUI();
}

function removeCommitment(id) { commitments = commitments.filter(c => c.id !== id); updateCommitUI(); }

function setNewPriority(p) {
  newGoalPriority = p;
  document.querySelectorAll('#newGoalPriorityPlanner .p-btn').forEach(btn => {
    btn.classList.toggle('sel', btn.classList.contains(p));
  });
}

// NEW: planner saving mode toggle
function setPlannerSavingMode(mode) {
  plannerSavingMode = mode;
  document.querySelectorAll('#plannerSavingModeToggle .planner-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.getElementById('plannerDurationField').style.display = mode === 'duration' ? 'block' : 'none';
  document.getElementById('plannerMonthlyField').style.display = mode === 'monthly' ? 'block' : 'none';
  updatePlannerGoalPreview();
}

function updatePlannerGoalPreview() {
  const target = parseFloat(document.getElementById('goalTarget').value) || 0;
  const preview = document.getElementById('plannerCalcPreview');

  if (plannerSavingMode === 'duration') {
    const months = parseInt(document.getElementById('goalDuration').value) || 0;
    if (target > 0 && months > 0) {
      const monthly = Math.ceil(target / months);
      preview.classList.add('visible');
      document.getElementById('plannerCalcMain').textContent = `RM ${fmt(monthly)} / bulan`;
      document.getElementById('plannerCalcSub').textContent = `Simpan selama ${months} bulan`;
    } else preview.classList.remove('visible');
  } else {
    const monthly = parseFloat(document.getElementById('goalMonthly').value) || 0;
    if (target > 0 && monthly > 0) {
      const months = Math.ceil(target / monthly);
      const eta = new Date(); eta.setMonth(eta.getMonth() + months);
      preview.classList.add('visible');
      document.getElementById('plannerCalcMain').textContent = `${months} bulan`;
      document.getElementById('plannerCalcSub').textContent = `Selesai: ${eta.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })}`;
    } else preview.classList.remove('visible');
  }
}

function addGoal() {
  const name = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  if (!name || !target || target <= 0) return;

  let savingDuration = null, monthlyAmount = null;
  if (plannerSavingMode === 'duration') {
    savingDuration = parseInt(document.getElementById('goalDuration').value) || null;
    if (!savingDuration) { showToast('Sila masukkan berapa bulan!', true); return; }
    monthlyAmount = Math.ceil(target / savingDuration);
  } else {
    monthlyAmount = parseFloat(document.getElementById('goalMonthly').value) || null;
    if (!monthlyAmount) { showToast('Sila masukkan jumlah sebulan!', true); return; }
    savingDuration = Math.ceil(target / monthlyAmount);
  }

  goals.push({
    id: Date.now(), name, target: round(target), priority: newGoalPriority,
    savingMode: plannerSavingMode, savingDuration, monthlyAmount
  });
  document.getElementById('goalName').value = '';
  document.getElementById('goalTarget').value = '';
  document.getElementById('goalDuration').value = '';
  document.getElementById('goalMonthly').value = '';
  document.getElementById('plannerCalcPreview').classList.remove('visible');
  renderGoalList();
}

function removeGoal(id) { goals = goals.filter(g => g.id !== id); renderGoalList(); }

function renderGoalList() {
  const list = document.getElementById('goalList'); list.innerHTML = '';
  goals.forEach(g => {
    const div = document.createElement('div'); div.className = 'goal-item';
    const savingInfo = g.savingMode === 'duration'
      ? `Simpan <b style="color:#3ecf6e;font-family:'Space Mono',monospace">RM ${fmt(g.monthlyAmount)}/bulan</b> × ${g.savingDuration} bulan`
      : `Simpan <b style="color:#3ecf6e;font-family:'Space Mono',monospace">RM ${fmt(g.monthlyAmount)}/bulan</b> → ${g.savingDuration} bulan`;
    div.innerHTML = `
      <div class="goal-header">
        <div class="goal-name-display">${g.name}</div>
        <span class="priority-badge priority-${g.priority}">${g.priority}</span>
        <button class="btn-remove" onclick="removeGoal(${g.id})">✕</button>
      </div>
      <div style="font-size:12px;color:#5a7a60;margin-bottom:4px">🎯 Sasaran: <b style="color:#c5d9c8;font-family:'Space Mono',monospace">RM ${fmt(g.target)}</b></div>
      <div class="goal-saving-summary">${savingInfo}</div>`;
    list.appendChild(div);
  });
}

function calcResults() {
  const inc = getIncome();
  const pct = getPct();
  const savingsAmt = round(inc * (pct.savings || 0) / 100);
  const totalCommit = commitments.reduce((s, c) => s + c.amount, 0);
  const needsAmt = round(inc * pct.needs / 100);
  const wantsAmt = round(inc * pct.wants / 100);
  const sorted = [...goals].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));

  let budgetHtml = `
    <div class="results-summary">
      <div class="results-label">Simpanan Bulanan Tersedia</div>
      <div class="results-amount">RM ${fmt(savingsAmt)}</div>
      <div class="results-sub">${pct.savings}% daripada RM ${fmt(inc)} pendapatan anda</div>
    </div>
    <div class="card-title" style="margin-bottom:12px">💼 Pecahan Bajet</div>
    <div style="background:#0a1410;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <div class="budget-row"><span class="budget-row-label">💼 Pendapatan</span><span class="budget-row-amount">RM ${fmt(inc)}</span></div>
      <div class="budget-row"><span class="budget-row-label">🏠 Keperluan (${pct.needs}%)</span><span class="budget-row-amount">RM ${fmt(needsAmt)}</span></div>
      <div class="budget-row"><span class="budget-row-label">🎮 Kehendak (${pct.wants}%)</span><span class="budget-row-amount">RM ${fmt(wantsAmt)}</span></div>
      <div class="budget-row"><span class="budget-row-label">💰 Simpanan (${pct.savings}%)</span><span class="budget-row-amount" style="color:#3ecf6e">RM ${fmt(savingsAmt)}</span></div>
      ${totalCommit > 0 ? `<div class="budget-row"><span class="budget-row-label">📋 Jumlah Komitmen</span><span class="budget-row-amount" style="color:#f5b731">RM ${fmt(totalCommit)}</span></div>` : ''}
    </div>`;

  let goalsHtml = '';
  if (sorted.length > 0) {
    goalsHtml += `<div class="section-title">🎯 Pecahan Matlamat</div>`;
    sorted.forEach(g => {
      const durStr = g.savingDuration >= 12
        ? `${Math.floor(g.savingDuration / 12)} thn${g.savingDuration % 12 > 0 ? ' ' + g.savingDuration % 12 + ' bln' : ''}`
        : `${g.savingDuration} bln`;
      const eta = new Date(); eta.setMonth(eta.getMonth() + (g.savingDuration || 0));
      const etaStr = g.savingDuration > 0 ? eta.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' }) : '-';
      goalsHtml += `
        <div class="goal-result-card ${g.priority}">
          <div class="goal-result-header">
            <div>
              <div class="goal-result-name">${g.name}</div>
              <div class="goal-result-target">Sasaran: RM ${fmt(g.target)}</div>
            </div>
            <span class="priority-badge priority-${g.priority}">${g.priority}</span>
          </div>
          <div class="progress-bar-result"><div class="progress-fill-result" style="width:5%"></div></div>
          <div class="goal-result-stats">
            <div class="stat-box"><div class="stat-label">Simpan/Bulan</div><div class="stat-value">RM ${fmt(g.monthlyAmount)}</div></div>
            <div class="stat-box"><div class="stat-label">Tempoh</div><div class="stat-value">${durStr}</div></div>
            <div class="stat-box"><div class="stat-label">Selesai</div><div class="stat-value">${etaStr}</div></div>
          </div>
        </div>`;
    });
  }

  const isLoggedIn = !!window.currentUser;
  const bannerHtml = !isLoggedIn
    ? `<div class="save-plan-banner"><div class="save-plan-text">💡 <b>Log masuk untuk simpan pelan</b> &amp; jejak kemajuan!</div><button class="btn-save-plan" onclick="openAuthModal()">Log Masuk / Daftar</button></div>`
    : `<div class="save-plan-banner" style="cursor:pointer" onclick="savePlanToFirebase()"><div class="save-plan-text">💾 <b>Simpan pelan ini</b> ke akaun anda!</div><button class="btn-save-plan">Simpan Pelan</button></div>`;

  const warningHtml = totalCommit > 0
    ? `<div class="warning-box" style="margin-top:16px">💡 Komitmen bulanan RM ${fmt(totalCommit)} telah dikira sebagai sebahagian daripada perbelanjaan keperluan anda.</div>` : '';

  document.getElementById('resultsContent').innerHTML = budgetHtml + goalsHtml + bannerHtml + warningHtml;
  document.getElementById('step' + currentStep).classList.add('hidden');
  currentStep = 5;
  document.getElementById('step5').classList.remove('hidden');
  renderSteps();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart() {
  commitments = []; goals = [];
  ['incomeInput', 'commitName', 'commitAmt', 'goalName', 'goalTarget', 'goalDuration', 'goalMonthly'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('freeNeeds').value = '50';
  document.getElementById('freeWants').value = '30';
  document.getElementById('freeSavings').value = '20';
  updateIncomePreview(); renderGoalList(); updateCommitUI(); selectFormula('50/30/20');
  document.getElementById('step' + currentStep).classList.add('hidden');
  currentStep = 1;
  document.getElementById('step1').classList.remove('hidden');
  renderSteps();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== INIT =====
renderSteps();
updateAllPreviews();
