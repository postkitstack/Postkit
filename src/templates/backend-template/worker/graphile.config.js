/** @type {import('graphile-config').GraphileConfig} */
const config = {
  worker: {
    connectionString: process.env.DATABASE_URL,
    concurrentJobs: 5,
    fileExtensions: [".js"],
    taskDirectory: "build/tasks",
    crontabFile: "crontab",
  },
};

module.exports = config;