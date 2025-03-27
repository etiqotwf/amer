import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';


const MODEL_FILE = 'model.json';
const WEIGHTS_FILE = 'weights.bin';
const NORMALIZATION_FILE = 'normalization.json';
const REINFORCEMENT_FILE = 'reinforcement.json';
const BACKUP_FILE = "reinforcement.json.backup";
const TEMP_FILE = "reinforcement.json.tmp";
import path from 'path';
import os from 'os';
const HELP_FILE = 'help.txt';
const LEARNING_RATE = 0.01;
const EPOCHS = 100;
const DISCOUNT_FACTOR = 0.95;
const EPSILON = 0.1;
const REPLAY_BUFFER_SIZE = 100;
const command = process.argv[2];
import { spawn } from "child_process";
// استيراد createCanvas من مكتبة 'canvas' لإنشاء ورسم الرسوم البيانية بدون الحاجة إلى مستعرض
import { createCanvas } from 'canvas';

// استيراد مكتبة Chart.js لرسم الرسوم البيانية بسهولة
import Chart from 'chart.js/auto';

// استيراد مكتبة 'xlsx' للتعامل مع ملفات Excel بصيغة XLSX (قراءة وكتابة البيانات)
import * as XLSX from 'xlsx';


// تحديد مسار حفظ الرسم البياني المُنشأ
const CHART_PATH = './price_chart.png';

// تحديد مسار ملف Excel الذي يحتوي على العمليات أو البيانات المخزنة
const EXCEL_PATH = './operations.xlsx';




// وظيفة لعرض ملف المساعدة
function openHelpFile() {
    spawn("cmd", ["/c", "start", HELP_FILE], { detached: true, stdio: "ignore" }).unref();
    process.exit(0); // إنهاء التطبيق مباشرة بعد فتح الملف
}

if (command === "help") {
    openHelpFile();
}



// Function to reset all files
function resetFiles() {
    const files = [REINFORCEMENT_FILE, WEIGHTS_FILE, MODEL_FILE, NORMALIZATION_FILE];

    files.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`✅ Deleted: ${file}`);
        } else {
            console.log(`⚠️ Not found: ${file}`);
        }
    });

    console.log("🚀 All files have been reset.");
}

// Check if the script was run with "reset" argument
if (process.argv[2] === 'reset') {
    resetFiles();
    process.exit(); // Exit after resetting files
}


// Function to save and download the backup file
function saveBackup() {
    if (!fs.existsSync(BACKUP_FILE)) {
        console.log("❌ Backup file not found!");
        return;
    }

    // Get the user's Downloads folder
    const downloadsFolder = path.join(os.homedir(), 'Downloads');
    const destinationPath = path.join(downloadsFolder, BACKUP_FILE);

    // Copy the backup file to Downloads
    fs.copyFileSync(BACKUP_FILE, destinationPath);
    console.log(`✅ Backup file saved to: ${destinationPath}`);
}

// Check command-line arguments

if (command === 'reset') {
    resetFiles();
    process.exit();
} else if (command === 'save') {
    saveBackup();
    process.exit();
}





// ✅ تحميل البيانات وضمان أنها مصفوفة
let replayBuffer = [];

try {
    if (fs.existsSync(REINFORCEMENT_FILE)) {
        const data = fs.readFileSync(REINFORCEMENT_FILE, 'utf-8').trim();
        const parsedData = data ? JSON.parse(data) : [];

        // 🔹 If the data is an array, assign it; otherwise, keep the existing data
        if (Array.isArray(parsedData)) {
            replayBuffer = parsedData;
        } else {
            console.warn("⚠️ Warning: The replay file contains invalid data. Keeping the current buffer.");
        }
    } else {
        console.warn("⚠️ Warning: The replay file does not exist. Continuing with the current buffer.");
    }
} catch (error) {
    console.error("❌ Error: Unable to read the replay file.", error);
    console.warn("⚠️ Continuing with the existing buffer in memory.");
}


