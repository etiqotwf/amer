import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import readline from 'readline';

const MODEL_FILE = 'model.json';
const WEIGHTS_FILE = 'weights.bin';
const NORMALIZATION_FILE = 'normalization.json';
const LEARNING_RATE = 0.01;
const EPOCHS = 100;
const DISCOUNT_FACTOR = 0.95;
const EPSILON = 0.1;
const REPLAY_BUFFER_SIZE = 100;
const BATCH_SIZE = 10;

let replayBuffer = [];

function modelExists() {
    return fs.existsSync(MODEL_FILE) && fs.existsSync(WEIGHTS_FILE) && fs.existsSync(NORMALIZATION_FILE);
}

function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [8] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));
    model.compile({ optimizer: tf.train.adam(LEARNING_RATE), loss: 'meanSquaredError' });
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
    }));
}

async function loadModel() {
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

function storeExperience(state, actualCost) {
    replayBuffer.push({ state, actualCost });
    if (replayBuffer.length > REPLAY_BUFFER_SIZE) replayBuffer.shift();
}

async function reinforcementLearning(model, userInput, actualCost, normalizationParams) {
    if (Math.random() < EPSILON) return;

    storeExperience(userInput, actualCost);

    if (replayBuffer.length < BATCH_SIZE) return;

    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
        batch.push(replayBuffer[Math.floor(Math.random() * replayBuffer.length)]);
    }

    tf.tidy(() => {
        const inputs = batch.map(({ state }) =>
            normalizeData(state, normalizationParams.minInput, normalizationParams.maxInput)
        );
        const targets = batch.map(({ actualCost }) =>
            [(actualCost - normalizationParams.minOutput) / (normalizationParams.maxOutput - normalizationParams.minOutput)]
        );

        const inputTensor = tf.tensor2d(inputs);
        const targetTensor = tf.tensor2d(targets);

        model.fit(inputTensor, targetTensor, { epochs: 10 });
    });

    await saveModel(model, normalizationParams);
}

async function askUserForInputs() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    function askQuestion(question) {
        return new Promise(resolve => rl.question(question, answer => resolve(parseFloat(answer) || 0)));
    }
    
    const questions = [
        "📏 Enter construction area (m²): ",
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
        rl.question("💰 input actualCost ", answer => {
            rl.close();
            resolve(parseFloat(answer) || 0);
        });
    });
}

async function runModel() {
    let model, normalizationParams;
    if (modelExists()) {
        ({ model, normalizationParams } = await loadModel());
    } else {
        model = createModel();
        normalizationParams = await trainModel(model);
    }
    
    const userInput = await askUserForInputs();
    if (userInput.includes(undefined) || userInput.includes(NaN)) {
        console.error("❌ Error: Invalid user input.");
        return;
    }

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
    console.log(`🔮 Predicted cost: ${predictedCost.toFixed(2)} EGP`);

    const actualCost = await askForActualCost();
    await reinforcementLearning(model, userInput, parseFloat(actualCost), normalizationParams);
}

runModel().catch(console.error);
