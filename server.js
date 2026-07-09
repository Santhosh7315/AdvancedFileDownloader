const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Root directory
const ROOT = __dirname;

// Upload directory
const uploadDir = path.join(ROOT, "uploads");

// Ensure upload folder exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folder
app.use(express.static(path.join(ROOT, "public")));

// Default page
app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "public", "Login.html"));
});


// ---------------- MULTER STORAGE ----------------
const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        let folderPath = req.body.folder || uploadDir;
        folderPath = path.resolve(folderPath);

        try {
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            cb(null, folderPath);
        } catch (err) {
            cb(err, uploadDir);
        }
    },

    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });


// ---------------- DATABASE ----------------
const dbPath = path.join(ROOT, "users.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database error:", err);
    } else {
        console.log("SQLite connected");
    }
});

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    db.get("SELECT * FROM users WHERE username='Admin'", (err, row) => {

        if (!row) {
            db.run(
                "INSERT INTO users(username,password) VALUES(?,?)",
                ["Admin", "Admin@123"]
            );
        }
    });

});


// ---------------- LOGIN ----------------
app.post("/login", (req, res) => {

    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username=? AND password=?",
        [username, password],
        (err, row) => {

            if (err) {
                console.error(err);
                return res.status(500).json({ success: false });
            }

            if (row) {
                res.json({ success: true });
            } else {
                res.json({ success: false });
            }
        }
    );
});


// ---------------- LOGOUT ----------------
app.get("/logout", (req, res) => {
    res.json({ success: true });
});


// ---------------- LIST FILES ----------------
app.get("/files", (req, res) => {

    let folderPath = req.query.folder || uploadDir;
    folderPath = path.resolve(folderPath);

    if (!fs.existsSync(folderPath)) {
        return res.json([]);
    }

    fs.readdir(folderPath, (err, files) => {

        if (err) {
            console.error(err);
            return res.json([]);
        }

        function formatFileSize(bytes) {

    if (bytes < 1024) {
        return bytes + " Bytes";
    }

    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + " KB";
    }

    if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    }

    if (bytes < 1024 * 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + " TB";
}

const fileData = files.map(file => {

    const fullPath = path.join(folderPath, file);
    const stats = fs.statSync(fullPath);

    return {
    name: file,
    size: formatFileSize(stats.size),
    date: new Date(stats.mtime).toLocaleDateString(),
    type: stats.isDirectory() ? "Folder" : "File"
};

});

        res.json(fileData);
    });

});


// ---------------- UPLOAD ----------------
app.post("/upload", upload.array("files"), (req, res) => {

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
    }

    res.json({ message: "File uploaded successfully" });

});


// ---------------- DOWNLOAD SINGLE ----------------
app.get("/download/:filename", (req, res) => {

    let folderPath = req.query.folder || uploadDir;
    folderPath = path.resolve(folderPath);

    const filePath = path.join(folderPath, path.basename(req.params.filename));

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }

    res.download(filePath);

});


// ---------------- DOWNLOAD MULTIPLE ----------------
app.post("/download", (req, res) => {

    const files = req.body.files;
    let folderPath = req.body.folder || uploadDir;

    folderPath = path.resolve(folderPath);

    if (!files || files.length === 0) {
        return res.status(400).send("No files selected");
    }

    const archive = archiver("zip", { zlib: { level: 9 } });

    res.attachment("files.zip");
    archive.pipe(res);

    archive.on("error", err => {
        console.error(err);
        res.status(500).send("Zip creation failed");
    });

    files.forEach(file => {

        const filePath = path.join(folderPath, path.basename(file));

        if (fs.existsSync(filePath)) {
            archive.file(filePath, { name: file });
        }

    });

    archive.finalize();

});


// ---------------- DELETE FILE ----------------
app.delete("/delete/:filename", (req, res) => {

    let folderPath = req.query.folder || uploadDir;
    folderPath = path.resolve(folderPath);

    const filePath = path.join(folderPath, path.basename(req.params.filename));

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "File not found"
        });
    }

    fs.unlink(filePath, (err) => {

        if (err) {
            console.error(err);
            return res.status(500).json({ success: false });
        }

        res.json({
            success: true,
            message: "File deleted successfully"
        });

    });

});


// ---------------- START SERVER ----------------
app.listen(PORT, () => {

    console.log("Server running on port " + PORT);
    console.log("Login page: http://localhost:" + PORT);

});