// ✅ التحقق مما إذا كان النموذج موجودًا
function modelExists() {
    const files = [MODEL_FILE, WEIGHTS_FILE, NORMALIZATION_FILE, REINFORCEMENT_FILE];

    for (let file of files) {
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
            return false;
        }
    }
    return true;
}

// ✅ وظيفة لحفظ بيانات التعليم المعزز بعد كل تحديث
function storeExperience(state, actualCost) {
    if (state == null || actualCost == null) {
        console.warn("⚠️ Warning: Invalid experience data received.");
        return;
    }

    // 🔹 تأكيد أن replayBuffer مصفوفة
    if (!Array.isArray(replayBuffer)) {
        console.warn("⚠️ replayBuffer was not an array. Resetting...");
        replayBuffer = [];
    }

    replayBuffer.push({ state, actualCost });

    if (replayBuffer.length > REPLAY_BUFFER_SIZE) {
        replayBuffer.splice(0, 1);
    }

    try {
        fs.writeFileSync(REINFORCEMENT_FILE, JSON.stringify(replayBuffer, null, 2));
        console.log(`📦 Data stored successfully. Current size: ${replayBuffer.length}`);
    } catch (error) {
        console.error("❌ Error saving reinforcement learning data:", error);
    }
    
}



function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [8] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));
    model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: 'meanSquaredError' });
    return model;
}




async function saveModel(model, normalizationParams, reinforcementData) {
    await model.save(tf.io.withSaveHandler(async (artifacts) => {
        fs.writeFileSync(MODEL_FILE, JSON.stringify({
            modelTopology: artifacts.modelTopology,
            weightSpecs: artifacts.weightSpecs
        }));
        fs.writeFileSync(WEIGHTS_FILE, Buffer.from(artifacts.weightData));
        fs.writeFileSync(NORMALIZATION_FILE, JSON.stringify(normalizationParams, null, 2));

        // Protect Replay Buffer data
        const TEMP_FILE = `${REINFORCEMENT_FILE}.tmp`;
        const BACKUP_FILE = `${REINFORCEMENT_FILE}.backup`;

        try {
            if (!Array.isArray(reinforcementData)) {
                console.warn("⚠️ Invalid reinforcement data! Skipping save.");
                return;
            }

            let existingData = [];

            // Load existing reinforcement data if available
            if (fs.existsSync(REINFORCEMENT_FILE)) {
                try {
                    const fileContent = fs.readFileSync(REINFORCEMENT_FILE, 'utf-8').trim();
                    if (fileContent.length > 0) {
                        existingData = JSON.parse(fileContent);
                        if (!Array.isArray(existingData)) {
                            console.warn("⚠️ Existing reinforcement file is not an array. Resetting...");
                            existingData = [];
                        }
                    }
                } catch (e) {
                    console.error("❌ Error reading existing reinforcement data:", e);
                    existingData = [];
                }
            }

            // Append new data to the existing array
            const updatedData = existingData.concat(reinforcementData);

            // Create a backup only if the file contains valid data
            if (existingData.length > 0) {
                fs.copyFileSync(REINFORCEMENT_FILE, BACKUP_FILE);
            }

            // Write to a temporary file first
            fs.writeFileSync(TEMP_FILE, JSON.stringify(updatedData, null, 2));

            // Replace the original file only after successful writing
            fs.renameSync(TEMP_FILE, REINFORCEMENT_FILE);

            // Validate record count after saving
            let savedData = [];
            let backupData = [];

            try {
                savedData = JSON.parse(fs.readFileSync(REINFORCEMENT_FILE, 'utf-8'));
            } catch (e) {
                console.error("❌ Failed to read saved data:", e);
            }

            if (fs.existsSync(BACKUP_FILE)) {
                try {
                    backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
                } catch (e) {
                    console.error("❌ Failed to read backup data:", e);
                }
            } else {
                console.warn("⚠️ Backup file not found, cannot validate record count.");
            }

            console.log(`📊 Records in backup: ${backupData.length}`);

            // Restore backup only if it contains valid data
            if (backupData.length > 0 && savedData.length !== backupData.length) {
                console.warn("⚠️ Record count mismatch detected. Restoring from backup...");
                fs.copyFileSync(BACKUP_FILE, REINFORCEMENT_FILE);
                console.log("✅ Reinforcement file restored from backup.");
            }

            console.log("✅ Model, reinforcement learning data & normalization parameters saved successfully!");

// Stop execution after success
process.exit(0);

        } catch (error) {
            console.error("❌ Error saving reinforcement data:", error);

            // Restore data only if the backup file is valid
            if (fs.existsSync(BACKUP_FILE)) {
                const backupContent = fs.readFileSync(BACKUP_FILE, 'utf-8').trim();
                if (backupContent.length > 0) {
                    fs.copyFileSync(BACKUP_FILE, REINFORCEMENT_FILE);
                    console.warn("⚠️ Data restored from backup due to an error.");
                } else {
                    console.warn("⚠️ Backup not restored because it is empty.");
                }
            }
// Exit with failure code after handling the error
process.exit(1);


        }
    }));
}




