import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import readline from 'readline';

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
    
    const rawYs = [[50000], [120000], [70000], [150000], [85000], [60000], [200000], [45000], [95000]];
    
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
    
    const area = await askQuestion("📏 Enter construction area (m²): ");
    const type = await askQuestion("🏠 Enter building type (1: Residential, 2: Pump Station, 3: Bridge): ");
    const floors = await askQuestion("🏢 Enter number of floors: ");
    const duration = await askQuestion("📅 Enter permit duration (years): ");
    const distance = await askQuestion("🌊 Enter distance from waterway (m): ");
    const soilType = await askQuestion("🛠️ Enter soil type (1: Rocky, 2: Clay, 3: Sandy): ");
    const materialCost = await askQuestion("💰 Enter material cost per m²: ");
    const year = await askQuestion("📆 Enter application year: ");
    
    rl.close();
    return [parseFloat(area), parseInt(type), parseInt(floors), parseInt(duration), parseInt(distance), parseInt(soilType), parseFloat(materialCost), parseInt(year)];
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
}

runModel().catch(console.error);
