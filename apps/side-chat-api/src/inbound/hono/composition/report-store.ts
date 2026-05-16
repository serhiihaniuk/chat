import path from "node:path";

export const reportStore = {
  directory: path.resolve(process.cwd(), ".sidechat-reports"),
  publicBasePath:
    process.env.SIDE_CHAT_PUBLIC_REPORT_BASE_PATH ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}/reports`,
};
