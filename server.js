const express = require("express");
const multer = require("multer");
const path = require("path");
const archiver = require("archiver");
const sql = require("mssql/msnodesqlv8");

const app = express();
const PORT = process.env.PORT || 3000;

// Root directory
const ROOT = __dirname;

// ---------------- DATABASE CONFIGURATION ----------------
const dbConfig = {
    server: "localhost\\SQLEXPRESS",
    database: "FileStorageDB",
    driver: "msnodesqlv8",
    options: {
        trustedConnection: true,
        trustServerCertificate: true
    }
};

// Connect to SQL Server and initialize tables if they don't exist
async function initDatabase() {
    try {
        let pool = await sql.connect(dbConfig);
        console.log("Connected to SQL Server successfully via Windows Authentication.");

        // Create Users Table if not exists
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
            CREATE TABLE users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                username NVARCHAR(100) UNIQUE,
                password NVARCHAR(100)
            );
        `);

        // Create Files Storage Table if not exists
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_files' AND xtype='U')
            CREATE TABLE user_files (
                id INT IDENTITY(1,1) PRIMARY KEY,
                file_name NVARCHAR(255) NOT NULL,
                file_extension NVARCHAR(10) NOT NULL,
                mime_type NVARCHAR(100) NOT NULL,
                file_size_bytes BIGINT NOT NULL,
                file_data VARBINARY(MAX) NOT NULL,
                uploaded_at DATETIME DEFAULT GETDATE()
            );
        `);

        // Create Admin user if it doesn't exist
        let adminCheck = await pool.request()
            .input("adminUser", sql.NVarChar, "Admin")
            .query("SELECT * FROM users WHERE username = @adminUser");

        if (adminCheck.recordset.length === 0) {
            await pool.request()
                .input("user", sql.NVarChar, "Admin")
                .input("pass", sql.NVarChar, "Admin@123")
                .query("INSERT INTO users (username, password) VALUES (@user, @pass)");
            console.log("Default Admin user created.");
        }

    } catch (err) {
        console.error("SQL Server Initialization Error:", err);
    }
}
initDatabase();

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, "public")));

// Default page
app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "public", "login.html"));
});

// ---------------- MULTER STORAGE (Memory Only) ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------------- LOGIN ----------------
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input("user", sql.NVarChar, username)
            .input("pass", sql.NVarChar, password)
            .query("SELECT * FROM users WHERE username = @user AND password = @pass");

        if (result.recordset.length > 0) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// ---------------- LOGOUT ----------------
app.get("/logout", (req, res) => {
    res.json({ success: true });
});

// ---------------- LIST FILES (From DB) ----------------
app.get("/files", async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT id, file_name AS name, file_size_bytes AS size, uploaded_at AS date, file_extension AS type 
            FROM user_files
        `);

        const fileData = result.recordset.map(file => ({
            name: file.name,
            size: file.size, 
            date: new Date(file.date).toLocaleDateString(),
            type: file.type
        }));

        res.json(fileData);
    } catch (err) {
        console.error("Fetch Files Error:", err);
        res.json([]);
    }
});

// ---------------- UPLOAD (Save directly into SQL Server) ----------------
app.post("/upload", upload.array("files"), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
    }

    try {
        let pool = await sql.connect(dbConfig);

        for (const file of req.files) {
            const ext = path.extname(file.originalname).substring(1);

            await pool.request()
                .input("file_name", sql.NVarChar(255), file.originalname)
                .input("file_extension", sql.NVarChar(10), ext)
                .input("mime_type", sql.NVarChar(100), file.mimetype)
                .input("file_size_bytes", sql.BigInt, file.size)
                .input("file_data", sql.VarBinary(sql.MAX), file.buffer)
                .query(`
                    INSERT INTO user_files (file_name, file_extension, mime_type, file_size_bytes, file_data)
                    VALUES (@file_name, @file_extension, @mime_type, @file_size_bytes, @file_data)
                `);
        }

        res.json({ message: "File uploaded successfully to Database" });
    } catch (err) {
        console.error("Upload Route Error:", err);
        res.status(500).json({ message: "Database storage upload failed" });
    }
});

// ---------------- DOWNLOAD SINGLE (From DB) ----------------
app.get("/download/:filename", async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input("filename", sql.NVarChar(255), req.params.filename)
            .query("SELECT mime_type, file_data FROM user_files WHERE file_name = @filename");

        if (result.recordset.length === 0) {
            return res.status(404).send("File not found in database");
        }

        const file = result.recordset[0];
        res.setHeader("Content-Type", file.mime_type);
        res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
        res.send(file.file_data);

    } catch (err) {
        console.error(err);
        res.status(500).send("Download processing error");
    }
});

// ---------------- DOWNLOAD MULTIPLE (From DB Binary) ----------------
app.post("/download", async (req, res) => {
    const files = req.body.files;

    if (!files || files.length === 0) {
        return res.status(400).send("No files selected");
    }

    try {
        let pool = await sql.connect(dbConfig);
        const archive = archiver("zip", { zlib: { level: 9 } });

        res.attachment("files.zip");
        archive.pipe(res);

        archive.on("error", err => {
            console.error(err);
            res.status(500).send("Zip creation failed");
        });

        for (const filename of files) {
            let result = await pool.request()
                .input("filename", sql.NVarChar(255), filename)
                .query("SELECT file_data FROM user_files WHERE file_name = @filename");

            if (result.recordset.length > 0) {
                const binaryBuffer = result.recordset[0].file_data;
                archive.append(binaryBuffer, { name: filename });
            }
        }

        archive.finalize();
    } catch (err) {
        console.error(err);
        res.status(500).send("Bulk bundle download error");
    }
});

// ---------------- DELETE FILE (Corrected Mismatch for URL Query Parameters) ----------------
app.delete("/delete", async (req, res) => {
    const filename = req.query.name; // Reads '?name=' parameter sent from frontend script.js

    if (!filename) {
        return res.status(400).json({ success: false, message: "Missing file name parameter" });
    }

    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request()
            .input("filename", sql.NVarChar(255), filename)
            .query("DELETE FROM user_files WHERE file_name = @filename");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: "File not found" });
        }

        res.json({ success: true, message: "File records purged successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Internal server error during deletion" });
    }
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
    console.log("Login page: http://localhost:" + PORT);
});