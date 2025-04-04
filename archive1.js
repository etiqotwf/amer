import { exec } from "child_process";
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "url";
import cliTable from "cli-table3";
import inquirer from "inquirer";
import chalk from "chalk";
import figlet from "figlet";
import boxen from "boxen";
import ora from "ora";
import terminalKit from "terminal-kit"; 
import gradient from "gradient-string";
import mammoth from "mammoth"; // مكتبة استخراج نصوص من docx
import xlsx from "xlsx";
import pdfParse from "pdf-parse";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { transliterate } from "transliteration";
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib'; // تستخدم لتحويل الصور إلى PDF
import { c } from 'tar';

import crypto from 'crypto';

const tempDir = "temp"; // مجلد مؤقت لفك تشفير الملفات


const encryptionKey = crypto.randomBytes(32); // يجب حفظ هذا المفتاح لاسترجاع الملفات لاحقًا





const { terminal } = terminalKit; // استخراج `terminal`








// تحويل fileURL إلى path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'archive.db');

// التأكد من وجود قاعدة البيانات قبل محاولة حذفها
const dbExists = fs.existsSync(dbPath);

// فتح قاعدة البيانات
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return;

    // إنشاء الجدول إذا لم يكن موجودًا
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS archived_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            file_extension TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            original_path TEXT NOT NULL,
            archived_path TEXT NOT NULL,
            archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.run(createTableQuery, (err) => {
        if (err) return;

        // التحقق من وجود الأعمدة encryption_key و encrypted_data
        db.all("PRAGMA table_info(archived_files);", (err, rows) => {
            if (err) return;

            const columns = rows.map(row => row.name);
            if (!columns.includes("encryption_key")) {
                db.run("ALTER TABLE archived_files ADD COLUMN encryption_key TEXT;", (err) => {
                    if (err) return;
                });
            }

            if (!columns.includes("encrypted_data")) {
                db.run("ALTER TABLE archived_files ADD COLUMN encrypted_data BLOB;", (err) => {
                    if (err) return;
                });
            }

            // التحقق من وجود سجلات
            db.get(`SELECT COUNT(*) AS count FROM archived_files`, (err, row) => {
                if (err) return;

                if (row.count > 0) {
                    return;
                } else if (dbExists) {
                    db.run(`DELETE FROM archived_files`, (err) => {
                        if (err) return;

                        // إعادة تعيين العداد AUTOINCREMENT
                        db.run(`DELETE FROM sqlite_sequence WHERE name='archived_files'`, (err) => {
                            if (err) return;
                        });
                    });
                }
            });
        });
    });
});

// إنشاء مجلد الأرشيف إذا لم يكن موجودًا
const archiveDir = path.join(__dirname, 'archive');

if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir);
}


