import { firebaseConfig, contact } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, limit, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- أدوات ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString("ar-EG") : "الآن");
const fmtMoney = (n) => Number(n || 0).toLocaleString("ar-EG");
const show = (el, display = "flex") => { el.classList.remove("hidden"); if (display) el.classList.add(display); };
const hide = (el, display = "flex") => { el.classList.add("hidden"); if (display) el.classList.remove(display); };

let toastTimer;
function toast(msg) {
  $("toastMsg").textContent = msg;
  show($("toast"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide($("toast")), 3500);
}

/* ---------- Firebase ---------- */
const configured = !firebaseConfig.apiKey.startsWith("PASTE");
let auth, db;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  $("configBanner").classList.remove("hidden");
}

let user = null;
let isAdmin = false;
let viewUid = null;            // العميل المعروض في تبويب حسابي
let unsubs = {};               // مستمعات Firestore
const stop = (k) => { if (unsubs[k]) { unsubs[k](); delete unsubs[k]; } };

/* ---------- التبويبات ---------- */
function switchTab(id) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  $(`tab-${id}`).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const on = b.dataset.tab === id;
    b.classList.toggle("text-brand-600", on);
    b.classList.toggle("text-slate-400", !on);
  });
  window.scrollTo(0, 0);
}
document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
switchTab("education");

/* ---------- مخططات اللف ---------- */
const diagramData = {
  "24_3phase": {
    title: "مخطط لف 24 مجرى (3 فاز) - 4 أقطاب (1400 RPM)",
    desc: "<b>نوع التوصيل:</b> متداخل أو متجاور (سلسلة).<br><b>خطوة اللف:</b> 1-6 / 1-8.<br><b>عدد المجموعات:</b> 6 مجموعات لكل فاز مجموعتان.<br><b>التوصيل الداخلي:</b> بداية بـ بداية أو نهاية بـ نهاية حسب الاتجاه.",
    slots: 24, span: 4,
  },
  "24_1phase": {
    title: "مخطط لف 24 مجرى (1 فاز) - ملفات تقويم وتشغيل",
    desc: "<b>التشغيل:</b> 2/3 المجاري بخطوة 1-6، 1-8.<br><b>التقويم:</b> 1/3 المجاري بخطوة 1-8.<br><b>مكثف البدء:</b> يتم التوصيل على التوالي مع ملفات التقويم ومفتاح الطرد المركزي.",
    slots: 24, span: 4,
  },
  "36_3phase": {
    title: "مخطط لف 36 مجرى (3 فاز) - 6 أقطاب (900 RPM)",
    desc: "<b>خطوة اللف:</b> 1-5 / 1-7 / 1-9.<br><b>عدد المجموعات:</b> 9 مجموعات متداخلة.<br><b>الاستخدام:</b> للمعدات الثقيلة والسيور الناقلة ذات العزم العالي.",
    slots: 36, span: 5,
  },
  spec_table: {
    title: "جدول تقريبي لأقطار السلك حسب قدرة المحرك (380V)",
    desc: "<b>- 5.5 حصان (4KW):</b> سلك 0.85 مم - توصيل ستار.<br><b>- 10 حصان (7.5KW):</b> سلك 1.05 مم - توصيل دلتا.<br><b>- 20 حصان (15KW):</b> سلك مزدوج 2×0.90 مم.<br><i>ملاحظة: البيانات تقريبية ويجب مراجعة صاج المحرك الأصلي.</i>",
    table: true,
  },
};

