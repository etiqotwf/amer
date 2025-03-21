// استيراد مكتبة TensorFlow.js لاستخدامها في بناء النماذج والتعامل مع البيانات
import * as tf from '@tensorflow/tfjs';

// استيراد وحدة 'fs/promises' من Node.js للتعامل مع نظام الملفات بطريقة غير متزامنة
import fs from 'fs/promises';

// استيراد وحدة 'readline' من Node.js لإنشاء واجهة لقراءة الإدخال من المستخدم عبر سطر الأوامر
import readline from 'readline';

// استيراد createCanvas من مكتبة 'canvas' لإنشاء ورسم الرسوم البيانية بدون الحاجة إلى مستعرض
import { createCanvas } from 'canvas';

// استيراد مكتبة Chart.js لرسم الرسوم البيانية بسهولة
import Chart from 'chart.js/auto';

// استيراد الدالة 'exec' من وحدة 'child_process' لتشغيل أوامر النظام في بيئة Node.js
import { exec } from 'child_process';

// استيراد مكتبة 'xlsx' للتعامل مع ملفات Excel بصيغة XLSX (قراءة وكتابة البيانات)
import * as XLSX from 'xlsx';

// تحديد مسار حفظ نموذج الذكاء الاصطناعي في ملف JSON
const MODEL_PATH = './model.json';

// تحديد مسار حفظ الرسم البياني المُنشأ
const CHART_PATH = './price_chart.png';

// تحديد مسار ملف Excel الذي يحتوي على العمليات أو البيانات المخزنة
const EXCEL_PATH = './operations.xlsx';

// تحديد سعر الصرف ليتم استخدامه في العمليات الحسابية داخل التطبيق
const EXCHANGE_RATE = 52;

/**
 * دالة لتطبيع البيانات، بحيث يتم تحويل القيم إلى نطاق بين 0 و 1 
 * مما يساعد في تحسين أداء النموذج عند التدريب
 * @param {Array} data - المصفوفة التي تحتوي على البيانات الأصلية
 * @param {number} min - الحد الأدنى للقيم في البيانات
 * @param {number} max - الحد الأقصى للقيم في البيانات
 * @returns {Array} - مصفوفة تحتوي على القيم بعد التطبيع
 */
function normalizeData(data, min, max) {
    return data.map(value => (value - min) / (max - min));
}

/**
 * دالة لإزالة التطبيع من البيانات المُعالجة سابقًا، حيث يتم إرجاع القيم إلى نطاقها الأصلي
 * بعد أن كانت بين 0 و 1
 * @param {Array} data - المصفوفة التي تحتوي على القيم المُطبّعة
 * @param {number} min - الحد الأدنى للقيم الأصلية
 * @param {number} max - الحد الأقصى للقيم الأصلية
 * @returns {Array} - مصفوفة تحتوي على القيم بعد إلغاء التطبيع
 */
function denormalizeData(data, min, max) {
    return data.map(value => value * (max - min) + min);
}

/**
 * دالة لحفظ النموذج المدرب داخل ملف JSON حتى يمكن إعادة استخدامه لاحقًا
 * @param {tf.LayersModel} model - النموذج الذي سيتم حفظه
 */
async function saveModel(model) {
    await model.save(tf.io.withSaveHandler(async (artifacts) => {
        // تحويل كائن النموذج إلى JSON ثم حفظه في ملف
        await fs.writeFile(MODEL_PATH, JSON.stringify(artifacts));
        console.log("💾 Model saved successfully!"); // طباعة رسالة نجاح عند الحفظ
    }));
}

/**
 * دالة لتحميل النموذج من ملف JSON إذا كان متوفرًا، وإذا لم يكن موجودًا، يتم إنشاء نموذج جديد
 * @returns {tf.LayersModel | null} - إما أن يتم إرجاع النموذج المحمّل أو null في حال عدم وجود نموذج محفوظ
 */
async function loadModel() {
    try {
        // التأكد مما إذا كان ملف النموذج موجودًا قبل تحميله
        await fs.access(MODEL_PATH);
        console.log("📂 Loading existing model...");

        // قراءة البيانات من ملف النموذج وتحويلها إلى كائن JSON
        const rawData = await fs.readFile(MODEL_PATH, 'utf-8');
        const modelArtifacts = JSON.parse(rawData);

        // تحميل النموذج إلى TensorFlow.js من البيانات المخزنة في الذاكرة
        return await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
    } catch {
        console.log("⚠️ No saved model found, creating a new one...");
        return null; // إرجاع null في حال عدم العثور على نموذج محفوظ
    }
}


/**
 * دالة لإنشاء نموذج الشبكات العصبية الاصطناعية باستخدام TensorFlow.js
 * يقوم هذا النموذج بتوقع الأسعار بناءً على 5 مدخلات
 */