// دالة لفتح قاعدة البيانات والتحقق من وجود الأعمدة وإنشاء الجدول
function manageDatabase() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const dbPath = path.join(__dirname, 'archive.db');

    // التأكد من وجود قاعدة البيانات قبل محاولة حذفها
    const dbExists = fs.existsSync(dbPath);

    // فتح قاعدة البيانات
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("❌ Error opening database:", err.message);
            return;
        }

        console.log("✅ Database opened successfully.");

        // إنشاء الجدول إذا لم يكن موجودًا
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS archived_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                file_extension TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                original_path TEXT NOT NULL,
                archived_path TEXT NOT NULL,
                archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        db.run(createTableQuery, (err) => {
            if (err) {
                console.error("❌ Error creating table:", err.message);
                return;
            }

            console.log("✅ Table 'archived_files' checked/created successfully.");

            // التحقق من وجود الأعمدة encryption_key و encrypted_data
            db.all("PRAGMA table_info(archived_files);", (err, rows) => {
                if (err) {
                    console.error("❌ Error checking table schema:", err.message);
                    return;
                }

                const columns = rows.map(row => row.name);
                if (!columns.includes("encryption_key")) {
                    db.run("ALTER TABLE archived_files ADD COLUMN encryption_key TEXT;", (err) => {
                        if (err) {
                            console.error("❌ Error adding encryption_key column:", err.message);
                        } else {
                            console.log("✅ encryption_key column added successfully.");
                        }
                    });
                }

                if (!columns.includes("encrypted_data")) {
                    db.run("ALTER TABLE archived_files ADD COLUMN encrypted_data BLOB;", (err) => {
                        if (err) {
                            console.error("❌ Error adding encrypted_data column:", err.message);
                        } else {
                            console.log("✅ encrypted_data column added successfully.");
                        }
                    });
                }

                // حذف جميع السجلات مباشرة بدون التحقق من عددها
                if (dbExists) {
                    console.log("🗑️ Deleting all entries...");

                    db.run(`DELETE FROM archived_files`, (err) => {
                        if (err) {
                            console.error("❌ Error deleting records:", err.message);
                            return;
                        }
                        console.log("✅ All records deleted.");

                        // إعادة تعيين العداد AUTOINCREMENT
                        db.run(`DELETE FROM sqlite_sequence WHERE name='archived_files'`, (err) => {
                            if (err) {
                                console.error("❌ Error resetting AUTOINCREMENT:", err.message);
                            } else {
                                console.log("✅ AUTOINCREMENT reset successfully.");
                            }
                        });

                        // حذف مجلد الأرشيف بعد حذف البيانات
                        const archiveDir = path.join(__dirname, 'archive');
                        if (fs.existsSync(archiveDir)) {
                            fs.rmSync(archiveDir, { recursive: true, force: true });
                            console.log(`✅ Deleted archive directory: ${archiveDir}`);
                        }
                    });
                }
            });
        });
    });

    // إنشاء مجلد الأرشيف إذا لم يكن موجودًا
    const archiveDir = path.join(__dirname, 'archive');
    console.log(`📂 Archive directory: ${archiveDir}`);

    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir);
        console.log(`✅ Created directory: ${archiveDir}`);
    }
    
    requestPassword();
     mainMenu();


}





function openFile(id) {
    db.get("SELECT archived_path, encryption_key FROM archived_files WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error("❌ Error retrieving file:", err.message);
            return;
        }

        if (!row) {
            console.log("❌ File not found.");
            return;
        }

        const encryptedFilePath = row.archived_path;
        const fileName = path.basename(encryptedFilePath, ".enc");
        const decryptedPath = path.join(archiveDir, fileName); // المسار لفك التشفير

        const encryptionKey = Buffer.from(row.encryption_key, 'hex');
        try {
            const encryptedData = fs.readFileSync(encryptedFilePath);

            // فك التشفير
            const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, Buffer.alloc(16, 0));
            const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

            fs.writeFileSync(decryptedPath, decryptedData);
            console.log(`✅ File successfully decrypted: ${decryptedPath}`);

            // فتح الملف
            exec(`"${decryptedPath}"`, (err) => {
                if (err) {
                    console.error("❌ Error opening file:", err);
                } else {
                    console.log("✅ File opened successfully.");
                    
                    // بعد غلق الملف، نعيد تشفيره
                    // ننتظر حتى يتم غلق الملف، ثم نقوم بإعادة تشفيره
                    encryptFileAndArchive(decryptedPath, encryptedFilePath, encryptionKey);
                }
            });
        } catch (err) {
            console.error("❌ Error decrypting the file:", err);
        }
    });
}

// دالة لإعادة تشفير الملف
function encryptFileAndArchive(decryptedPath, encryptedFilePath, encryptionKey) {
    try {
        const fileData = fs.readFileSync(decryptedPath);

        const cipher = crypto.createCipheriv("aes-256-cbc", encryptionKey, Buffer.alloc(16, 0));
        const encryptedData = Buffer.concat([cipher.update(fileData), cipher.final()]);

        // حفظ الملف المشفر مجددًا في الأرشيف
        fs.writeFileSync(encryptedFilePath, encryptedData);
        console.log(`✅ File successfully re-encrypted and archived: ${encryptedFilePath}`);

        // حذف الملف المفكوك بعد التشفير
        fs.unlinkSync(decryptedPath);
        console.log(`✅ Deleted decrypted file: ${decryptedPath}`);
    } catch (err) {
        console.error("❌ Error encrypting the file for archiving:", err);
    }
}



