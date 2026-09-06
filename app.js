import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let lessons = [];
let progress = new Map();
let timerInterval = null;
let currentUser = null;

const $ = (id) => document.getElementById(id);
const loading = $("loading"), loginView = $("loginView"), appView = $("appView");

function showToast(message) {
  const t = $("toast"); t.textContent = message; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function loadLessons() {
  const res = await fetch("./lessons.json", { cache: "no-store" });
  lessons = await res.json();
  const phases = [...new Set(lessons.map(x => x.phase))];
  $("phaseFilter").innerHTML = '<option value="">كل المراحل</option>' +
    phases.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600) % 24, d = Math.floor(total / 86400);
  return [d,h,m,s].map(n => String(n).padStart(2,"0")).join(" : ");
}

function startTimer(sinceMs) {
  clearInterval(timerInterval);
  const render = () => $("timer").textContent = formatDuration(Date.now() - sinceMs);
  render(); timerInterval = setInterval(render, 1000);
  $("soberSinceText").textContent = "البداية: " + new Date(sinceMs).toLocaleString("ar-DZ");
}

async function ensureUserDoc(user) {
  const refUser = doc(db, "users", user.uid);
  const snap = await getDoc(refUser);
  if (!snap.exists()) {
    await setDoc(refUser, {
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      soberSince: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  const fresh = await getDoc(refUser);
  const data = fresh.data() || {};
  startTimer(Number(data.soberSince || Date.now()));
}

function subscribeProgress() {
  const q = query(collection(db, "users", currentUser.uid, "progress"), orderBy("completedAt", "desc"));
  return onSnapshot(q, snap => {
    progress.clear();
    snap.forEach(d => progress.set(d.id, d.data()));
    renderStats();
    renderLessons();
  });
}

function renderStats() {
  const completed = lessons.filter(l => progress.get(l.id)?.completed).length;
  const pct = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  $("completedCount")?.textContent = completed;
  $("dashCompleted").textContent = completed;
  $("progressPercent").textContent = pct + "%";
  const next = lessons.find(l => !progress.get(l.id)?.completed);
  $("nextLesson").textContent = next ? next.lessonNumber : "✓";
  $("nextLessonTitle").textContent = next ? next.title : "أكملت جميع الدروس";
  const ring = $("progressRing");
  if (ring) ring.style.background = `conic-gradient(var(--accent) ${pct * 3.6}deg, #e9ece8 0deg)`;
  const continueBtn = $("continueBtn");
  if (continueBtn) {
    continueBtn.disabled = !next;
    continueBtn.dataset.lessonId = next?.id || "";
    continueBtn.innerHTML = next ? 'ابدأ الدرس <span>←</span>' : 'اكتمل المسار';
  }
}
function filteredLessons() {
  const search = $("searchInput").value.trim().toLowerCase();
  const phase = $("phaseFilter").value;
  return lessons.filter(l => {
    const matchesSearch = !search || l.title.toLowerCase().includes(search) ||
      String(l.lessonNumber).includes(search) || String(l.originalNumber).includes(search);
    return matchesSearch && (!phase || l.phase === phase);
  });
}

function renderLessons() {
  const list = $("lessonsList");
  const items = filteredLessons();
  if (!items.length) { list.innerHTML = '<div class="empty">لا توجد نتائج.</div>'; return; }

  let lastPhase = "";
  list.innerHTML = items.map(l => {
    const done = progress.get(l.id)?.completed;
    const phaseHeader = l.phase !== lastPhase ? `<div class="phase-title">${escapeHtml(l.phase)}</div>` : "";
    lastPhase = l.phase;
    return phaseHeader + `
      <article class="lesson ${done ? "done" : ""}">
        <button class="check ${done ? "checked" : ""}" data-action="toggle" data-id="${l.id}" aria-label="إكمال الدرس">${done ? "✓" : ""}</button>
        <div class="lesson-main">
          <div class="lesson-numbers"><span>الدرس ${l.lessonNumber}</span><span>الرقم الأصلي ${l.originalNumber}</span></div>
          <h4>${escapeHtml(l.title)}</h4>
          <div class="lesson-actions">
            <a href="${escapeHtml(l.youtubeUrl)}" target="_blank" rel="noopener">▶ YouTube</a>
            <button class="pdf-btn" data-action="pdf" data-id="${escapeHtml(l.id)}">📄 PDF</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

async function toggleLesson(id) {
  const lesson = lessons.find(l => l.id === id);
  const done = progress.get(id)?.completed;
  await setDoc(doc(db, "users", currentUser.uid, "progress", id), {
    completed: !done,
    completedAt: !done ? serverTimestamp() : null,
    lessonNumber: lesson.lessonNumber,
    originalNumber: lesson.originalNumber,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function openPdf(lesson) {
  try {
    // PDF files are hosted on Google Drive for now.
    // The Firestore document is lessons/lesson1, lessons/lesson2, etc.
    const snap = await getDoc(doc(db, "lessons", `lesson${lesson.lessonNumber}`));
    if (!snap.exists()) {
      showToast("ملف الـ PDF غير متوفر لهذا الدرس بعد.");
      return;
    }

    const data = snap.data() || {};
    if (!data.pdfUrl) {
      showToast("رابط الـ PDF غير موجود لهذا الدرس.");
      return;
    }

    $("pdfModalTitle").textContent = data.title || lesson.title || `الدرس ${lesson.lessonNumber}`;
    $("pdfFrame").src = data.pdfUrl;
    $("pdfModal").classList.remove("hidden");
    document.body.classList.add("pdf-open");
  } catch (e) {
    console.error(e);
    showToast("تعذر تحميل ملف الـ PDF.");
  }
}

function closePdf() {
  $("pdfFrame").src = "about:blank";
  $("pdfModal").classList.add("hidden");
  document.body.classList.remove("pdf-open");
}


$("googleLogin").addEventListener("click", async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error(e); showToast("تعذر تسجيل الدخول. تأكد من إعداد Google Auth."); }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));

$("resetTimer").addEventListener("click", async () => {
  if (!confirm("هل تريد فعلاً إعادة ضبط المؤقت والبدء من الآن؟")) return;
  await updateDoc(doc(db, "users", currentUser.uid), { soberSince: Date.now(), updatedAt: serverTimestamp() });
  startTimer(Date.now());
  showToast("تمت إعادة ضبط المؤقت.");
});



$("searchInput").addEventListener("input", renderLessons);
$("phaseFilter").addEventListener("change", renderLessons);
$("closePdf").addEventListener("click", closePdf);
$("pdfModal").addEventListener("click", e => {
  if (e.target.dataset.action === "close-pdf") closePdf();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("pdfModal").classList.contains("hidden")) closePdf();
});

$("lessonsList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "toggle") await toggleLesson(btn.dataset.id);
  if (btn.dataset.action === "pdf") {
    const lesson = lessons.find(l => l.id === btn.dataset.id);
    if (lesson) await openPdf(lesson);
  }
});

function setupInterface() {
  const today = new Date();
  $("todayDate").textContent = today.toLocaleDateString("ar-DZ", { weekday:"long", day:"numeric", month:"long" });
  const continueBtn = $("continueBtn");
  continueBtn?.addEventListener("click", () => {
    const id = continueBtn.dataset.lessonId;
    if (!id) return;
    document.querySelector('[data-tab="lessons"]')?.click();
    setTimeout(() => document.querySelector(`.lesson [data-id="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}), 100);
  });
  $("topHome")?.addEventListener("click", e => { e.preventDefault(); document.querySelector('.tab[data-tab="dashboard"]')?.click(); window.scrollTo({top:0,behavior:"smooth"}); });
  $("mobileLogout")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === btn.dataset.tab));
    document.querySelectorAll(".tab-content").forEach(x => x.classList.add("hidden"));
    $(`${btn.dataset.tab}Tab`).classList.remove("hidden");
    window.scrollTo({top:0,behavior:"smooth"});
  }));
}
setupInterface();

onAuthStateChanged(auth, async user => {
  loading.classList.add("hidden");
  if (!user) {
    currentUser = null; clearInterval(timerInterval);
    loginView.classList.remove("hidden"); appView.classList.add("hidden"); return;
  }
  currentUser = user;
  $("userName").textContent = user.displayName || user.email || ""; $("welcomeName").textContent = (user.displayName || "بك").split(" ")[0];
  $("userPhoto").src = user.photoURL || "";
  loginView.classList.add("hidden"); appView.classList.remove("hidden");
  try {
    await ensureUserDoc(user);
    subscribeProgress();
  } catch (e) {
    console.error(e); showToast("تحقق من إعداد Firestore.");
  }
});

await loadLessons();
