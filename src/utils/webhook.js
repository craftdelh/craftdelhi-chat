import { exec } from "child_process";

const PROJECT_DIR = "/home/ubuntu/craft-delhi/craftdelhi-chat";

const runCommand = (command) => {
    return new Promise((resolve, reject) => {
        exec(
            command,
            {
                cwd: PROJECT_DIR,
                shell: "/bin/bash",
                maxBuffer: 10 * 1024 * 1024,
                env: {
                    ...process.env,
                    PATH: "/home/ubuntu/.nvm/versions/node/v24.21.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
                }
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
        console.log("📥 Pulling latest code...");
        await runCommand("git pull origin main");

        console.log("📦 Running npm ci...");
        await runCommand("npm ci");

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