async function loadModel() {
    console.log("📂 Loading saved model...");

    try {
        // ✅ تحميل بيانات النموذج
        if (!fs.existsSync(MODEL_FILE) || !fs.existsSync(WEIGHTS_FILE)) {
            throw new Error("❌ Model files not found!");
        }

        const modelData = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
        const weightData = fs.readFileSync(WEIGHTS_FILE);
        const modelArtifacts = {
            modelTopology: modelData.modelTopology,
            weightSpecs: modelData.weightSpecs,
            weightData: new Uint8Array(weightData).buffer
        };

        // ✅ تحميل بيانات التطبيع
        if (!fs.existsSync(NORMALIZATION_FILE)) {
            throw new Error("❌ Normalization file not found!");
        }
        const normalizationParams = JSON.parse(fs.readFileSync(NORMALIZATION_FILE, 'utf8'));

        // ✅ تحميل بيانات التعليم التعزيزي إن وجد
        let reinforcementData = {}; 
        if (fs.existsSync(REINFORCEMENT_FILE)) {
            reinforcementData = JSON.parse(fs.readFileSync(REINFORCEMENT_FILE, 'utf8'));
            console.log("📜 Reinforcement Learning Data Loaded");
        } else {
            console.warn("⚠️ Reinforcement learning file not found!");
        }

        // ✅ القيم الافتراضية لا تُكتب في الملف، تُستخدم فقط عند الحاجة
        const defaultReinforcement = {
            learningRate: 0.01,
            discountFactor: 0.99,
            explorationRate: 0.1
        };

        // ✅ استخدام القيم الافتراضية عند الحاجة **دون تعديل الملف**
        const finalReinforcementData = {
            learningRate: reinforcementData.learningRate ?? defaultReinforcement.learningRate,
            discountFactor: reinforcementData.discountFactor ?? defaultReinforcement.discountFactor,
            explorationRate: reinforcementData.explorationRate ?? defaultReinforcement.explorationRate
        };

        // ✅ تحميل النموذج في TensorFlow.js
        const model = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));

        // ✅ **إعادة تجميع النموذج بعد التحميل لحل المشكلة**
        model.compile({
            optimizer: tf.train.adam(),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });

        console.log("✅ Model loaded and compiled successfully!");
        return { model, normalizationParams, reinforcementData: finalReinforcementData };

    } catch (error) {
        console.error("⚠️ Error loading model:", error.message);
        return null;
    }
}



function normalizeData(data, min, max) {
    if (!Array.isArray(data) || data.some(isNaN)) {
        throw new Error("❌ The input data must be an array of numbers!");
    }

    return data.map((value, index) => {
        if (value < min[index]) {
            console.warn(`⚠️ Warning: Value at index ${index} is below the minimum (${value} < ${min[index]}). It will be set to the minimum.`);
            value = min[index];
        } else if (value > max[index]) {
            console.warn(`⚠️ Warning: Value at index ${index} exceeds the maximum (${value} > ${max[index]}). It will be set to the maximum.`);
            value = max[index];
        }

        return (value - min[index]) / (max[index] - min[index]);
    });
}






