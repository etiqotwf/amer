const { execSync } = require('child_process');
const readline = require('readline');
const { createCanvas } = require('canvas');
const fs = require('fs');
const Chart = require('chart.js/auto');
const asciichart = require('asciichart');

// التحقق من تثبيت Node.js
try {
    execSync('node -v', { stdio: 'ignore' });
    console.log("✅ Node.js is installed.");
} catch (error) {
    console.log("❌ Node.js is not installed. Please install it first.");
    process.exit(1);
}

// قائمة المكتبات المطلوبة
const requiredPackages = ['canvas', 'chart.js', 'asciichart'];

// التحقق من المكتبات وتثبيتها إن لزم الأمر
function checkAndInstallPackages(packages) {
    packages.forEach(pkg => {
        try {
            require.resolve(pkg);
            console.log(`✅ Package "${pkg}" is already installed.`);
        } catch (e) {
            console.log(`⚠️ Package "${pkg}" is not installed. Installing now...`);
            execSync(`npm install ${pkg} --legacy-peer-deps`, { stdio: 'inherit' });
            console.log(`✅ Package "${pkg}" installed successfully.`);
        }
    });
}

// تشغيل التحقق قبل بدء البرنامج
checkAndInstallPackages(requiredPackages);

// واجهة إدخال البيانات
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// تحديد نوع التربة
function getSoilType(silt, clay, sand) {
    if ((silt + 1.5 * clay) < 15) return "SAND";
    if ((silt + 1.5 * clay >= 15) && (silt + 2 * clay < 30)) return "LOAMY SAND";
    if ((clay >= 7 && clay < 20) && (sand > 52) && ((silt + 2 * clay) >= 30)) return "SANDY LOAM";
    if ((clay >= 7 && clay < 27) && (silt >= 28 && silt < 50) && (sand <= 52)) return "LOAM";
    if ((silt >= 50 && (clay >= 12 && clay < 27)) || ((silt >= 50 && silt < 80) && clay < 12)) return "SILT LOAM";
    if (silt >= 80 && clay < 12) return "SILT";
    if ((clay >= 20 && clay < 35) && (silt < 28) && (sand > 45)) return "SANDY CLAY LOAM";
    if ((clay >= 27 && clay < 40) && (sand > 20 && sand <= 45)) return "CLAY LOAM";
    if ((clay >= 27 && clay < 40) && (sand <= 20)) return "SILTY CLAY LOAM";
    if (clay >= 35 && sand > 45) return "SANDY CLAY";
    if (clay >= 40 && silt >= 40) return "SILTY CLAY";
    if (clay >= 40 && sand <= 45 && silt < 40) return "CLAY";
    return "UNKNOWN";
}

// طلب إدخال المستخدم
rl.question('Enter the sand percentage (sand) in %: ', (sand) => {
    rl.question('Enter the clay percentage (clay) in %: ', (clay) => {
        let silt = 100 - (parseFloat(sand) + parseFloat(clay));

        if (silt < 0 || silt > 100) {
            console.log('❌ Invalid percentages! The sum of sand and clay should not exceed 100%.');
            rl.close();
            return;
        }

        let soilType = getSoilType(silt, clay, sand);

        console.log(`📌 Silt Percentage: ${silt.toFixed(2)}%`);
        console.log(`🌱 Soil Type: ${soilType}`);

        // **🎨 الرسم البياني في التيرمينال**
        let chartData = [parseFloat(sand), parseFloat(clay), parseFloat(silt)];
        console.log("\n📊 Soil Composition Chart in Terminal:");
        console.log(asciichart.plot(chartData, { height: 10 }));

        // **📸 إنشاء الرسم البياني كصورة**
        const width = 1200, height = 900;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sand', 'Clay', 'Silt'],
                datasets: [{
                    label: 'Soil Composition (%)',
                    data: chartData,
                    backgroundColor: ['#3498db', '#e74c3c', '#f1c40f'],
                    borderColor: ['#2980b9', '#c0392b', '#f39c12'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `Soil Type: ${soilType}`,
                        font: { size: 24, weight: 'bold' },
                        color: '#000',
                        padding: 20
                    },
                    legend: { display: false },
                    tooltip: { enabled: true },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: '#000',
                        font: { weight: 'bold', size: 16 },
                        formatter: (value) => `${value}%`
                    }
                }
            }
        });

        const filePath = 'soil_chart.png';

        // حذف الملف السابق إن وجد
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // حفظ الصورة الجديدة
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filePath, buffer);

        console.log('📸 Soil composition chart saved as "soil_chart.png"');

        // فتح الصورة تلقائيًا
        execSync(`start ${filePath}`, { stdio: 'ignore' });

        rl.close();
    });
});
