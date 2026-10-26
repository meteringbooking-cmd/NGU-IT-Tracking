// Shared setup for every page: Firebase, EmailJS, settings and helpers.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import emailjs from "https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/+esm";

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBb9x_7RJcsg0Iw2whRylbybuQNuLr6Yco",
  authDomain: "meter-install-check.firebaseapp.com",
  projectId: "meter-install-check",
  storageBucket: "meter-install-check.firebasestorage.app",
  messagingSenderId: "238786946643",
  appId: "1:238786946643:web:f1965fca6d3b79ef5e08a6",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Collection names are prefixed so they can't clash with the other app in this Firebase project.
export const COL = {
  tickets: "it_tickets",
  staff: "it_staff",
  settings: "it_settings",
  counters: "it_counters",
};

// ---------------------------------------------------------------------------
// EmailJS
// ---------------------------------------------------------------------------
export const EMAILJS = {
  serviceId: "service_b3nh4bo",
  publicKey: "ziLnha91scpGjFABh",
  templateIT: "template_ojea9np",        // emails to the IT team / assignees
  templateExternal: "template_ojea9np",  // emails to the person who raised the ticket
};
emailjs.init({ publicKey: EMAILJS.publicKey });

/**
 * Send an email through EmailJS. Never throws - a failed email must not lose a ticket.
 * Template variables available: to_email, to_name, from_name, reply_to, subject, message,
 * ticket_ref, ticket_title, ticket_link, priority, status, requester_name, requester_email.
 */
export async function sendEmail(kind, params) {
  if (!params.to_email) return false;
  const templateId = kind === "external" ? EMAILJS.templateExternal : EMAILJS.templateIT;
  try {
    await emailjs.send(EMAILJS.serviceId, templateId, {
      from_name: "IT Helpdesk",
      ...params,
    });
    return true;
  } catch (err) {
    console.warn("Email failed", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Settings (stored in it_settings/config, editable by admins)
// ---------------------------------------------------------------------------
export const PRIORITIES = ["P1", "P2", "P3", "P4"];
export const PRIORITY_LABELS = { P1: "Critical", P2: "High", P3: "Medium", P4: "Low" };
export const PRIORITY_HELP = {
  P1: "I can't work at all, or many people are affected",
  P2: "Seriously slowing me down, no workaround",
  P3: "A problem, but I have a workaround",
  P4: "A request or minor issue - no rush",
};
export const STATUSES = ["New", "Open", "In progress", "On hold", "Resolved", "Closed"];
export const ACTIVE = ["New", "Open", "In progress", "On hold"];
export const DONE = ["Resolved", "Closed"];

export const DEFAULT_SETTINGS = {
  teamName: "IT Helpdesk",
  itEmail: "",
  categories: ["Hardware", "Software", "Network", "Accounts & access", "Email", "Printing", "Phones", "Other"],
  slas: {  // hours
    P1: { response: 1, resolve: 4 },
    P2: { response: 4, resolve: 24 },
    P3: { response: 8, resolve: 72 },
    P4: { response: 24, resolve: 168 },
  },
};

export async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, COL.settings, "config"));
    return mergeSettings(snap.exists() ? snap.data() : null);
  } catch (e) {
    console.warn("Using default settings", e);
    return mergeSettings(null);
  }
}

export function mergeSettings(data) {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!data) return s;
  return { ...s, ...data, slas: { ...s.slas, ...(data.slas || {}) } };
}

// ---------------------------------------------------------------------------
// Ticket creation (used by the public form and by IT staff)
// ---------------------------------------------------------------------------
export const MAX_FILE_MB = 10;
export const MAX_FILES = 5;