async function trainModel(model) {
    console.log("🏗️ Training the model with reinforcement learning...");

    // تحميل البيانات من Replay Buffer
    let replayBuffer = [];
    try {
        const bufferData = fs.readFileSync(REINFORCEMENT_FILE, "utf-8");
        replayBuffer = JSON.parse(bufferData);
    } catch (error) {
        console.warn("⚠️ No data in Replay Buffer, default data will be used.");
    }

    // بيانات التدريب الأساسية
    let rawXs = [
        [500, 1, 3, 5, 20, 1, 100, 2022],
        [1000, 2, 5, 10, 50, 2, 150, 2021],
        [700, 1, 4, 7, 30, 3, 120, 2023],
        [1200, 3, 6, 12, 60, 1, 200, 2020]
    ];

    let rawYs = [[50000], [120000], [70000], [150000]];

    replayBuffer.forEach(data => {
        if (data.state.length === 8) { // تأكد أن الإدخال يحتوي على 8 قيم
            rawXs.push(data.state);
            rawYs.push([data.actualCost]); // تحويل القيمة إلى مصفوفة
        } else {
            console.error("❌ خطأ: بيانات Replay Buffer غير متوافقة", data);
        }
    });
    


// ✅ طباعة بيانات rawXs و rawYs للتأكد من صحة القيم قبل التدريب
console.log("rawXs:", rawXs);
console.log("rawYs:", rawYs);

    console.log(`📊 Training data used: ${rawXs.length} records`);



    // 📌 حساب min و max لكل عمود في rawXs
    const minInput = rawXs[0].map((_, colIndex) => Math.min(...rawXs.map(row => row[colIndex])));
    const maxInput = rawXs[0].map((_, colIndex) => Math.max(...rawXs.map(row => row[colIndex])));

    // 📌 حساب min و max لـ rawYs
    const minOutput = Math.min(...rawYs.flat());
    const maxOutput = Math.max(...rawYs.flat());

    // 📌 تطبيع البيانات
    const normalizedXs = rawXs.map(row => row.map((value, colIndex) => {
        const diff = maxInput[colIndex] - minInput[colIndex] || 1e-8;
        return (value - minInput[colIndex]) / diff;
    }));

    const normalizedYs = rawYs.map(row => row.map(value => {
        const diff = maxOutput - minOutput || 1e-8;
        return (value - minOutput) / diff;
    }));

    // 📌 تحويل البيانات إلى Tensors
    const xs = tf.tensor2d(normalizedXs);
    const ys = tf.tensor2d(normalizedYs);

    try {
        console.log("🚀 Training started...");
        await model.fit(xs, ys, { 
            epochs: EPOCHS, 
            batchSize: 32 // يمكنك تجربة قيم أخرى مثل 16، 64، حسب البيانات المتاحة
        });
        
        console.log("✅ Training completed!");
    } catch (error) {
        console.error("❌ Error during training:", error);
        return null;
    }

    // 📌 حفظ النموذج وقيم التطبيع
    const normalizationParams = { minInput, maxInput, minOutput, maxOutput };

    // استخراج فقط الإدخالات الجديدة من Replay Buffer
const reinforcementData = replayBuffer.map(data => ({
    state: data.state,
    actualCost: data.actualCost
}));

// حفظ النموذج باستخدام الإدخالات الجديدة فقط
await saveModel(model, normalizationParams, reinforcementData);


    return normalizationParams;
}




