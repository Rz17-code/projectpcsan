// Menampilkan alamat akses sebelum server dijalankan.
const os = require("os");
const port = 3000;
const ips = [];
for (const list of Object.values(os.networkInterfaces()))
  for (const a of list || []) if (a.family === "IPv4" && !a.internal) ips.push(a.address);
console.log("=".repeat(60));
console.log("  PCSAN OTOMATIS");
console.log("=".repeat(60));
console.log(`  Di laptop ini : http://localhost:${port}`);
for (const ip of ips) console.log(`  Untuk teman   : http://${ip}:${port}`);
console.log("  (teman harus di jaringan WiFi/LAN yang sama)");
console.log("  JANGAN tutup jendela ini selama aplikasi dipakai.");
console.log("=".repeat(60));
