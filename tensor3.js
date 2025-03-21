import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import readline from 'readline';



// استيراد createCanvas من مكتبة 'canvas' لإنشاء ورسم الرسوم البيانية بدون الحاجة إلى مستعرض
import { createCanvas } from 'canvas';

// استيراد مكتبة Chart.js لرسم الرسوم البيانية بسهولة
import Chart from 'chart.js/auto';

// استيراد الدالة 'exec' من وحدة 'child_process' لتشغيل أوامر النظام في بيئة Node.js
import { exec } from 'child_process';

// استيراد مكتبة 'xlsx' للتعامل مع ملفات Excel بصيغة XLSX (قراءة وكتابة البيانات)
import * as XLSX from 'xlsx';


// تحديد مسار حفظ الرسم البياني المُنشأ
const CHART_PATH = './price_chart.png';

// تحديد مسار ملف Excel الذي يحتوي على العمليات أو البيانات المخزنة
const EXCEL_PATH = './operations.xlsx';



const MODEL_FILE = 'model.json';
const WEIGHTS_FILE = 'weights.bin';
const NORMALIZATION_FILE = 'normalization.json';
const USD_TO_EGP = 50.67;

function modelExists() {
    return fs.existsSync(MODEL_FILE) && fs.existsSync(WEIGHTS_FILE) && fs.existsSync(NORMALIZATION_FILE);
}

function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 20, activation: 'relu', inputShape: [8] }));
    model.add(tf.layers.dropout(0.2));
    model.add(tf.layers.dense({ units: 10, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));
    model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
    console.log("🏗️ New model created!");
    return model;
}

async function saveModel(model, normalizationParams) {
    await model.save(tf.io.withSaveHandler(async (artifacts) => {
        fs.writeFileSync(MODEL_FILE, JSON.stringify({
            modelTopology: artifacts.modelTopology,
            weightSpecs: artifacts.weightSpecs
        }));
        fs.writeFileSync(WEIGHTS_FILE, Buffer.from(artifacts.weightData));
        fs.writeFileSync(NORMALIZATION_FILE, JSON.stringify(normalizationParams, null, 2));
        console.log("✅ Model & normalization parameters saved successfully!");
    }));
}

async function loadModel() {
    console.log("📂 Loading saved model...");
    const modelData = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
    const weightData = fs.readFileSync(WEIGHTS_FILE);
    const modelArtifacts = {
        modelTopology: modelData.modelTopology,
        weightSpecs: modelData.weightSpecs,
        weightData: new Uint8Array(weightData).buffer
    };
    const normalizationParams = JSON.parse(fs.readFileSync(NORMALIZATION_FILE, 'utf8'));
    const model = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
    return { model, normalizationParams };
}

function normalizeData(data, min, max) {
    return data.map(value => (value - min) / (max - min));
}

async function trainModel(model) {
    console.log("🏗️ Training the model with permit data...");
    
    const rawXs = [
        [500, 1, 3, 5, 20, 1, 100, 2022], [1000, 2, 5, 10, 50, 2, 150, 2021], [700, 1, 4, 7, 30, 3, 120, 2023],
        [1200, 3, 6, 12, 60, 1, 200, 2020], [800, 2, 3, 6, 25, 2, 130, 2022], [600, 1, 2, 4, 15, 3, 110, 2023],
        [1500, 3, 7, 15, 80, 1, 250, 2021], [400, 1, 2, 3, 10, 2, 90, 2023], [900, 2, 4, 8, 35, 3, 140, 2022]
    ];
    
    const rawYs = [[500000], [1200000], [700000], [1500000], [850000], [600000], [2000000], [450000], [950000]];
    
    const minInput = Math.min(...rawXs.flat());
    const maxInput = Math.max(...rawXs.flat());
    const minOutput = Math.min(...rawYs.flat());
    const maxOutput = Math.max(...rawYs.flat());
    
    const xs = tf.tensor2d(normalizeData(rawXs.flat(), minInput, maxInput), [rawXs.length, 8]);
    const ys = tf.tensor2d(normalizeData(rawYs.flat(), minOutput, maxOutput), [rawYs.length, 1]);
    
    await model.fit(xs, ys, { epochs: 1000 });
    console.log("✅ Training completed for permit data!");
    
    const normalizationParams = { minInput, maxInput, minOutput, maxOutput };
    await saveModel(model, normalizationParams);
    
    return normalizationParams;
}

async function askUserForInputs() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    function askQuestion(question) {
        return new Promise(resolve => rl.question(question, resolve));
    }
    
    const area = await askQuestion("📏 Enter construction area (square meters): ");
    const type = await askQuestion("🏠 Enter building type (1: Residential, 2: Pump Station, 3: Bridge): ");
    const floors = await askQuestion("🏢 Enter number of floors: ");
    const duration = await askQuestion("📅 Enter permit duration (years): ");
    const distance = await askQuestion("🌊 Enter distance from waterway (meters): ");
    const soilType = await askQuestion("🛠️ Enter soil type (1: Rocky, 2: Clay, 3: Sandy): ");
    const materialCost = await askQuestion("💰 Enter material cost per m²: ");
    const year = await askQuestion("📆 Enter application year: ");
    
    rl.close();
    return [parseFloat(area), parseInt(type), parseInt(floors), parseInt(duration), parseInt(distance), parseInt(soilType), parseFloat(materialCost), parseInt(year)];
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
    "📏  construction area (m²)",
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
    let model;
    let normalizationParams;

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
    console.log(`🔢 Inputs received: ${userInput.join(", ")}`);

    const normalizedInput = normalizeData(userInput, normalizationParams.minInput, normalizationParams.maxInput);
    const inputTensor = tf.tensor2d([normalizedInput]);

    const prediction = model.predict(inputTensor);
    const predictedEGP = (await prediction.data())[0] * (normalizationParams.maxOutput - normalizationParams.minOutput) + normalizationParams.minOutput;
    const predictedUSD = predictedEGP / USD_TO_EGP;

    console.log(`🔮 Predicted permit cost: $${predictedUSD.toFixed(2)} USD (${predictedEGP.toFixed(2)} EGP)`);


    await generateChart(userInput, predictedUSD, predictedEGP);
    await logToExcel(userInput, predictedUSD, predictedEGP);
    

}

runModel().catch(console.error);
