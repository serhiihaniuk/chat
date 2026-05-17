import type { Hono } from "hono";

import { readGeneratedReport } from "#adapters/reports/playwright-report.js";
import { reportStore } from "../composition/report-store.js";

/**
 * Report artifact route. The chat stream only emits report metadata; this route
 * serves the generated PDF bytes when the widget opens the attachment.
 */
export const registerReportRoutes = (app: Hono) => {
  app.get("/reports/:fileName", async (c) => {
    const fileName = c.req.param("fileName");
    const file = await readGeneratedReport(reportStore, fileName);
    if (!file) return c.text("Report not found", 404);

    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
};