function renderDiagram(key) {
  const data = diagramData[key];
  $("diagramTitle").textContent = data.title;
  $("diagramDescription").innerHTML = data.desc;

  document.querySelectorAll(".diagram-btn").forEach((b) => {
    const on = b.dataset.key === key;
    b.classList.toggle("border-brand-600", on);
    b.classList.toggle("bg-brand-50", on);
    b.classList.toggle("text-brand-700", on);
    b.classList.toggle("border-slate-200", !on);
    b.classList.toggle("bg-slate-50", !on);
    b.classList.toggle("text-slate-700", !on);
  });

  $("canvasWrap").classList.toggle("hidden", !!data.table);
  $("phaseLegend").classList.toggle("hidden", !!data.table);
  $("specTable").classList.toggle("hidden", !data.table);
  if (data.table) return;

  const canvas = $("windingCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const slotCount = data.slots;
  const startX = 20;
  const spacing = (canvas.width - 40) / slotCount;

  ctx.fillStyle = "#334155";
  for (let i = 0; i < slotCount; i++) ctx.fillRect(startX + i * spacing, 40, spacing - 3, 140);

  const colors = ["#ef4444", "#3b82f6", "#f59e0b"];
  for (let i = 0; i < slotCount - data.span; i += 2) {
    ctx.strokeStyle = colors[(i / 2) % colors.length];
    ctx.lineWidth = 2.5;
    const x1 = startX + i * spacing + spacing / 2;
    const x2 = startX + (i + data.span) * spacing + spacing / 2;
    ctx.beginPath(); ctx.moveTo(x1, 40); ctx.quadraticCurveTo((x1 + x2) / 2, 10 - (i % 3) * 5, x2, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, 180); ctx.quadraticCurveTo((x1 + x2) / 2, 210 + (i % 3) * 5, x2, 180); ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "8px sans-serif";
  for (let i = 0; i < slotCount; i += 3) ctx.fillText(i + 1, startX + i * spacing, 195);
}
document.querySelectorAll(".diagram-btn").forEach((b) => b.addEventListener("click", () => renderDiagram(b.dataset.key)));
renderDiagram("24_3phase");

/* ---------- الموقع ---------- */
$("callLink").href = `tel:${contact.phone}`;
$("waLink").href = `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent("السلام عليكم مركز الفتح، استفسار عن صيانة محرك")}`;

let deferredInstall;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall = null;
  $("installBtn").classList.add("hidden");
});

/* ---------- المصادقة ---------- */
let registering = false;
const phoneToEmail = (p) => `${p.replace(/\D/g, "")}@alfath.app`;
const emailToPhone = (e) => (e || "").split("@")[0];

function openAuth() {
  if (!configured) return toast("لم يتم ضبط Firebase بعد");
  show($("authModal"));
}
function closeAuth() { hide($("authModal")); }

function setAuthMode(reg) {
  registering = reg;
  $("authTitle").textContent = reg ? "إنشاء حساب جديد" : "تسجيل الدخول";
  $("authSubmitBtn").textContent = reg ? "إنشاء الحساب" : "تسجيل الدخول";
  $("toggleAuthBtn").textContent = reg ? "لديك حساب؟ تسجيل الدخول" : "ليس لديك حساب؟ إنشاء حساب جديد";
  $("authName").classList.toggle("hidden", !reg);
  $("authName").required = reg;
}

const authErrors = {
  "auth/invalid-credential": "رقم الهاتف أو كلمة المرور غير صحيحة",
  "auth/user-not-found": "لا يوجد حساب بهذا الرقم",
  "auth/wrong-password": "كلمة المرور غير صحيحة",
  "auth/email-already-in-use": "هذا الرقم مسجل بالفعل",
  "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل)",
  "auth/invalid-email": "رقم الهاتف غير صالح",
  "auth/network-request-failed": "تحقق من اتصال الإنترنت",
  "auth/operation-not-allowed": "فعّل Email/Password من Firebase Authentication",
};

$("authBtn").addEventListener("click", async () => {
  if (user) {
    if (confirm("تسجيل الخروج؟")) await signOut(auth);
  } else openAuth();
});
$("accLoginBtn").addEventListener("click", openAuth);
$("authClose").addEventListener("click", closeAuth);
$("toggleAuthBtn").addEventListener("click", () => setAuthMode(!registering));

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = $("authPhone").value.trim();
  const pass = $("authPassword").value;
  const btn = $("authSubmitBtn");
  btn.disabled = true;
  try {
    if (registering) {
      const name = $("authName").value.trim();
      const cred = await createUserWithEmailAndPassword(auth, phoneToEmail(phone), pass);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "customers", cred.user.uid), { name, phone: phone.replace(/\D/g, ""), createdAt: serverTimestamp() });
      toast("تم إنشاء الحساب بنجاح");
    } else {
      await signInWithEmailAndPassword(auth, phoneToEmail(phone), pass);
      toast("تم تسجيل الدخول");
    }
    $("authForm").reset();
    closeAuth();
  } catch (err) {
    toast(authErrors[err.code] || "حدث خطأ، حاول مرة أخرى");
  } finally {
    btn.disabled = false;
  }
});

