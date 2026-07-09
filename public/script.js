// script.js

const fileListEl = document.getElementById('fileList');

/* ===============================
   LOGIN SESSION CHECK
================================*/

if (window.location.pathname.includes("dashboard.html")) {
    if (!localStorage.getItem("loggedIn")) {
        window.location.href = "login.html";
    }
}

/* ===============================
   LOGIN FUNCTION (FOR login.html)
================================*/

async function login() {

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if (!username || !password) {
        alert("Enter username and password");
        return;
    }

    try {

        const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {

            localStorage.setItem("loggedIn", "true");

            window.location.href = "dashboard.html";

        } else {

            alert("Invalid Username or Password");

        }

    } catch (err) {

        console.error(err);
        alert("Login failed");

    }

}

/* ===============================
   LOGOUT FUNCTION
================================*/

function logout() {

    fetch("/logout")
        .then(() => {

            localStorage.removeItem("loggedIn");

            window.location.href = "login.html";

        })
        .catch(() => {

            localStorage.removeItem("loggedIn");

            window.location.href = "login.html";

        });

}


/* ===============================
   FILE PATH FUNCTION
================================*/

function getFolderPath() {
    return localStorage.getItem('serverPath') || 'D:\\requirement';
}


/* ===============================
   LOAD FILES
================================*/

async function loadFiles() {

    if (!fileListEl) return;

    const folderPath = getFolderPath();

    try {

        const res = await fetch(`/files?folder=${encodeURIComponent(folderPath)}`);

        const files = await res.json();

        displayFiles(files);

    } catch (err) {

        console.error('Error loading files:', err);

        fileListEl.innerHTML = '<tr><td colspan="6">Failed to load files.</td></tr>';

    }

}


/* ===============================
   FORMAT FILE SIZE
================================*/

function formatFileSize(bytes) {

    if (bytes === null || bytes === undefined || isNaN(bytes)) {
        return "-";
    }

    bytes = Number(bytes);

    const units = ["Bytes", "KB", "MB", "GB", "TB"];

    let unitIndex = 0;

    while (bytes >= 1024 && unitIndex < units.length - 1) {
        bytes /= 1024;
        unitIndex++;
    }

    return `${bytes.toFixed(2)} ${units[unitIndex]}`;
}



/* ===============================
   DISPLAY FILES
================================*/

function displayFiles(files) {

    fileListEl.innerHTML = '';

    if (!files.length) {

        fileListEl.innerHTML = '<tr><td colspan="6">No files found in this folder.</td></tr>';

        return;

    }

    files.forEach(file => {

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="checkbox" class="selectFile" data-name="${file.name}"></td>
            <td>${file.type || 'File'}</td>
            <td>${file.name}</td>
            <td>${file.size}</td>
            <td>${file.date}</td>
            <td>
                <button class="btn download" onclick="downloadFile('${file.name}')">Download</button>
                <button class="btn delete" onclick="deleteFile('${file.name}')">Delete</button>
            </td>
        `;

        fileListEl.appendChild(tr);

    });

}


/* ===============================
   DOWNLOAD SINGLE FILE
================================*/

function downloadFile(filename) {

    const folderPath = getFolderPath();

    const url = `/download/${encodeURIComponent(filename)}?folder=${encodeURIComponent(folderPath)}`;

    window.open(url, '_blank');

}


/* ===============================
   DOWNLOAD MULTIPLE FILES
================================*/

async function downloadFiles() {

    const selected = document.querySelectorAll('.selectFile:checked');

    if (!selected.length) return alert('Select at least one file!');

    const files = Array.from(selected).map(cb => cb.dataset.name);

    const res = await fetch('/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
    });

    if (!res.ok) return alert('Failed to download files');

    const blob = await res.blob();

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = 'files.zip';

    document.body.appendChild(a);

    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);

}


/* ===============================
   DELETE FILE
================================*/

/*async function deleteFile(filename) {

    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    const res = await fetch(`/delete/${encodeURIComponent(filename)}`, { method: 'DELETE' });

    const data = await res.json();

    if (data.success) {

        alert(data.message);

        loadFiles();

    } else {

        alert(data.message || 'Failed to delete file');

    }

}  */


/* ===============================
   SEARCH FILES
================================*/

function searchFiles() {

    const filter = document.getElementById('search').value.toLowerCase();

    const rows = fileListEl.querySelectorAll('tr');

    rows.forEach(row => {

        const name = row.children[2].innerText.toLowerCase();

        row.style.display = name.includes(filter) ? '' : 'none';

    });

}


/* ===============================
   UPLOAD FILES
================================*/

async function uploadFile() {

    const input = document.getElementById('fileInput');

    if (!input.files.length) return alert('Select files to upload');

    const folderPath = getFolderPath();

    const formData = new FormData();

    Array.from(input.files).forEach(f => formData.append('files', f));

    formData.append('folder', folderPath);

    const progressEl = document.getElementById('progress');

    try {

        const res = await fetch('/upload', { method: 'POST', body: formData });

        const data = await res.json();

        progressEl.innerText = data.message;

        input.value = '';

        loadFiles();

    } catch (err) {

        console.error(err);

        progressEl.innerText = 'Upload failed!';

    }

}


/* ===============================
   INITIAL LOAD
================================*/

if (fileListEl) {

    loadFiles();

}