async function reinforcementLearning(model, userInput, actualCost, normalizationParams) {
    if (!model || !userInput || actualCost == null || !normalizationParams) {
        console.warn("⚠️ Warning: Invalid input to reinforcementLearning.");
        return;
    }

    if (Math.random() < EPSILON) return;

    // 📌 حساب `newState` بناءً على بيانات الإدخال
    const newState = [...userInput]; // فقط مدخلات المستخدم بدون `actualCost`
    storeExperience(newState, actualCost);

    await trainModel(model);

    console.log(`📦 Buffer size: ${replayBuffer.length}`);

    if (replayBuffer.length < 10) return;

    // 📌 أخذ آخر 50 تجربة أو جميع البيانات إن كانت أقل من 50
    const batch = replayBuffer.slice(-Math.min(50, replayBuffer.length));

    for (const { state, actualCost } of batch) {
        let inputTensor, actualTensor;

        // 📌 معالجة البيانات داخل `tf.tidy()`
        const tensors = tf.tidy(() => {
            const normalizedInput = normalizeData(state, normalizationParams.minInput, normalizationParams.maxInput);
            inputTensor = tf.tensor2d([normalizedInput]);
            const predictedTensor = model.predict(inputTensor);
            const predictedCost = predictedTensor.dataSync()[0];

            const reward = -Math.abs(actualCost - predictedCost);
            const targetCost = actualCost + DISCOUNT_FACTOR * reward;
            actualTensor = tf.tensor2d([[targetCost]]);

            return { inputTensor, actualTensor };
        });

        // ✅ تأكد من تجميع النموذج قبل التدريب
        if (!model.optimizer) {
            console.log("🔄 Compiling model before training...");
            model.compile({
                optimizer: 'adam',
                loss: 'meanSquaredError'
            });
        }

        try {
            console.log("🎯 Training model...");
            await model.fit(tensors.inputTensor, tensors.actualTensor, { epochs: 50, batchSize: 5 });
            console.log("🧠 Model trained!");

            await saveModel(model, normalizationParams, replayBuffer);
            console.log("✅ Model updated and saved successfully!");
        } catch (err) {
            console.error("❌ Training error:", err);
        } finally {
            // 🔴 تحرير الذاكرة يدويًا
            tensors.inputTensor.dispose();
            tensors.actualTensor.dispose();
        }
    }
}





async function askUserForInputs() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    function askQuestion(question) {
        return new Promise(resolve => rl.question(question, answer => resolve(parseFloat(answer) || 0)));
    }
    
    const questions = [
        "📏 Enter construction area (square meters): ",
        "🏠 Enter building type (1: Residential, 2: Pump Station, 3: Bridge): ",
        "🏢 Enter number of floors: ",
        "📅 Enter permit duration (years): ",
        "🌊 Enter distance from waterway (m): ",
        "🛠️ Enter soil type (1: Rocky, 2: Clay, 3: Sandy): ",
        "💰 Enter material cost per m²: ",
        "📆 Enter application year: "
    ];
    
    const inputs = [];
    for (const question of questions) {
        inputs.push(await askQuestion(question));
    }
    
    rl.close();
    return inputs;
}

async function askForActualCost() {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question("💰 input actualCost and save record : ", answer => {
            rl.close();
            resolve(parseFloat(answer) || 0);
        });
    });
}



