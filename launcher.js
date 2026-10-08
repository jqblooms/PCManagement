// Finds the PC Management web host on the school network. File servers publish their
// private address to Firebase at startup and every five minutes; this page prefers a
// fresh primary and falls back to a replica when the primary has stopped checking in.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAVd_o4qq4OUr57aRhjCxrj_p-ia1g6qSE",
  authDomain: "bloomsbury-computing-fbc13.firebaseapp.com",
  databaseURL: "https://bloomsbury-computing-fbc13-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bloomsbury-computing-fbc13",
  storageBucket: "bloomsbury-computing-fbc13.firebasestorage.app",
  messagingSenderId: "566610310869",
  appId: "1:566610310869:web:910ee795b95a4849d3145c"
};

// Two missed five-minute check-ins (plus slack) before a server counts as gone.
const FRESH_MS = 11 * 60 * 1000;
// Only ever link to a private-network HTTPS address on the web host's port. The database
// rules enforce the same pattern; this is a second line of defence.
const SAFE_URL = /^https:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):8443\/$/;
const RANK = { Primary: 0, Standalone: 0, Replica: 1 };

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child != null));
  return node;
};

function show(section) {
  for (const id of ["checking", "ready", "none"]) $(id).hidden = id !== section;
}

function ago(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function render(hosts) {
  const now = Date.now();
  const servers = Object.values(hosts || {})
    .map((host) => ({
      name: String(host.name || "Unknown"),
      role: String(host.role || "Standalone"),
      urls: Object.values(host.urls || {}).map(String).filter((url) => SAFE_URL.test(url)),
      updatedAt: Number(host.updatedAt) || 0
    }))
    .filter((server) => server.urls.length > 0)
    .map((server) => ({ ...server, fresh: now - server.updatedAt < FRESH_MS }))
    .sort((a, b) => (b.fresh - a.fresh) || ((RANK[a.role] ?? 1) - (RANK[b.role] ?? 1)) || (b.updatedAt - a.updatedAt));

  const list = $("serverList");
  list.replaceChildren(...servers.map((server) => el("li", {},
    el("span", { className: "dot" + (server.fresh ? " fresh" : ""), title: server.fresh ? "Checking in" : "Not checking in" }),
    el("span", { textContent: server.name }),
    el("span", { className: "role", textContent: server.role }),
    el("span", { className: "seen", textContent: server.updatedAt ? ago(now - server.updatedAt) : "never" }))));
  $("servers").hidden = servers.length === 0;

  const best = servers.find((server) => server.fresh);
  if (!best) {
    $("noneText").textContent = servers.length
      ? "No classroom server has checked in for over 10 minutes."
      : "No classroom server has registered yet.";
    show("none");
    return;
  }
  $("openButton").href = best.urls[0];
  $("readyText").textContent = best.role === "Replica"
    ? `The primary server is not responding, so this opens the replica ${best.name}.`
    : `Server ${best.name} is online.`;
  const others = best.urls.slice(1);
  $("otherList").replaceChildren(...others.map((url) => el("li", {}, el("a", { href: url, textContent: url }))));
  $("otherLinks").hidden = others.length === 0;
  show("ready");
}

async function start() {
  try {
    const app = initializeApp(firebaseConfig);
    await signInAnonymously(getAuth(app));
    let latest = {};
    onValue(ref(getDatabase(app), "hosts"), (snapshot) => { latest = snapshot.val() || {}; render(latest); },
      (error) => { $("noneText").textContent = "Could not read the server list: " + error.message; show("none"); });
    // Re-evaluate freshness even if no new data arrives.
    setInterval(() => render(latest), 30000);
  } catch (error) {
    $("noneText").textContent = "Could not reach the launcher service: " + error.message;
    show("none");
  }
}

start();