if (configured) {
  onAuthStateChanged(auth, async (u) => {
    user = u;
    isAdmin = false;
    stopUserListeners();
    if (u) {
      try { isAdmin = (await getDoc(doc(db, "admins", u.uid))).exists(); } catch { isAdmin = false; }
      $("userStatusText").textContent = u.displayName || "حسابي";
      $("clientName").value = u.displayName || "";
      $("clientPhone").value = emailToPhone(u.email);
      startUserListeners();
    } else {
      $("userStatusText").textContent = "تسجيل الدخول";
    }
    if (isAdmin) show($("uploadBtn"), "inline-flex"); else hide($("uploadBtn"), "inline-flex");
    if (isAdmin) show($("lessonBtn"), "inline-flex"); else hide($("lessonBtn"), "inline-flex");
    renderLessons();
    renderAccountShell();
    renderRequests([]);
  });
}

function stopUserListeners() {
  ["requests", "customers", "tx", "chat"].forEach(stop);
  viewUid = null;
}

function startUserListeners() {
  // طلبات العمل
  const rq = isAdmin
    ? query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(50))
    : query(collection(db, "requests"), where("uid", "==", user.uid));
  unsubs.requests = onSnapshot(rq, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.createdAt?.seconds ?? 9e12) - (a.createdAt?.seconds ?? 9e12));
    renderRequests(rows);
  }, () => toast("تعذر تحميل الطلبات"));

  if (isAdmin) {
    unsubs.customers = onSnapshot(collection(db, "customers"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      const sel = $("customerSelect");
      const keep = viewUid;
      sel.innerHTML = rows.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} - ${esc(c.phone)}</option>`).join("");
      if (rows.length) {
        const target = rows.find((r) => r.id === keep) ? keep : rows[0].id;
        sel.value = target;
        watchAccount(target);
      } else {
        viewUid = null;
        hide($("accView"), null);
      }
    });
  } else {
    watchAccount(user.uid);
  }
}

/* ---------- المعرض ---------- */
if (configured) {
  onSnapshot(query(collection(db, "gallery"), orderBy("createdAt", "desc"), limit(20)), (snap) => {
    const grid = $("galleryGrid");
    if (snap.empty) {
      grid.innerHTML = '<p class="col-span-full text-center text-xs text-slate-400 py-8">لا توجد أعمال منشورة بعد.</p>';
      return;
    }
    grid.innerHTML = snap.docs.map((d) => {
      const g = d.data();
      return `<div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 flex flex-col">
        <img src="${esc(g.img)}" alt="${esc(g.title)}" class="h-32 w-full object-cover">
        <div class="p-3 flex-grow flex flex-col justify-between">
          <div><h4 class="font-bold text-xs text-slate-900 leading-tight">${esc(g.title)}</h4>
          <p class="text-[10px] text-slate-500 mt-1">${esc(g.desc)}</p></div>
          <span class="text-[9px] text-brand-600 bg-brand-50 self-start px-2 py-0.5 rounded-full font-semibold mt-2">بواسطة: ${esc(g.author)}</span>
        </div></div>`;
    }).join("");
  }, () => {});
}

function compressImage(file, max = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

$("uploadBtn").addEventListener("click", () => show($("uploadModal")));
$("uploadClose").addEventListener("click", () => hide($("uploadModal")));
$("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("uploadSubmit");
  btn.disabled = true;
  try {
    const img = await compressImage($("photoFile").files[0]);
    await addDoc(collection(db, "gallery"), {
      title: $("photoTitle").value.trim(),
      desc: $("photoDesc").value.trim() || "تم الإنجاز بكفاءة داخل الورشة.",
      img,
      author: user.displayName || "المركز",
      createdAt: serverTimestamp(),
    });
    $("uploadForm").reset();
    hide($("uploadModal"));
    toast("تم نشر الصورة في المعرض");
  } catch {
    toast("تعذر رفع الصورة");
  } finally {
    btn.disabled = false;
  }
});

/* ---------- الأعمال التعليمية ---------- */
let lastLessons = [];

function renderLessons() {
  const box = $("lessonsList");
  if (!lastLessons.length) {
    box.innerHTML = '<p class="text-center text-xs text-slate-400 py-6">لا توجد دروس منشورة بعد.</p>';
    return;
  }
  box.innerHTML = lastLessons.map((l) => `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      ${l.img ? `<img src="${esc(l.img)}" alt="${esc(l.title)}" class="w-full max-h-64 object-cover">` : ""}
      <div class="p-4 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <h4 class="font-bold text-sm text-slate-900">${esc(l.title)}</h4>
          ${isAdmin ? `<button data-del-lesson="${esc(l.id)}" class="text-red-500 text-xs" aria-label="حذف"><i class="fa-solid fa-trash"></i></button>` : ""}
        </div>
        <p class="text-xs text-slate-600 leading-relaxed" style="white-space:pre-line">${esc(l.desc)}</p>
        <span class="inline-block text-[9px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-semibold">بواسطة: ${esc(l.author)}</span>
      </div>
    </div>`).join("");
}

if (configured) {
  onSnapshot(query(collection(db, "lessons"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
    lastLessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLessons();
  }, () => {});
}

$("lessonBtn").addEventListener("click", () => show($("lessonModal")));
$("lessonClose").addEventListener("click", () => hide($("lessonModal")));

$("lessonForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("lessonSubmit");
  btn.disabled = true;
  try {
    const file = $("lessonFile").files[0];
    const img = file ? await compressImage(file, 900, 0.7) : "";
    await addDoc(collection(db, "lessons"), {
      title: $("lessonTitle").value.trim(),
      desc: $("lessonDesc").value.trim(),
      img,
      author: user.displayName || "المركز",
      createdAt: serverTimestamp(),
    });
    $("lessonForm").reset();
    hide($("lessonModal"));
    toast("تم نشر الدرس");
  } catch {
    toast("تعذر نشر الدرس");
  } finally {
    btn.disabled = false;
  }
});

$("lessonsList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del-lesson]");
  if (!b || !isAdmin) return;
  if (!confirm("حذف هذا الدرس؟")) return;
  try { await deleteDoc(doc(db, "lessons", b.dataset.delLesson)); toast("تم حذف الدرس"); }
  catch { toast("تعذر حذف الدرس"); }
});

/* ---------- طلبات العمل ---------- */
const STATUSES = ["قيد المراجعة", "جاري العمل", "جاهز للاستلام", "تم التسليم"];

$("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) { toast("سجّل الدخول أولاً لإرسال الطلب"); return openAuth(); }
  try {
    await addDoc(collection(db, "requests"), {
      uid: user.uid,
      name: $("clientName").value.trim(),
      phone: $("clientPhone").value.trim(),
      service: $("serviceType").value,
      power: $("motorPower").value.trim() || "غير محدد",
      rpm: $("motorRPM").value,
      details: $("orderDetails").value.trim(),
      status: STATUSES[0],
      createdAt: serverTimestamp(),
    });
    $("motorPower").value = "";
    $("orderDetails").value = "";
    toast("تم استلام طلبك! سيتواصل معك الفني قريباً");
  } catch {
    toast("تعذر إرسال الطلب");
  }
});

function renderRequests(rows) {
  const box = $("requestsLog");
  $("requestsTitle").lastChild.textContent = isAdmin ? " كل طلبات العملاء" : " سجل طلباتك الأخيرة";
  if (!user) { box.innerHTML = '<p class="text-slate-500 text-center py-2">سجّل الدخول لمتابعة طلباتك.</p>'; return; }
  if (!rows.length) { box.innerHTML = '<p class="text-slate-500 text-center py-2">لا توجد طلبات حتى الآن.</p>'; return; }
  box.innerHTML = rows.map((r) => `
    <div class="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1.5">
      <div class="flex justify-between items-start gap-2">
        <div>
          <p class="font-bold text-slate-800 text-xs">${esc(r.service)} - (${esc(r.power)})</p>
          ${isAdmin ? `<p class="text-[10px] text-slate-600">${esc(r.name)} - <a class="text-brand-600" href="tel:${esc(r.phone)}">${esc(r.phone)}</a></p>` : ""}
          ${r.details ? `<p class="text-[10px] text-slate-500">${esc(r.details)}</p>` : ""}
          <p class="text-[10px] text-slate-400">${fmtDate(r.createdAt)}</p>
        </div>
        ${isAdmin
          ? `<select data-req="${esc(r.id)}" class="req-status text-[10px] border border-slate-300 rounded-lg p-1 bg-white">
              ${STATUSES.map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select>`
          : `<span class="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">${esc(r.status)}</span>`}
      </div>
    </div>`).join("");
}
$("requestsLog").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("req-status")) return;
  try { await updateDoc(doc(db, "requests", e.target.dataset.req), { status: e.target.value }); toast("تم تحديث الحالة"); }
  catch { toast("تعذر تحديث الحالة"); }
});

/* ---------- حسابي: مديونية وسداد وشات ---------- */
function renderAccountShell() {
  $("accTitle").textContent = isAdmin ? "إدارة العملاء" : "حسابي";
  if (!user) {
    show($("accLoggedOut"), null);
    hide($("accAdminBox"), null);
    hide($("accView"), null);
    return;
  }
  hide($("accLoggedOut"), null);
  if (isAdmin) show($("accAdminBox"), null); else hide($("accAdminBox"), null);
}

function watchAccount(uid) {
  viewUid = uid;
  stop("tx"); stop("chat");
  show($("accView"), null);

  unsubs.tx = onSnapshot(query(collection(db, "customers", uid, "transactions"), orderBy("createdAt", "desc")), (snap) => {
    let debt = 0, paid = 0;
    const rows = snap.docs.map((d) => d.data());
    rows.forEach((t) => { if (t.type === "payment") paid += t.amount; else debt += t.amount; });
    $("sumDebt").textContent = fmtMoney(debt);
    $("sumPaid").textContent = fmtMoney(paid);
    $("sumLeft").textContent = fmtMoney(debt - paid);
    $("txList").innerHTML = rows.length ? rows.map((t) => `
      <div class="flex justify-between items-center bg-slate-50 rounded-xl p-2.5">
        <div><p class="font-bold ${t.type === "payment" ? "text-emerald-600" : "text-red-600"}">${t.type === "payment" ? "سداد" : "مديونية"}${t.note ? ` - ${esc(t.note)}` : ""}</p>
        <p class="text-[10px] text-slate-400">${fmtDate(t.createdAt)}</p></div>
        <span class="font-bold">${fmtMoney(t.amount)}</span>
      </div>`).join("") : '<p class="text-center text-slate-400 py-2">لا توجد حركات بعد.</p>';
  }, () => toast("تعذر تحميل كشف الحساب"));

  unsubs.chat = onSnapshot(query(collection(db, "chats", uid, "messages"), orderBy("createdAt", "asc"), limit(200)), (snap) => {
    const box = $("chatBox");
    box.innerHTML = snap.docs.map((d) => {
      const m = d.data();
      const mine = isAdmin ? m.from === "admin" : m.from === "customer";
      return `<div class="flex ${mine ? "justify-start" : "justify-end"}">
        <div class="max-w-[80%] px-3 py-2 rounded-2xl ${mine ? "bg-brand-600 text-white" : "bg-white border border-slate-200"}">${esc(m.text)}</div></div>`;
    }).join("") || '<p class="text-center text-slate-400 py-4">ابدأ المحادثة مع المركز.</p>';
    box.scrollTop = box.scrollHeight;
  }, () => {});
}

$("customerSelect").addEventListener("change", (e) => watchAccount(e.target.value));

$("txForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = parseFloat($("txAmount").value);
  if (!viewUid || !(amount > 0)) return;
  try {
    await addDoc(collection(db, "customers", viewUid, "transactions"), {
      type: $("txType").value, amount, note: $("txNote").value.trim(), createdAt: serverTimestamp(),
    });
    $("txAmount").value = ""; $("txNote").value = "";
    toast("تم حفظ الحركة");
  } catch { toast("تعذر حفظ الحركة"); }
});

$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text || !viewUid) return;
  $("chatInput").value = "";
  try {
    await addDoc(collection(db, "chats", viewUid, "messages"), {
      text, from: isAdmin ? "admin" : "customer", createdAt: serverTimestamp(),
    });
  } catch { toast("تعذر إرسال الرسالة"); }
});

renderAccountShell();
renderRequests([]);