async function generateChart(userInputs, permitFee) {
    const width = 700, height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // تحويل القيم الرقمية لنوع المبنى إلى نصوص واضحة بالعربية
    const buildingTypes = ["سكن", "محطة", "كوبري"];
    const buildingType = buildingTypes[userInputs[1] - 1] || "غير معروف";

    // تحويل القيم الرقمية لنوع التربة إلى نصوص واضحة بالعربية
    const soilTypes = ["طينية", "رملية", "زلطية", "صخرية"];
    const soilType = soilTypes[userInputs[5] - 1] || "غير معروف";

    // سنة الترخيص (لا تُعرض كقيمة كبيرة)
    const permitYear = userInputs[7];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [
                '📏 المساحة (م²)', 
                '🏠 نوع المبنى', 
                '🏢 عدد الطوابق', 
                '📅 المدة (سنوات)', 
                '🌊 المسافة (م)', 
                '🛠️ نوع التربة', 
                '💰 تكلفة المواد (للمتر²)'
            ],
            datasets: [{
                label: 'معايير الترخيص',
                data: [
                    userInputs[0], 
                    1, // تمثيل نوع المبنى برقم صغير حتى لا يؤثر على الارتفاع
                    userInputs[2], 
                    userInputs[3], 
                    userInputs[4], 
                    1, // تمثيل نوع التربة برقم صغير 
                    userInputs[6] 
                ],
                backgroundColor: ['#36A2EB', '#FFCE56', '#4CAF50', '#FF6384', '#8E44AD', '#FFC300', '#C70039']
            }]
        },
        options: {
            responsive: false,
            plugins: {
                title: {
                    display: true,
                    text: [
                        '🌊 الترخيص بإقامة أعمال خاصة داخل الأملاك العامة ذات الصلة بالموارد المائية والري 🌊',
                        `📊 المدخلات: مساحة ${userInputs[0]}م²، نوع ${buildingType}, طوابق ${userInputs[2]}, مدة ${userInputs[3]} سنوات، مسافة ${userInputs[4]}م`,
                        `🛠️ نوع التربة: ${soilType} - 💰 تكلفة المواد: ${userInputs[6]} ج.م للمتر² - 📆 سنة الترخيص: ${permitYear}`,
                      `💰 التكلفة المقدرة للترخيص: $${permitFee.toFixed(2)} 💰`

                    ],
                    font: { 
                        size: 19,
                        weight: 'bold',
                        family: 'Arial'
                    },
                    color: 'white',
                    padding: { top: 15, bottom: 15 }
                },
                legend: { display: false },
                tooltip: { enabled: true },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: 'white',
                    font: { size: 16, weight: 'bold' },
                    formatter: function(value, context) {
                        if (context.dataIndex === 1 || context.dataIndex === 5) {
                            return ""; // عدم عرض القيم الخاصة بنوع المبنى والتربة
                        }
                        return `${Math.round(value).toLocaleString()} ج.م`;
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '📏 معايير البناء',
                        color: 'white',
                        font: { size: 18, weight: 'bold' }
                    },
                    ticks: { color: 'white', font: { weight: 'bold' } },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }
                },
                y: {
                    title: {
                        display: true,
                        text: '📊 القيم',
                        color: 'white',
                        font: { size: 18, weight: 'bold' }
                    },
                    ticks: { 
                        color: 'white',
                        font: { weight: 'bold' },
                        beginAtZero: true,
                        callback: function(value) {
                            return `${Math.round(value).toLocaleString()} ج.م`;
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }
                }
            },
            barThickness: 50 // 🔥 زيادة سماكة الأعمدة
        }
    });

    // تحويل الرسم البياني إلى صورة بصيغة PNG
    const buffer = canvas.toBuffer('image/png');

    // حفظ الصورة كملف محلي
    await fs.promises.writeFile(CHART_PATH, buffer);
    console.log(`📊 Chart saved as ${CHART_PATH}`);

    // فتح الصورة تلقائيًا بعد حفظها
    exec(`start ${CHART_PATH}`, (err) => {
        if (err) console.error("⚠️ فشل في فتح الرسم البياني:", err);
    });
}






