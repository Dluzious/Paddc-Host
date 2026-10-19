// Alamat API Paddoc Host. '/api' = Worker Cloudflare di domain yang sama dengan aplikasi.
// Kalau aplikasi dibuka dari domain lain (mis. GitHub Pages), isi URL lengkap Worker, contoh:
// window.PADDOC_API = 'https://paddoc-host.NAMA-AKUN.workers.dev/api';
window.PADDOC_API = '/api';

// URL web app Apps Script lama, hanya dipakai sekali untuk memindahkan data dari Google Sheet.
// Setelah data pindah, baris ini boleh dihapus.
window.PADDOC_OLD_API = 'https://script.google.com/macros/s/AKfycbwSJxrWzgeHwgk42xhDUXfbVPN4uGUGLSGsjsIQ0fsGnRLOryRMmfTJFdgmT127kXq6/exec';
