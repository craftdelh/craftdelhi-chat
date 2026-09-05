import { exec } from "child_process";

const PROJECT_DIR = "/home/ubuntu/craftdelhi-github/craftdelhi-chat";

const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(
            command,
            {
                cwd: PROJECT_DIR,
                maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ ${command} failed:`, error);
                    console.error("STDOUT:", stdout);
                    console.error("STDERR:", stderr);

                    reject(error);
                    return;
                }

                console.log(`✅ ${command} completed`);
                console.log("STDOUT:", stdout);

                if (stderr) {
                    console.log("STDERR:", stderr);
                }

                resolve(stdout);
            }
        );
    });
};

const webhookHandler = async (req, res) => {
    console.log("✅ GitHub webhook triggered for chat!");

    try {
        // Step 1: Git pull
        console.log("📥 Pulling latest code...");
        await runCommand("git pull origin main");

        // Step 2: Install dependencies
        console.log("📦 Running npm ci...");
        await runCommand("npm ci");

        // Step 3: Restart PM2
        console.log("🚀 Restarting PM2...");
        await runCommand("pm2 restart chat-craftdelhi");

        console.log("✅ Deployment completed successfully");

        return res
            .status(200)
            .send("✅ Git pulled, npm ci done, server restarted");

    } catch (error) {
        console.error("❌ Deployment failed:", error);

        return res
            .status(500)
            .send("❌ Deployment failed");
    }
};

export default webhookHandler;