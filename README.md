# Yamzz Mail Inbox — Vercel

Dashboard inbox email dengan access key Free/Paid dan panel admin.

## Fitur
- Login pengguna menggunakan access key.
- Key mempunyai masa expired.
- Admin dapat membuat key Paid dan Free dengan durasi berbeda.
- Admin dapat melihat semua key, menonaktifkan/mengaktifkan key, dan memperpanjang key.
- Inbox membaca email dari akun IMAP yang dikonfigurasi.
- Dashboard Live melakukan refresh otomatis.

## Environment Variables Vercel

### Wajib untuk inbox
```text
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=emailkamu@gmail.com
IMAP_PASS=APP_PASSWORD_GMAIL
```

### Wajib untuk sistem key/admin
```text
POSTGRES_URL=connection-string-database
ADMIN_PASSWORD=password-admin-kuat
ADMIN_SECRET=secret-random-panjang
```

`POSTGRES_URL` bisa berasal dari database Postgres yang terhubung ke project Vercel. Tabel `inbox_keys` dibuat otomatis ketika API pertama kali dipanggil.

## URL
- `/login.html` — login pengguna
- `/` — inbox setelah login
- `/admin-login.html` — login admin
- `/admin.html` — panel admin

## Catatan keamanan
- Jangan memasukkan kredensial SMTP/IMAP atau password admin ke HTML.
- Access key diperlakukan sebagai credential pengguna; jangan dibagikan sembarangan.
- Gunakan `ADMIN_SECRET` yang panjang dan acak.


## Halaman Generate Key Free

`/generate.html` membuat key Free menggunakan durasi default yang ditetapkan admin melalui Environment Variables:

```text
FREE_KEY_PUBLIC=true
FREE_KEY_DURATION=1
FREE_KEY_UNIT=day
```

Jika ingin mematikan generator publik:

```text
FREE_KEY_PUBLIC=false
```

## Batasan privasi

Inbox hanya menampilkan metadata email yang wajar (pengirim, subject, waktu, dan isi pesan). Project ini **tidak mengambil atau menampilkan password akun, IP pengirim, lokasi/geolokasi, ASN, atau kredensial login dari email**.


## Deployment Vercel
Project ini sudah disusun dengan `api/` di root untuk Vercel Functions dan file HTML di root sebagai static files. Jangan memasukkan folder `webuncheck-main` lagi sebagai subfolder ketika mengunggah isi ZIP; isi ZIP ini sudah siap dijadikan root project.

`vercel.json` menggunakan Node.js 24.x untuk Functions.
