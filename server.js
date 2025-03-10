import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import { exec } from "child_process";


const app = express();
const PORT = 3000;
let serverUrl = ""; // Will be updated dynamically

// ✅ Fetch GitHub token from environment variable
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    console.error("❌ GitHub token not found in environment variables!");
    process.exit(1);
}

// ✅ Enable CORS for all origins
app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// 🔗 Retrieve server URL
app.get("/ngrok-url", (req, res) => {
    if (serverUrl) {
        res.json({ serverUrl });
    } else {
        res.status(500).json({ message: "ngrok has not started yet!" });
    }
});

// 📥 Receive data and save to file
app.post("/submit", (req, res) => {
    const { name, phone, date, startTime, timeTaken, score } = req.body;
    const maxScore = 50;
    const numericScore = parseFloat(score);

    // ✅ Validate score value
    if (isNaN(numericScore) || numericScore < 0 || numericScore > maxScore) {
        return res.status(400).json({ message: "❌ Invalid score value!" });
    }

    const percentage = ((numericScore / maxScore) * 100).toFixed(2) + "%";
    const logEntry = `🧑 Name       : ${name}\n📞 Phone     : ${phone}\n📅 Date      : ${date}\n⏰ Start Time: ${startTime}\n⏳ Time Taken: ${timeTaken}\n🏆 Score     : ${numericScore}/${maxScore} (${percentage})\n-----------------------------------\n`;

    console.log("📥 Data received:");
    console.log(logEntry);

    fs.appendFile("data.txt", logEntry, (err) => {
        if (err) {
            console.error("❌ Error saving data:", err);
            return res.status(500).json({ message: "❌ Error saving data!" });
        }
        console.log("✅ Data saved to data.txt");
    });

    res.json({ message: "✅ Data received successfully!", receivedData: { ...req.body, percentage } });
});

// 🚀 Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);

    // ✅ Ensure ngrok is not already running before restarting it
    exec("pgrep -f 'ngrok' && pkill -f 'ngrok'", () => {
        exec("ngrok http 3000 --log=stdout", (err, stdout, stderr) => {
            if (err) {
                console.error("❌ Error starting ngrok:", err);
                return;
            }
            console.log("✅ ngrok started successfully!");
        });

        // ⏳ Wait 5 seconds then fetch ngrok URL
        setTimeout(() => {
            exec("curl -s http://127.0.0.1:4040/api/tunnels", (err, stdout, stderr) => {
                if (err || !stdout) {
                    console.log("⚠️ Failed to fetch ngrok URL using curl. Trying PowerShell.");
                    exec("powershell -Command \"(Invoke-WebRequest -Uri 'http://127.0.0.1:4040/api/tunnels' -UseBasicParsing).Content\"", (psErr, psStdout, psStderr) => {
                        if (psErr || !psStdout) {
                            console.error("❌ Error fetching ngrok URL:", psErr || psStderr);
                            return;
                        }
                        processNgrokResponse(psStdout);
                    });
                } else {
                    processNgrokResponse(stdout);
                }
            });
        }, 5000);
    });
});

function processNgrokResponse(response) {
    try {
        const tunnels = JSON.parse(response);
        serverUrl = tunnels.tunnels[0]?.public_url;

        if (serverUrl) {
            console.log(`✅ Server is available at: 🔗 ${serverUrl}`);
            fs.writeFileSync("serverUrl.json", JSON.stringify({ serverUrl }));

            // 📤 Automatically push `serverUrl.json` to GitHub
            pushToGitHub();

        } else {
            console.log("⚠️ No ngrok URL found.");
        }
    } catch (parseError) {
        console.error("❌ Error parsing ngrok response:", parseError);
    }
}

import { spawn } from "child_process";

function runCommand(command, args, callback) {
    const process = spawn(command, args);

    process.stdout.on("data", (data) => console.log(`stdout: ${data}`));
    process.stderr.on("data", (data) => console.error(`stderr: ${data}`));

    process.on("close", (code) => {
        if (code !== 0) return console.error(`❌ Command failed: ${command} ${args.join(" ")}`);
        callback();
    });
}

function pushToGitHub() {
    console.log("📤 Pushing updates to GitHub...");

    runCommand("git", ["add", "."], () => {
        runCommand("git", ["commit", "-m", "Auto update"], () => {
            runCommand("git", ["push", `https://etiqotwf:${GITHUB_TOKEN}@github.com/etiqotwf/amer.git`, "main"], () => {
                console.log("✅ All changes successfully pushed to GitHub!");
            });
        });
    });
}