/** Upload files, then create the ticket with the next INC number in one transaction. */
export async function createTicket(fields, files = [], onProgress = () => {}) {
  const ticketRef = doc(collection(db, COL.tickets));
  const attachments = await uploadFiles(ticketRef.id, files, onProgress);
  const counterRef = doc(db, COL.counters, "tickets");
  const number = await runTransaction(db, async (tx) => {
    const c = await tx.get(counterRef);
    const n = (c.exists() ? c.data().next : 0) + 1;
    tx.set(counterRef, { next: n });
    tx.set(ticketRef, {
      number: n,
      ref: formatRef(n),
      title: fields.title,
      description: fields.description || "",
      requesterName: fields.requesterName || "",
      requesterEmail: (fields.requesterEmail || "").trim().toLowerCase(),
      department: fields.department || "",
      phone: fields.phone || "",
      category: fields.category || "",
      priority: PRIORITIES.includes(fields.priority) ? fields.priority : "P3",
      status: fields.status || "New",
      assigneeId: fields.assigneeId || null,
      assigneeName: fields.assigneeName || null,
      source: fields.source || "portal",
      attachments,
      needsAttention: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      firstResponseAt: fields.firstResponseAt || null,
      resolvedAt: null,
    });
    return n;
  });
  return { id: ticketRef.id, ref: formatRef(number), number };
}

export async function uploadFiles(ticketId, files, onProgress = () => {}) {
  const out = [];
  let i = 0;
  for (const f of files) {
    i++;
    onProgress(`Uploading ${f.name} (${i} of ${files.length})…`);
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `${COL.tickets}/${ticketId}/${Date.now()}_${safe}`;
    await uploadBytes(sRef(storage, path), f, { contentType: f.type || "application/octet-stream" });
    out.push({ name: f.name, path, size: f.size, type: f.type || "" });
  }
  return out;
}

export function validateFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files.`;
  const big = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
  if (big) return `${big.name} is over ${MAX_FILE_MB} MB.`;
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const formatRef = (n) => `INC-${String(n).padStart(5, "0")}`;

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const toDate = (v) => (v ? (v.toDate ? v.toDate() : new Date(v)) : null);

const TZ = "Europe/London";
export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit" });
}

export function ago(v) {
  const d = toDate(v);
  if (!d) return "";
  let secs = (Date.now() - d.getTime()) / 1000;
  const future = secs < 0;
  secs = Math.abs(secs);
  let s;
  if (secs < 60) return future ? "in under a minute" : "just now";
  if (secs >= 86400) s = `${Math.floor(secs / 86400)}d`;
  else if (secs >= 3600) s = `${Math.floor(secs / 3600)}h`;
  else s = `${Math.floor(secs / 60)}m`;
  return future ? `in ${s}` : `${s} ago`;
}

export function fmtSize(n) {
  n = n || 0;
  for (const u of ["B", "KB", "MB"]) { if (n < 1024) return `${n.toFixed(0)} ${u}`; n /= 1024; }
  return `${n.toFixed(1)} GB`;
}

export function initials(name) {
  const p = String(name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** SLA due dates are worked out from the ticket's created time and the current SLA settings. */
export function slaDue(t, settings) {
  const created = toDate(t.createdAt) || new Date();
  const s = settings.slas[t.priority] || settings.slas.P3;
  return {
    response: new Date(created.getTime() + s.response * 3600e3),
    resolve: new Date(created.getTime() + s.resolve * 3600e3),
  };
}

/** Returns [state, label] - state is ok / risk / breached / met / missed. */
export function slaState(t, settings, now = Date.now()) {
  const due = slaDue(t, settings).resolve.getTime();
  const created = (toDate(t.createdAt) || new Date()).getTime();
  if (DONE.includes(t.status) && t.resolvedAt) {
    return toDate(t.resolvedAt).getTime() <= due ? ["met", "Met"] : ["missed", "Missed"];
  }
  if (now > due) return ["breached", "Breached"];
  if ((due - now) / Math.max(due - created, 1) < 0.25) return ["risk", "At risk"];
  return ["ok", "On track"];
}

export function responseState(t, settings, now = Date.now()) {
  const due = slaDue(t, settings).response.getTime();
  if (t.firstResponseAt) return toDate(t.firstResponseAt).getTime() <= due ? "met" : "missed";
  return now > due ? "breached" : "pending";
}

export const pageUrl = (page) => new URL(page, location.href).href.split("#")[0].split("?")[0];
export const trackLink = (id) => `${pageUrl("track.html")}?id=${encodeURIComponent(id)}`;
export const dashLink = (id) => `${pageUrl("dashboard.html")}#/ticket/${encodeURIComponent(id)}`;

export function toast(msg, kind = "success") {
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
