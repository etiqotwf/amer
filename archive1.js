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
const { terminal } = terminalKit; // استخراج `terminal`






// تحويل __dirname في ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// فتح قاعدة بيانات SQLite
const dbPath = path.join(__dirname, 'archive.db');


// فتح قاعدة البيانات من جديد
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Error opening database:", err.message);
    } else {
    }
});



// إنشاء الجدول مع الأعمدة الجديدة
db.run(`
    CREATE TABLE archived_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_extension TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        archived_path TEXT NOT NULL,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
    } else {
        console.log("✅ Table 'archived_files' created successfully.");
    }
});


// التأكد من وجود مجلد الأرشيف
const archiveDir = path.join(__dirname, 'archive');
if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir);
}


function openFile(id) {
    db.get("SELECT archived_path FROM archived_files WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error("❌ Error retrieving file:", err.message);
            return;
        }

        if (!row) {
            console.log("❌ File not found.");
            return;
        }

        // فتح الملف باستخدام التطبيق الافتراضي
        exec(`"${row.archived_path}"`, (err) => {
            if (err) {
                console.error("❌ Error opening file:", err);
            } else {
                console.log("✅ File opened successfully.");
            }
        });
    });
}




async function extractTextFromDocx(filePath) {
    try {
        const { value: text } = await mammoth.extractRawText({ path: filePath });
        return text;
    } catch (error) {
        console.error(`❌ Error reading DOCX file (${filePath}):`, error.message);
        return "";
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

    const spinner = ora(chalk.green("🔍 Searching for files..."));
    spinner.start();

    try {
        let rows = await new Promise((resolve, reject) => {
            db.all(query, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        for (let row of rows) {
            const filePath = row.archived_path;
            const fileExtension = row.file_extension.toLowerCase();
            const textFileExtensions = ["txt", "json", "csv", "md", "log", "xml", "html"];
            
            if (textFileExtensions.includes(fileExtension)) {
                try {
                    const content = fs.readFileSync(filePath, "utf8");
                    if (content.includes(keyword)) {
                        console.log(chalk.green(`✅ Found keyword inside file: ${filePath}`));
                    }
                } catch (err) {
                    console.error(chalk.red(`❌ Error reading file: ${filePath}`));
                }
            } else if (fileExtension === "docx") {
                const content = await extractTextFromDocx(filePath);
                if (content.includes(keyword)) {
                    console.log(chalk.green(`✅ Found keyword inside DOCX file: ${filePath}`));
                }
            }
        }

        spinner.stop();

        if (rows.length === 0) {
            console.log(chalk.yellow("⚠️ No matching files found."));
            return;
        }

        const table = new cliTable({
            head: ["ID", "Name", "Ext", "Size (KB)", "Date Archived", "Path"].map(header => chalk.white.bold(header)),
            colWidths: [5, 25, 8, 12, 18, 50],
            wordWrap: true,
        });

        rows.forEach(row => {
            table.push([
                chalk.white.bold(row.id),
                chalk.white(row.file_name),
                chalk.white(row.file_extension),
                chalk.white((row.file_size / 1024).toFixed(2)),
                chalk.white(row.archived_at),
                chalk.white(row.archived_path)
            ]);
        });

        console.log(table.toString());
    } catch (error) {
        spinner.stop();
        console.error(chalk.red("❌ Error searching records:"), error.message);
    }
}


// دالة لفتح متصفح الملفات
async function openFilePicker() {
    console.log("📂 Please select a file...");

    let command;
    if (process.platform === "win32") {
        command =
            'powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\');$f = New-Object System.Windows.Forms.OpenFileDialog;$f.Filter = \'All Files (*.*)|*.*\';$f.ShowDialog() | Out-Null;$f.FileName"';
    } else if (process.platform === "darwin") {
        command = 'osascript -e \'tell app "Finder" to choose file\'';
    } else {
        command = "zenity --file-selection";
    }

    exec(command, (error, stdout) => {
        if (error) {
            console.error("❌ Error selecting file:", error.message);
            return;
        }

        const filePath = stdout.split("\r\n").filter((line) => line.trim() !== "" && !line.includes("GAC")).pop()?.trim();
        if (!filePath) {
            console.log("❌ No file selected.");
            return;
        }

        archiveFile(filePath);
    });
}

// دالة لنقل الملف إلى الأرشيف
async function archiveFile(filePath) {
    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveDir, fileName);
    const fileExtension = path.extname(fileName).slice(1); // استخراج الامتداد بدون النقطة
    const fileSize = fs.statSync(filePath).size; // الحجم بالبايت

    try {
        fs.renameSync(filePath, archivePath);
        console.log(`✅ File successfully archived: ${archivePath}`);

        db.run(
            `INSERT INTO archived_files (file_name, file_extension, file_size, original_path, archived_path) VALUES (?, ?, ?, ?, ?)`,
            [fileName, fileExtension, fileSize, filePath, archivePath],
            function (err) {
                if (err) {
                    console.error("❌ Error saving record to database:", err.message);
                } else {
                    console.log(`📂 File record saved in database (ID: ${this.lastID})`);
                }
            }
        );
    } catch (err) {
        console.error("❌ Error moving the file:", err);
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
function restoreFile(id) {
    db.get("SELECT * FROM archived_files WHERE id = ?", [id], (err, row) => {
        if (err) {
            console.error("❌ Error retrieving file:", err.message);
            return;
        }

        if (!row) {
            console.log("❌ File not found.");
            return;
        }

        try {
            fs.renameSync(row.archived_path, row.original_path);
            db.run("DELETE FROM archived_files WHERE id = ?", [id], (err) => {
                if (err) {
                    console.error("❌ Error deleting record:", err.message);
                } else {
                    console.log(`✅ File restored successfully: ${row.original_path}`);
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



// طباعة العنوان الكبير
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
        boxen(chalk.bold.white("📌 Welcome to the File Management System!"), { 
            padding: 1,  
            margin: 1,  
            backgroundColor: "black", // جعل الخلفية سوداء
            font: "Big",
            borderStyle: "bold", 
            borderColor: "cyan", 
            align: "center"
        })
    );
console.log(
    chalk.underline(
        gradient(['#FF4500', '#FFA500', '#FFFF00'])("🎨 Designed by Ahmed Amer\n")
    )
);
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

async function mainMenu() {
    printTitle();

    while (true) {
        const { action } = await inquirer.prompt([
            {
                type: "list",
                name: "action",
                prefix: " ",
                message: " ",
                choices: [
                    { key: "A", name: "\x1b[1m\x1b[33m[1] [A] Archive a file\x1b[0m", value: "archive" },
                    { key: "L", name: "\x1b[1m\x1b[36m[2] [L] List archived files\x1b[0m", value: "list" },
                    { key: "S", name: "\x1b[1m\x1b[38;5;203m[3] [S] Search for files\x1b[0m", value: "search" },
                    { key: "SI", name: "\x1b[1m\x1b[38;5;214m[4] [SI] Search inside a file\x1b[0m", value: "searchInside" },
                    { key: "O", name: "\x1b[1m\x1b[32m[5] [O] Open a file\x1b[0m", value: "open" },
                    { key: "R", name: "\x1b[1m\x1b[35m[6] [R] Restore a file\x1b[0m", value: "restore" },
                    { key: "X", name: "\x1b[1m\x1b[91m[7] [X] Delete a file\x1b[0m", value: "delete" },
                    { key: "E", name: "\x1b[1m\x1b[37m[8] [E] Exit\x1b[0m", value: "exit" }
                ],
                pageSize: 10,
                loop: false,
                transformer: (choice, { isSelected }) =>
                    isSelected ? chalk.bgBlack.yellow(`→ ${choice}`) : chalk.bold.yellowBright(choice),
            },
        ]);

        if (action === "archive") {
            await openFilePicker();
        } else if (action === "list") {
            listArchivedFiles();
        } else if (action === "search") {
            await searchFiles();
        } else if (action === "searchInside") {
            await searchInsideFile();
        } else if (action === "open") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.blue("🖥️ Enter file ID to open:") }]);
            openFile(parseInt(id));
        } else if (action === "restore") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.yellow("🔄 Enter file ID to restore:") }]);
            restoreFile(parseInt(id));
        } else if (action === "delete") {
            const { id } = await inquirer.prompt([{ type: "input", name: "id", message: chalk.red("⚠️ Enter file ID to delete:") }]);
            deleteFile(parseInt(id));
        } else {
            console.log(chalk.magenta("\n👋 Exiting... Have a great day!\n"));
            process.exit();
        }
    }
}

async function searchInsideFile() {
    const { keyword } = await inquirer.prompt([
        { type: "input", name: "keyword", message: chalk.cyan("🔍 Enter keyword to search for:") }
    ]);

    if (!fs.existsSync(archiveDir)) {
        console.error(chalk.red(`❌ The directory "${archiveDir}" does not exist.`));
        return;
    }

    const files = fs.readdirSync(archiveDir).filter(file => file.endsWith(".docx"));
    let found = false;

    for (const file of files) {
        const filePath = path.join(archiveDir, file);
        try {
            const { value: text } = await mammoth.extractRawText({ path: filePath });
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                console.log(chalk.green(`✅ Keyword "${keyword}" found in: ${filePath}`));
                exec(`"${filePath}"`); // Open the file automatically
                found = true;
                break; // Exit after finding the first match
            }
        } catch (error) {
            console.error(chalk.red(`❌ Error reading file ${file}:`), error.message);
        }
    }

    if (!found) {
        console.log(chalk.red(`❌ No matches found for "${keyword}".`));
    }
}


async function startApp() {
    await requestPassword();
    await mainMenu();
}

// تشغيل البرنامج
startApp();
