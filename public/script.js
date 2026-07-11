/* ===============================
   DOM ELEMENTS & INITIALIZATION
================================*/
// Wrap initialization in a DOMContentLoaded listener to ensure HTML is fully parsed
document.addEventListener("DOMContentLoaded", () => {
    const fileListEl = document.getElementById('fileList');

    // 1. Run Session Guard
    checkLoginSession();

    // 2. Initialize Dashboard Features (Only if on dashboard page)
    if (fileListEl) {
        loadFiles(fileListEl);
        initDragAndDrop(fileListEl);

        // Bind Search Bar if it exists
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.addEventListener('input', () => searchFiles(fileListEl));
        }
    }
});

/* ===============================
   LOGIN SESSION CHECK
================================*/
function checkLoginSession() {
    if (window.location.pathname.includes("dashboard.html")) {
        if (!localStorage.getItem("loggedIn")) {
            window.location.href = "login.html";
        }
    }
}

/* ===============================
   LOGIN FUNCTION (FOR login.html)
================================*/
async function login() {
    const usernameEl = document.getElementById("username");
    const passwordEl = document.getElementById("password");

    if (!usernameEl || !passwordEl) return;

    const username = usernameEl.value;
    const password = passwordEl.value;

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
    const clearSessionAndRedirect = () => {
        localStorage.removeItem("loggedIn");
        window.location.href = "login.html";
    };

    fetch("/logout")
        .then(clearSessionAndRedirect)
        .catch(clearSessionAndRedirect);
}

/* ===============================
   FILE PATH FUNCTION
================================*/
function getFolderPath() {
    return localStorage.getItem("serverPath") || "/tmp/uploads";
}

/* ===============================
   LOAD FILES
================================*/
async function loadFiles(fileListEl) {
    if (!fileListEl) return;

    const folderPath = getFolderPath();

    try {
        const cacheBuster = `&cb=${new Date().getTime()}`;
        const res = await fetch(`/files?folder=${encodeURIComponent(folderPath)}${cacheBuster}`, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        const files = await res.json();
        displayFiles(files, fileListEl);
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
function displayFiles(files, fileListEl) {
    if (!fileListEl) return;
    fileListEl.innerHTML = '';

    // Update Stats Cards Dynamically
    const totalFilesEl = document.getElementById('totalFiles');
    const storageEl = document.getElementById('storage');
    
    if (totalFilesEl) totalFilesEl.innerText = files ? files.length : 0;
    if (storageEl) {
        const totalBytes = files ? files.reduce((sum, file) => sum + (Number(file.size) || 0), 0) : 0;
        storageEl.innerText = formatFileSize(totalBytes);
    }

    if (!files || !files.length) {
        fileListEl.innerHTML = '<tr><td colspan="6">No files found in the database.</td></tr>';
        return;
    }

    files.forEach(file => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="selectFile" data-name="${file.name}"></td>
            <td>${file.type || 'File'}</td>
            <td>${file.name}</td>
            <td>${formatFileSize(file.size)}</td>
            <td>${file.date || '-'}</td>
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
   DELETE SINGLE FILE
================================*/
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    const folderPath = getFolderPath();
    try {
        const res = await fetch(`/delete?folder=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            alert("File deleted successfully");
            const fileListEl = document.getElementById('fileList');
            loadFiles(fileListEl);
        } else {
            alert("Failed to delete file");
        }
    } catch (err) {
        console.error("Error deleting file:", err);
        alert("Error deleting file");
    }
}

/* ===============================
   DOWNLOAD MULTIPLE FILES
================================*/
async function downloadFiles() {
    const selected = document.querySelectorAll('.selectFile:checked');
    if (!selected.length) return alert('Select at least one file!');

    const files = Array.from(selected).map(cb => cb.dataset.name);

    try {
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
    } catch (err) {
        console.error(err);
        alert("Bulk download failed");
    }
}

/* ===============================
   SEARCH FILES
================================*/
function searchFiles(fileListEl) {
    const searchInput = document.getElementById('search');
    if (!searchInput || !fileListEl) return;

    const filter = searchInput.value.toLowerCase();
    const rows = fileListEl.querySelectorAll('tr');

    rows.forEach(row => {
        if (row.children[2]) {
            const name = row.children[2].innerText.toLowerCase();
            row.style.display = name.includes(filter) ? '' : 'none';
        }
    });
}

/* ===============================
   CORE UPLOAD SCRIPT (Shared Process)
================================*/
async function sendFilesToServer(files) {
    if (!files || !files.length) return;

    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append("files", file);
    });
    formData.append("folder", getFolderPath());

    const progressBar = document.getElementById('progressFill');

    try {
        if (progressBar) progressBar.style.width = "80%";

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Upload failed");
        }

        if (progressBar) progressBar.style.width = "100%";
        alert(result.message || "Upload Successful");
        
        const fileListEl = document.getElementById('fileList');
        loadFiles(fileListEl); // Refresh database list on UI

        setTimeout(() => {
            if (progressBar) progressBar.style.width = "0%";
        }, 1500);

    } catch (err) {
        console.error(err);
        if (progressBar) progressBar.style.width = "0%";
        alert("Upload Failed\n\n" + err.message);
    }
}

/* ===============================
   MANUAL FILE SELECT UPLOAD
================================*/
async function uploadFile() {
    const input = document.getElementById("fileInput");

    if (!input || !input.files.length) {
        alert("Please select file(s)");
        return;
    }

    await sendFilesToServer(input.files);
    input.value = ""; // Clear file input
}

/* ===============================
   DRAG AND DROP INITIALIZATION
================================*/
function initDragAndDrop(fileListEl) {
    const dropZone = document.body; 
    if (!dropZone || !fileListEl) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => e.preventDefault(), false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('highlight'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('highlight'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        sendFilesToServer(files);
    });
}