function createModel() {
    const model = tf.sequential(); // إنشاء نموذج تسلسلي (Sequential)

    // إضافة الطبقة الأولى، وهي طبقة كثيفة (Dense) تحتوي على 10 خلايا عصبية
    model.add(tf.layers.dense({ 
        units: 10,               // عدد الخلايا العصبية في الطبقة
        activation: 'relu',      // استخدام دالة التنشيط ReLU لتحسين أداء النموذج
        inputShape: [5]          // تحديد عدد المدخلات (5 ميزات لكل بيانات)
    }));

    // إضافة الطبقة الأخيرة، وهي طبقة خرج تحتوي على خلية عصبية واحدة
    model.add(tf.layers.dense({ 
        units: 1                 // طبقة تحتوي على خلية واحدة لتوليد التوقع
    }));

    // تجميع (Compile) النموذج مع تحديد:
    // - المُحسّن 'adam' لتحسين أداء النموذج أثناء التدريب
    // - دالة الخطأ 'meanSquaredError' لحساب الخطأ بين القيم الفعلية والتوقعات
    model.compile({ 
        optimizer: 'adam', 
        loss: 'meanSquaredError' 
    });

    console.log("🏗️ New model created!"); // طباعة رسالة تفيد بإنشاء النموذج بنجاح
    return model; // إرجاع النموذج لاستخدامه في التدريب
}

/**
 * دالة لتدريب النموذج العصبي باستخدام بيانات تصاريح البناء على المجاري المائية
 * @param {tf.LayersModel} model - النموذج الذي سيتم تدريبه
 * @returns {Object} - القيم الدنيا والعليا للمدخلات والمخرجات لاستخدامها في إزالة التطبيع لاحقًا
 */
async function trainModel(model) {
    console.log("🏗️ Training the model with permit data...");

    // بيانات الإدخال (المساحة المطلوبة، نوع البناء، عدد الطوابق، مدة التصريح، المسافة عن المجرى المائي)
    const rawXs = [
        [500, 1, 3, 5, 20], [1000, 2, 5, 10, 50], [700, 1, 4, 7, 30],
        [1200, 3, 6, 12, 60], [800, 2, 3, 6, 25], [600, 1, 2, 4, 15],
        [1500, 3, 7, 15, 80], [400, 1, 2, 3, 10], [900, 2, 4, 8, 35]
    ];

    // الرسوم المطلوبة لإصدار التصريح (المخرجات)
    const rawYs = [
        [50000], [120000], [70000], [150000], [85000],
        [60000], [200000], [45000], [95000]
    ];

    // استخراج القيم الدنيا والعليا لتطبيع البيانات
    const minInput = Math.min(...rawXs.flat());
    const maxInput = Math.max(...rawXs.flat());
    const minOutput = Math.min(...rawYs.flat());
    const maxOutput = Math.max(...rawYs.flat());

    // تحويل البيانات إلى شكل TensorFlow
    const xs = tf.tensor2d(normalizeData(rawXs.flat(), minInput, maxInput), [rawXs.length, 5]);
    const ys = tf.tensor2d(normalizeData(rawYs.flat(), minOutput, maxOutput), [rawYs.length, 1]);

    // تدريب النموذج
    await model.fit(xs, ys, { epochs: 500 });

    console.log("✅ Training completed for permit data!");

    // حفظ النموذج بعد التدريب
    await saveModel(model);

    return { minInput, maxInput, minOutput, maxOutput };
}

/**
 * دالة لطلب المدخلات من المستخدم عبر سطر الأوامر
 * @returns {Promise<number[]>} - مصفوفة تحتوي على المدخلات بعد تحويلها إلى أرقام
 */
async function askUserForInputs() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    function askQuestion(question) {
        return new Promise(resolve => rl.question(question, resolve));
    }

    // طلب إدخال البيانات المتعلقة بالتصريح
    const area = await askQuestion("📏 Enter required construction area (square meters): ");
    const type = await askQuestion("🏠 Enter building type (1: Residential, 2: Pump Station, 3: Bridge): ");
    const floors = await askQuestion("🏢 Enter number of allowed floors: ");
    const duration = await askQuestion("📅 Enter permit duration (years): ");
    const distance = await askQuestion("🌊 Enter distance from nearest waterway (meters): ");

    rl.close();
    return [parseFloat(area), parseInt(type), parseInt(floors), parseInt(duration), parseInt(distance)];
}