async function searchFiles() {
    const { keyword } = await inquirer.prompt([
        {
            type: "input",
            name: "keyword",
            message: "🔍 Enter search keyword (name, date, extension, path, or content):"
        }
    ]);

    const query = `
        SELECT * FROM archived_files 
        WHERE file_name LIKE ? 
        OR file_extension LIKE ? 
        OR archived_at LIKE ? 
        OR archived_path LIKE ?
    `;
    const params = Array(4).fill(`%${keyword}%`);

    try {
        let rows = await new Promise((resolve, reject) => {
            db.all(query, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (rows.length === 0) {
            console.log(chalk.yellow("⚠️ No matching files found."));
            return;
        }

        let resultsText = `=======================================\n`;
        resultsText += `📂 🔍 Search Results (${new Date().toLocaleString("en-US")}) - Total: ${rows.length} files\n`;
        resultsText += `=======================================\n\n`;

        const table = new cliTable({
            head: [
                chalk.white("🆔 ID"), chalk.white("📜 Name"), chalk.white("🗂️ Ext"), chalk.white("📏 Size (KB)"), chalk.white("📅 Date Archived"), chalk.white("📍 Path")
            ],
            colWidths: [5, 25, 8, 12, 18, 50],
            wordWrap: true
        });

        for (let row of rows) {
            table.push([
                row.id,
                row.file_name,
                row.file_extension,
                (row.file_size / 1024).toFixed(2),
                row.archived_at,
                row.archived_path
            ]);

            resultsText += `🆔 ${row.id}\n`;
            resultsText += `📜 Name: ${row.file_name}\n`;
            resultsText += `🗂️ Extension: ${row.file_extension}\n`;
            resultsText += `📏 Size: ${(row.file_size / 1024).toFixed(2)} KB\n`;
            resultsText += `📅 Date Archived: ${row.archived_at}\n`;
            resultsText += `📍 Path: ${row.archived_path}\n`;
            resultsText += `---------------------------------------\n`;
        }

        console.log(table.toString());

        // حفظ النتائج في ملف
        const fileName = "search_results.txt";
        fs.writeFileSync(fileName, resultsText, "utf8");
        console.log(chalk.blue(`📂 Search results saved in: ${fileName}`));

        // عرض خيار فتح الملف
        const { openFile } = await inquirer.prompt([
            {
                type: "confirm",
                name: "openFile",
                message: "📄 Do you want to open the search results file?",
                default: false
            }
        ]);

        if (openFile) {
            exec(`"${fileName}"`, (err) => {
                if (err) {
                    console.error(chalk.red(`❌ Error opening file: ${fileName}`));
                }
            });
        }

    } catch (error) {
        console.error(chalk.red("❌ Error searching records:"), error.message);
    }
}

// دالة لفتح متصفح الملفات



export async function archiveFile(filePath) {
    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveDir, fileName + ".enc");
    const fileExtension = path.extname(fileName).slice(1);
    const fileSize = fs.statSync(filePath).size;
    
    try {
        const fileData = fs.readFileSync(filePath);
        const cipher = crypto.createCipheriv("aes-256-cbc", encryptionKey, Buffer.alloc(16, 0));
        const encryptedData = Buffer.concat([cipher.update(fileData), cipher.final()]);
        
        fs.writeFileSync(archivePath, encryptedData);
        fs.unlinkSync(filePath); // حذف الملف الأصلي بعد التشفير

        console.log(`✅ File successfully encrypted and archived: ${archivePath}`);

        db.run(
            `INSERT INTO archived_files (file_name, file_extension, file_size, original_path, archived_path, encryption_key, encrypted_data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fileName, fileExtension, fileSize, filePath, archivePath, encryptionKey.toString("hex"), encryptedData.toString("hex")],
            function (err) {
                if (err) {
                    console.error("❌ Error saving record to database:", err.message);
                } else {
                    console.log(`📂 File record saved in database (ID: ${this.lastID})`);
                }
            }
        );
    } catch (err) {
        console.error("❌ Error encrypting or moving the file:", err);
    }
}


// دالة لعرض الملفات المؤرشفة في جدول
async function listArchivedFiles() {
    const spinner = ora("📦 Fetching archived files...").start();

    db.all("SELECT * FROM archived_files", (err, rows) => {
        if (err) {
            spinner.fail("❌ Error fetching records: " + err.message);
            return;
        }

        spinner.succeed(`🔍 Retrieved ${rows.length} rows.`);

        if (rows.length === 0) {
            console.log("📂 No archived files found.");
            return;
        }

        // تجهيز البيانات بدون استبدال القيم الأصلية
        const tableData = rows.map(row => ([
            row.id?.toString() || "",
            row.file_name || "",
            row.file_extension || "", // عرض الامتداد كما هو بدون تعديل
            row.file_size ? (row.file_size / 1024).toFixed(2) + " KB" : "", // عرض الحجم كما هو
            row.archived_at || "",
            row.archived_path || ""
        ]));

        // عرض الجدول
        terminal.clear();
        terminal.table(
            [["ID", "Name", "Extension", "Size (KB)", "Date Archived", "Path"], ...tableData],
            {
                hasBorder: true,
                borderChars: "lightRounded",
                width: terminal.width - 2,
                fit: true
            }
        );

        terminal("\nUse ↑ ↓ to scroll, Press 'q' to exit.\n");

        // تفعيل التحكم بلوحة المفاتيح
        terminal.grabInput({ mouse: "button" });

        terminal.on("key", (key) => {
            if (key === "q") {
                terminal("\nExiting...\n");
                process.exit();
            }
        });
    });
}


// دالة لحذف ملف من الأرشيف وإعادته إلى مساره الأصلي
async function restoreFile(id) {
    db.get("SELECT * FROM archived_files WHERE id = ?", [id], async (err, row) => {
        if (err) {
            console.error("❌ Error retrieving file:", err.message);
            return;
        }

        if (!row) {
            console.log("❌ File not found.");
            return;
        }

        const encryptedPath = row.archived_path;  // المسار المشفر
        const originalPath = row.original_path;  // المسار الأصلي للملف
        const encryptionKey = Buffer.from(row.encryption_key, 'hex'); // مفتاح التشفير

        try {
            // فك التشفير إلى المسار الأصلي
            await decryptFile(encryptedPath, originalPath, encryptionKey);

            // حذف الملف المشفر بعد نجاح فك التشفير
            fs.unlinkSync(encryptedPath);

            // حذف السجل من قاعدة البيانات
            db.run("DELETE FROM archived_files WHERE id = ?", [id], (err) => {
                if (err) {
                    console.error("❌ Error deleting record:", err.message);
                } else {
                    console.log(`✅ File restored successfully and decrypted: ${originalPath}`);
                }
            });
        } catch (err) {
            console.error("❌ Error restoring file:", err);
        }
    });
}


// دالة لحذف ملف نهائيًا من الأرشيف وقاعدة البيانات
async function deleteFile(id) {
    db.get("SELECT archived_path FROM archived_files WHERE id = ?", [id], async (err, row) => {
        if (err) {
            console.error("❌ Error retrieving file:", err.message);
            return;
        }

        if (!row) {
            console.log("❌ File not found.");
            return;
        }

        // طلب تأكيد المستخدم قبل الحذف
        const { confirm } = await inquirer.prompt([
            {
                type: "confirm",
                name: "confirm",
                message: chalk.red(`⚠️ Are you sure you want to delete this file permanently?`),
                default: false,
            },
        ]);

        if (!confirm) {
            console.log("🚫 Deletion cancelled.");
            return;
        }

        try {
            fs.unlinkSync(row.archived_path);
            db.run("DELETE FROM archived_files WHERE id = ?", [id], (err) => {
                if (err) {
                    console.error("❌ Error deleting record:", err.message);
                } else {
                    console.log("✅ File deleted permanently.");
                }
            });
        } catch (err) {
            console.error("❌ Error deleting file:", err);
        }
    });
}



function printTitle() {
    console.clear();
    
    console.log(
        gradient.pastel.multiline(
            figlet.textSync("File Manager", { 
                font: "Big",
                horizontalLayout: "full",
                verticalLayout: "default"
            })
        )
    );

    console.log(
        boxen(chalk.bold.white(" Welcome to the File Management System!"), { 
            padding: 1,  
            margin: .5,  
            backgroundColor: "black",
            borderStyle: "bold", 
            borderColor: "cyan", 
            align: "center"
        })
    );

    // جلب الوقت والتاريخ الحالي
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('en-GB'); // HH:mm:ss
    const formattedDate = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
    const timeAndDate = ` ${formattedTime}  ${formattedDate}`;

    // جلب الإحصائيات من الأرشيف
    const archiveStats = getArchiveStats();
    let statsMessage = "";

    if (archiveStats) {
        statsMessage = ` Total: ${archiveStats.total} | PDF: ${archiveStats.types.pdf} | DOCX: ${archiveStats.types.docx} | TXT: ${archiveStats.types.txt} | Excel: ${archiveStats.types.xlsx + archiveStats.types.xls} | Images: ${archiveStats.types.jpg + archiveStats.types.jpeg} | Other: ${archiveStats.types.other}`;
    } else {
        statsMessage = " No files found in archive.";
    }

    // طباعة الإحصائيات بجانب التاريخ والوقت
    console.log(
        boxen(
            chalk.bold.yellow(`${statsMessage} | ${timeAndDate}`), {
                padding: .5,
                margin: 1,
                backgroundColor: "black",
                borderStyle: "bold",
                borderColor: "cyan",
                align: "center"
            }
        )
    );

    console.log(
        chalk.underline(
            gradient(['#FF4500', '#FFA500', '#FFFF00'])(" Designed by Ahmed Amer\n")
        )
    );
}

// مسار مجلد الأرشيف
const archiveDirectory = path.resolve(__dirname, 'archive');  // استبدل هذا بمسار مجلد الأرشيف الفعلي لديك

// دالة لإحضار إحصائيات الأرشيف
function getArchiveStats() {
    const archiveFiles = getArchiveFiles(); // جلب الملفات من الأرشيف
    if (archiveFiles.length === 0) {
        return null;
    }

    // تصنيف الملفات حسب النوع
    const fileTypes = {
        pdf: 0,
        docx: 0,
        txt: 0,
        xlsx: 0,
        xls: 0,
        jpg: 0,
        jpeg: 0,
        other: 0
    };

    // تصنيف الملفات حسب النوع
    archiveFiles.forEach(file => {
        // إزالة وسم 'enc' إن وجد
        const originalName = file.replace(/\.enc$/, '');  
        const ext = path.extname(originalName).toLowerCase();

        if (ext === '.pdf') fileTypes.pdf++;
        else if (ext === '.docx') fileTypes.docx++;
        else if (ext === '.txt') fileTypes.txt++;
        else if (ext === '.xlsx') fileTypes.xlsx++;
        else if (ext === '.xls') fileTypes.xls++;
        else if (ext === '.jpg') fileTypes.jpg++;
        else if (ext === '.jpeg') fileTypes.jpeg++;
        else fileTypes.other++;
    });

    return {
        total: archiveFiles.length,
        types: fileTypes
    };
}

// دالة لإحضار الملفات من الأرشيف
function getArchiveFiles() {
    try {
        // قراءة الملفات من مجلد الأرشيف
        const files = fs.readdirSync(archiveDirectory);
        return files.filter(file => fs.statSync(path.join(archiveDirectory, file)).isFile());
    } catch (err) {
        console.error(chalk.red('Error reading archive directory:', err));
        return [];
    }
}





async function requestPassword() {
    const correctPassword = "1234"; // قم بتغييرها حسب الحاجة
    const { password } = await inquirer.prompt([
        {
            type: "password",
            name: "password",
            message: chalk.green("🔑 Please Enter Password :  "),
            mask: "*"
        }
    ]);

    if (password !== correctPassword) {
        console.log(chalk.yellowBright("❌ Wrong Password "));
        process.exit();
    }
}




async function convertImageToPdf(imagePath, pdfPath) {
    const image = await sharp(imagePath).toBuffer();
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const img = await pdfDoc.embedJpg(image);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    console.log(`✅ Image converted to PDF: ${pdfPath}`);
}

async function convertPdfToDocx(pdfPath) {
    if (!fs.existsSync(pdfPath)) {
        console.error(`❌ Error: The file is not found at the path: ${pdfPath}`);
        return;
    }

    // إذا كان الملف صورة، سيتم تحويله أولاً إلى PDF
    const extname = path.extname(pdfPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(extname)) {
        const tempPdfPath = pdfPath.replace(extname, '.pdf');
        await convertImageToPdf(pdfPath, tempPdfPath);
        pdfPath = tempPdfPath; // استبدال المسار بالـ PDF المحول
    }

    const outputDocxPath = pdfPath.replace(/\.pdf$/, ".docx");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(pdfBuffer);
    const extractedText = data.text.trim();
    const paragraphs = extractedText.split("\n").filter(p => p.trim() !== "");

    const doc = new Document({
        sections: [{
            properties: {},
            children: paragraphs.map(paragraph => {
                const isTitle = paragraph.includes(":") || paragraph.split(" ").length <= 5;
                return new Paragraph({
                    bidirectional: true,
                    children: [
                        new TextRun({
                            text: paragraph,
                            bold: isTitle,
                            size: isTitle ? 32 : 26,
                            font: "Arial",
                        }),
                    ],
                    spacing: { after: isTitle ? 250 : 150 },
                });
            }),
        }],
    });

    const docBuffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputDocxPath, docBuffer);
    console.log(`✅ Conversion successful: ${outputDocxPath}`);
}






async function mainMenu() {
    printTitle();

    while (true) {
        const { action } = await inquirer.prompt([  
            {
                type: "list",
                name: "action",
                prefix: " ",
                message: "", // إزالة الرسالة الثابتة هنا
                choices: [
                    { key: "A", name: "\x1b[1m\x1b[33m[1] [A] Archive a file\x1b[0m", value: "archive" },
                    { key: "L", name: "\x1b[1m\x1b[36m[2] [L] List archived files\x1b[0m", value: "list" },
                    { key: "S", name: "\x1b[1m\x1b[38;5;10m[3] [S] Search for files\x1b[0m", value: "search" },
                    { key: "SI", name: "\x1b[1m\x1b[38;5;214m[4] [SI] Search inside a file\x1b[0m", value: "searchInside" },
                    { key: "C", name: "\x1b[1m\x1b[38;5;49m[5] [C] Convert PDF ↔ DOCX\x1b[0m", value: "convert" },
                    { key: "O", name: "\x1b[1m\x1b[38;5;223m[6] [O] Open a file\x1b[0m", value: "open" },
                    { key: "R", name: "\x1b[1m\x1b[35m[7] [R] Restore a file\x1b[0m", value: "restore" },
                    { key: "X", name: "\x1b[1m\x1b[38;5;220m[8] [X] Delete a file\x1b[0m", value: "delete" },
                    { key: "B", name: "\x1b[1m\x1b[38;5;203m[9] [B] Backup the archive folder\x1b[0m", value: "backup" },
                    { key: "DB", name: "\x1b[1m\x1b[38;5;202m[10] [DB] Restore database\x1b[0m", value: "restoreDatabase" }, // إضافة هذا الخيار
                    { key: "E", name: "\x1b[1m\x1b[37m[x] [E] Exit\x1b[0m", value: "exit" }
                ],
                pageSize: 10,
                loop: false,
                transformer: (choice, { isSelected }) =>
                    isSelected ? chalk.bgBlack.yellow(`→ ${choice}`) : chalk.bold.yellowBright(choice),
            },
        ]);

        // إضافة الوظائف المختلفة
        if (action === "archive") {
            await openFilePicker(archiveFile);
        } else if (action === "list") {
            listArchivedFiles();
        } else if (action === "search") {
            await searchFiles();
        } else if (action === "searchInside") {
            await searchInsideFile();
        } else if (action === "convert") {
            await openFilePicker(convertPdfToDocx);
        } else if (action === "open") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.blue("🖥️ Enter file ID to open:") }]);
            openFile(parseInt(id));
        } else if (action === "restore") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.yellow("🔄 Enter file ID to restore:") }]);
            restoreFile(parseInt(id));
        } else if (action === "delete") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.red("⚠️ Enter file ID to delete:") }]);
            deleteFile(parseInt(id));
        } else if (action === "backup") {
            const { backup } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'backup',
                    message: 'Do you want to create a backup of the archive folder before exit? (yes/no)',
                    default: false,
                },
            ]);

            if (backup) {
                const archiveFolderPath = path.join(__dirname, 'archive'); // Path to archive folder
                const backupFolderPath = 'G:/Backup/ArchiveBackup'; // Path where backup will be stored
                const backupFilePath = path.join(backupFolderPath, 'archive_backup.tar.gz');

                // Ensure backup folder exists
                if (!fs.existsSync(backupFolderPath)) {
                    fs.mkdirSync(backupFolderPath, { recursive: true });
                }

                // Create the tar backup
                try {
                    await c(
                        {
                            gzip: true, 
                            file: backupFilePath,
                            cwd: path.dirname(archiveFolderPath),
                        },
                        [path.basename(archiveFolderPath)]
                    );
                    console.log(chalk.green(`Backup created successfully at ${backupFilePath}`));
                } catch (error) {
                    console.error(chalk.red(`Error creating backup: ${error.message}`));
                }
            }
        } else if (action === "restoreDatabase") { // هنا تحققنا من الخيار الجديد
            const { restoreDb } = await inquirer.prompt([{
                type: 'confirm',
                name: 'restoreDb',
                message: 'Do you want to restore the database? (yes/no)',
                default: false,
            }]);

            if (restoreDb) {
                console.log(chalk.yellow("Restoring the database..."));
                manageDatabase(); // استدعاء الدالة manageDatabase هنا
            }
        } else {
            console.log(chalk.magenta("\n👋 Exiting... Have a great day!\n"));
            process.exit();
        }

        // لا يوجد مسح للشاشة هنا، فقط نعرض الرسائل كما هي.
        console.log(chalk.blue('Returning to the main menu...'));
    }
}




async function openFilePicker(callback) {
    console.log("📂 Please select a file...");

    let command;
    if (process.platform === "win32") {
        command =
            'powershell -Command "chcp 65001; [System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\');$f = New-Object System.Windows.Forms.OpenFileDialog;$f.Filter = \'All Files (*.*)|*.*\';$f.ShowDialog() | Out-Null;$f.FileName"';
    } else if (process.platform === "darwin") {
        command = `osascript -e 'tell application "Finder" to choose file'`;
    } else {
        command = "zenity --file-selection";
    }

    exec(command, { encoding: "utf8" }, (error, stdout) => {
        if (error) {
            console.error("❌ Error selecting file:", error.message);
            return;
        }

        let filePath = stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.includes("---") && !line.includes("GAC"))
            .pop();

        if (!filePath) {
            console.log("❌ No file selected.");
            return;
        }

        filePath = decodeURIComponent(filePath);

        if (!fs.existsSync(filePath)) {
            console.error("❌ File not found:", filePath);
            return;
        }

        const fileDir = path.dirname(filePath);
        const fileExt = path.extname(filePath);
        const originalFileName = path.basename(filePath, fileExt);

        // 🔹 تحويل اسم الملف إلى كلمة إنجليزية واحدة بدون فواصل أو علامات
        let newFileName = transliterate(originalFileName).replace(/[^a-zA-Z0-9]/g, "");
        if (!newFileName) newFileName = "ConvertedFile"; // تجنب الاسم الفارغ
        const newFilePath = path.join(fileDir, newFileName + fileExt);

        fs.rename(filePath, newFilePath, (err) => {
            if (err) {
                console.error("❌ Error renaming file:", err.message);
                return;
            }
            console.log("✅ File renamed to:", newFilePath);
            callback(newFilePath);
        });
    });
}




async function extractTextFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let text = "";

    try {
        if (ext === ".docx") {
            const { value } = await mammoth.extractRawText({ path: filePath });
            text = value.toLowerCase();
        } else if (ext === ".xlsx") {
            const workbook = xlsx.readFile(filePath);
            const sheetNames = workbook.SheetNames;
            sheetNames.forEach(sheet => {
                const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1 });
                text += sheetData.flat().join(" ").toLowerCase() + " ";
            });
        } else if ([".jpg", ".jpeg", ".png"].includes(ext)) {
            const { data: { text: ocrText } } = await recognize(filePath);
            text = ocrText.toLowerCase();
        } else {
            console.warn(`⚠️ Unsupported file type: ${filePath}`);
        }
    } catch (error) {
        console.error(`❌ Error processing file ${filePath}:`, error.message);
    }

    return text;
}



if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir); // إنشاء مجلد مؤقت إذا لم يكن موجودًا

async function searchInsideFile() {
    try {
        const { keywords } = await inquirer.prompt([
            { type: 'input', name: 'keywords', message: chalk.cyan('🔍 Enter keywords (comma-separated):') }
        ]);

        const keywordsArray = keywords.split(',').map(k => k.trim().toLowerCase()); // تحويل الكلمات إلى lowercase

        let foundFiles = [];

        const files = await getEncryptedFiles(); // جلب الملفات المشفرة من قاعدة البيانات

        for (const { id, encryptedFilePath, encryptionKey, originalFileName } of files) {
            const decryptedPath = path.join('archive', originalFileName); // استبدال temp بـ archive

            try {
                await decryptFile(encryptedFilePath, decryptedPath, encryptionKey); // فك التشفير

                // ✅ تخطي الصور تلقائيًا
                if (/\.(jpg|jpeg|png|gif|bmp)$/i.test(originalFileName)) {
                    continue; // لا تحاول استخراج النص من الصور
                }

                let text = "";
                try {
                    text = await extractTextFromFile(decryptedPath); 
                    text = text.toLowerCase();
                } catch (error) {
                    continue; // تجاهل أي خطأ وعدم طباعة شيء
                }

                // التحقق مما إذا كانت جميع الكلمات موجودة
                const allKeywordsFound = keywordsArray.every(keyword => text.includes(keyword));

                if (allKeywordsFound) {
                    console.log(chalk.green(`✅ Keywords found in: ${originalFileName}`));
                    foundFiles.push(originalFileName);

                    // عرض تفاصيل إضافية للملف
                    const stats = fs.statSync(decryptedPath); // الحصول على بيانات الملف
                    const fileSize = (stats.size / 1024).toFixed(2); // الحجم بالـ KB
                    const folderPath = path.dirname(decryptedPath); // المسار الأصلي للفولدر

                    // عرض التفاصيل بجانب بعضها
                    console.log(chalk.cyan(`--- File Details ---`));
                    console.log(chalk.yellow(`ID: ${id}  |  Name: ${originalFileName}  |  Folder: ${folderPath}  |  Size: ${fileSize} KB`));
                    console.log(chalk.cyan(`--------------------`));
                }
            } catch (error) {
                // تجاهل الأخطاء
            } finally {
                // حذف النسخة المفكوك تشفيرها بعد البحث لضمان الأمان
                if (fs.existsSync(decryptedPath)) {
                    fs.unlinkSync(decryptedPath);
                }
            }
        }

        if (foundFiles.length === 0) {
            console.log(chalk.red('❌ No matches found for the given keywords.'));
        }
    } catch (error) {
        console.error(chalk.red("❌ Error:"), error.message);
    }
}


// 🔹 دالة لجلب الملفات المشفرة من قاعدة البيانات
function getEncryptedFiles() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, archived_path, encryption_key FROM archived_files", [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const files = rows.map(row => ({
                    id: row.id,  // إضافة الـ ID
                    encryptedFilePath: row.archived_path,
                    encryptionKey: Buffer.from(row.encryption_key, 'hex'),
                    originalFileName: path.basename(row.archived_path, ".enc")
                }));
                resolve(files);
            }
        });
    });
}


// 🔹 دالة لفك تشفير الملفات مؤقتًا للبحث فيها
function decryptFile(encryptedFilePath, decryptedPath, encryptionKey) {
    try {
        const encryptedData = fs.readFileSync(encryptedFilePath);
        const decipher = crypto.createDecipheriv("aes-256-cbc", encryptionKey, Buffer.alloc(16, 0));
        const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

        fs.writeFileSync(decryptedPath, decryptedData);
    } catch (err) {
        throw err; // لن نطبع أي شيء عند حدوث خطأ
    }
}

async function startApp() {
    await requestPassword();
    await mainMenu();
}

// تشغيل البرنامج
startApp();