async function logToExcel(userInputs, priceUSD, priceEGP) {
    try {
        let workbook;
        try {
            // 📂 محاولة قراءة ملف Excel إذا كان موجودًا
            const fileBuffer = await fs.promises.readFile(EXCEL_PATH);
            workbook = XLSX.read(fileBuffer, { type: "buffer" });
        } catch {
            // 📄 إنشاء ملف جديد إذا لم يكن موجودًا
            workbook = XLSX.utils.book_new();
            const sheet = XLSX.utils.aoa_to_sheet([
                [
                    "📆 Date & Time",
    "📏  construction area (square meters)",
    "🏠  building type (1: Residential, 2: Pump Station, 3: Bridge)",
    "🏢  number of floors",
    "📅  permit duration (years)",
    "🌊  distance from waterway (m)",
    "🛠️  soil type (1: Rocky, 2: Clay, 3: Sandy)",
    "💰  material cost per m²",
    "📆  application year",
    "💰  house price (USD)",
    "💰  house price (EGP)"
                ]
            ]);
            XLSX.utils.book_append_sheet(workbook, sheet, "PermitData");
        }

        // 📜 الحصول على ورقة البيانات
        const sheet = workbook.Sheets["PermitData"];
        
        // 📝 تجهيز صف البيانات الجديد
        const newRow = [
            new Date().toISOString().replace("T", " ").slice(0, 19), // 🕒 التاريخ بصيغة إنجليزية YYYY-MM-DD HH:MM:SS
            ...userInputs, // 📌 القيم المدخلة
            priceUSD.toFixed(2), // 💲 السعر بالدولار
            priceEGP.toFixed(2)   // 💰 السعر بالجنيه المصري
        ];

        // 📌 تحويل ورقة البيانات إلى مصفوفة JSON لتحديثها
        const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // ➕ إضافة الصف الجديد إلى البيانات
        sheetData.push(newRow);

        // 🔄 إعادة تحويل البيانات إلى ورقة عمل
        const newSheet = XLSX.utils.aoa_to_sheet(sheetData);
        workbook.Sheets["PermitData"] = newSheet;

        // 💾 حفظ الملف بعد التحديث
        const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
        await fs.promises.writeFile(EXCEL_PATH, excelBuffer);

        console.log("✅ Operation logged in Excel successfully!"); // ✅ تأكيد نجاح العملية
    } catch (error) {
        console.error("⚠️ Error logging to Excel:", error);
    }
}





async function runModel() {
    let model, normalizationParams;
    const USD_TO_EGP = 50.67; // استبدل بالقيمة الفعلية لسعر الصرف

    if (modelExists()) {
        console.log("📦 Found saved model. Loading...");
        ({ model, normalizationParams } = await loadModel());
    } else {
        console.log("🏗️ No saved model found. Training a new model...");
        model = createModel();
        normalizationParams = await trainModel(model);
    }

    if (!normalizationParams) {
        console.error("❌ Error: Normalization parameters are missing! Cannot proceed.");
        return;
    }

    const userInput = await askUserForInputs();
    if (userInput.includes(undefined) || userInput.includes(NaN)) {
        console.error("❌ Error: Invalid user input.");
        return;
    }

    console.log(`🔢 Inputs received: ${userInput.join(", ")}`);

    const normalizedInput = normalizeData(userInput, normalizationParams.minInput, normalizationParams.maxInput);
    if (normalizedInput.includes(NaN)) {
        console.error("❌ Error: Normalized data contains NaN.");
        return;
    }

    const inputTensor = tf.tensor2d([normalizedInput]);
    const predictedTensor = model.predict(inputTensor);
    const predictedCostNormalized = predictedTensor.dataSync()[0];

    if (isNaN(predictedCostNormalized)) {
        console.error("❌ Error: Predicted cost is NaN.");
        return;
    }

    const predictedCost = predictedCostNormalized * (normalizationParams.maxOutput - normalizationParams.minOutput) + normalizationParams.minOutput;
    const predictedUSD = predictedCost / USD_TO_EGP;

    console.log(`🔮 Predicted permit cost: $${predictedUSD.toFixed(2)} USD (${predictedCost.toFixed(2)} EGP)`);

    // إضافة إنشاء المخطط
    await generateChart(userInput, predictedUSD, predictedCost);
    
    // إضافة حفظ البيانات في ملف إكسل
    await logToExcel(userInput, predictedUSD, predictedCost);
    
    const actualCost = await askForActualCost();
    await reinforcementLearning(model, userInput, parseFloat(actualCost), normalizationParams);
}

runModel().catch(console.error);