async function generateChart(userInputs, permitFee) {
    const width = 600, height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

     // تحويل القيم الرقمية لنوع المبنى إلى نصوص واضحة بالعربية
const buildingTypes = ["سكن", "محطة", "كوبري"];
const buildingType = buildingTypes[userInputs[1] - 1] || "غير معروف"; // التأكد من التفسير الصحيح


    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['📏 المساحة (م²)', '🏠 نوع المبنى', '🏢 عدد الطوابق', '📅 المدة (سنوات)', '🌊 المسافة (م)'],
            datasets: [{
                label: 'معايير الترخيص',
                data: userInputs,
                backgroundColor: ['#36A2EB', '#FFCE56', '#4CAF50', '#FF6384', '#8E44AD']
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
                        `💰 التكلفة المقدرة للترخيص: $${Math.round(permitFee).toLocaleString()} 💰`
                    ],
                    font: { 
                        size: 17, // العنوان الرئيسي
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
                    font: { size: 14, weight: 'bold' },
                    formatter: function(value) {
                        return `$${Math.round(value).toLocaleString()}`;
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '📏 معايير البناء',
                        color: 'white',
                        font: { size: 18, weight: 'bold' } // 🔥 جعل الخط أثقل
                    },
                    ticks: { color: 'white', font: { weight: 'bold' } }, // 🔥 جعل الأرقام أثقل
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }
                },
                y: {
                    title: {
                        display: true,
                        text: '📊 القيم',
                        color: 'white',
                        font: { size: 18, weight: 'bold' } // 🔥 زيادة السمك
                    },
                    ticks: { 
                        color: 'white',
                        font: { weight: 'bold' }, // 🔥 زيادة سمك خط القيم
                        beginAtZero: true,
                        callback: function(value) {
                            return `$${Math.round(value).toLocaleString()}`;
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }
                }
            }
        }
    });

    // تحويل الرسم البياني إلى صورة بصيغة PNG
    const buffer = canvas.toBuffer('image/png');

    // Save the image as a local file
await fs.writeFile(CHART_PATH, buffer);
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
            const fileBuffer = await fs.readFile(EXCEL_PATH);
            workbook = XLSX.read(fileBuffer, { type: "buffer" });
        } catch {
            // 📄 إنشاء ملف جديد مع العناوين الجديدة بدون "Enter"
            workbook = XLSX.utils.book_new();
            const sheet = XLSX.utils.aoa_to_sheet([
                [
                    "Date & Time",
                    "Required construction area (square meters)",
                    "Building type (1: Residential, 2: Pump Station, 3: Bridge)",
                    "Number of allowed floors",
                    "Permit duration (years)",
                    "Distance from nearest waterway (meters)",
                    "Estimated house price (USD)",
                    "Estimated house price (EGP)"
                ]
            ]);
            XLSX.utils.book_append_sheet(workbook, sheet, "PermitData"); // تغيير اسم الورقة إلى "PermitData"
        }

        // 📜 الحصول على ورقة البيانات
        const sheet = workbook.Sheets["PermitData"];
        
        // 📝 تجهيز صف البيانات الجديد
        const newRow = [
            new Date().toISOString().replace("T", " ").slice(0, 19), // 🕒 التاريخ بصيغة إنجليزية YYYY-MM-DD HH:MM:SS
            ...userInputs, // 📌 القيم المدخلة (5 قيم)
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
        await fs.writeFile(EXCEL_PATH, excelBuffer);

        console.log("✅ Operation logged in Excel with new headers!"); // ✅ تأكيد نجاح العملية
    } catch (error) {
        console.error("⚠️ Error logging to Excel:", error); // ⚠️ طباعة الخطأ إن وجد
    }
}





// 🏠 تنفيذ البرنامج
(async () => {
    let model = await loadModel(); // 📥 تحميل النموذج إذا كان متاحًا
    let limits;
    if (!model) {
        model = createModel(); // 🏗️ إنشاء نموذج جديد إذا لم يكن موجودًا
        limits = await trainModel(model); // 🎯 تدريب النموذج على البيانات المتاحة
    }

    // 📩 طلب إدخال البيانات من المستخدم
    const userInputs = await askUserForInputs();
    console.log(`🔢 Inputs received: ${userInputs}`);

    // 🔄 تطبيع المدخلات لتحضيرها للإدخال في النموذج
    const normalizedInputs = normalizeData(userInputs, limits.minInput, limits.maxInput);
    const inputTensor = tf.tensor2d([normalizedInputs], [1, 5]);

    console.log("📊 Predicting house price...");
    const outputTensor = model.predict(inputTensor); // 📈 التنبؤ بالسعر باستخدام النموذج
    const outputArray = outputTensor.arraySync();

    // 🔄 إعادة البيانات إلى نطاقها الطبيعي لحساب السعر الفعلي
    const denormalizedOutput = denormalizeData(outputArray.flat(), limits.minOutput, limits.maxOutput);
    const priceUSD = denormalizedOutput[0]; // 💲 السعر بالدولار
    const priceEGP = priceUSD * EXCHANGE_RATE; // 💰 تحويل السعر إلى الجنيه المصري

    console.log(`🏠 Estimated house price: $${priceUSD.toFixed(2)} (~ EGP ${priceEGP.toFixed(2)})`);

    await generateChart(userInputs, priceUSD, priceEGP); // 📊 إنشاء الرسم البياني
    await logToExcel(userInputs, priceUSD, priceEGP); // 📝 تسجيل البيانات في Excel
})();
