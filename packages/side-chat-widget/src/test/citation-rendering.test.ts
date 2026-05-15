import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Citations } from "../components/ai-elements/citation.js";
import {
  getMetadataAttachments,
  inferInlineSourcesFromContent,
  mergeAttachments,
  parseCitationMetadata,
  selectInlineSources,
} from "../SideChatWidget.js";

describe("Citation rendering", () => {
  it("renders source labels as citation chips", () => {
    const html = renderToStaticMarkup(
      createElement(Citations, {
        sources: [
          {
            sourceId: "client_portfolio_review:review-ackermann-family-office",
            label: "Client Portfolio Review · Ackermann Family Office",
            dataset: "client_portfolio_review",
            rowId: "review-ackermann-family-office",
          },
        ],
      }),
    );

    expect(html).toContain("Answer sources");
    expect(html).toContain("Client Portfolio Review");
    expect(html).toContain("Ackermann Family Office");
  });

  it("selects up to two sources named by the assistant answer", () => {
    const sources = [
      {
        sourceId: "client_portfolio_review:review-ackermann-family-office",
        label: "Client Portfolio Review · Ackermann Family Office",
        dataset: "client_portfolio_review",
        rowId: "review-ackermann-family-office",
      },
      {
        sourceId: "client_portfolio_review:review-bauhaus-enterprises-ag",
        label: "Client Portfolio Review · Bauhaus Enterprises AG",
        dataset: "client_portfolio_review",
        rowId: "review-bauhaus-enterprises-ag",
      },
    ];

    expect(
      selectInlineSources(
        "Top clients are Ackermann Family Office and Bauhaus Enterprises AG.",
        sources,
      ),
    ).toEqual(sources);
  });

  it("keeps a one-source fallback when no source row is named", () => {
    const sources = [
      {
        sourceId: "client_portfolio_review:review-ackermann-family-office",
        label: "Client Portfolio Review · Ackermann Family Office",
        dataset: "client_portfolio_review",
        rowId: "review-ackermann-family-office",
      },
      {
        sourceId: "client_portfolio_review:review-bauhaus-enterprises-ag",
        label: "Client Portfolio Review · Bauhaus Enterprises AG",
        dataset: "client_portfolio_review",
        rowId: "review-bauhaus-enterprises-ag",
      },
    ];

    expect(selectInlineSources("Top clients are concentrated.", sources)).toEqual([
      sources[0],
    ]);
  });

  it("does not fall back to current surface row sources for generic replies", () => {
    const sources = [
      {
        sourceId: "advisoryWorklist:review-redwood-pharma-ag",
        label: "Portfolio Worklist Â· Redwood Pharma AG",
        dataset: "client_portfolio_review",
        resourceId: "advisoryWorklist",
        rowId: "review-redwood-pharma-ag",
      },
    ];

    expect(selectInlineSources("Hello! How can I help?", sources)).toEqual([]);
  });

  it("keeps current surface row sources when the reply names the row", () => {
    const sources = [
      {
        sourceId: "advisoryWorklist:review-redwood-pharma-ag",
        label: "Portfolio Worklist Â· Redwood Pharma AG",
        dataset: "client_portfolio_review",
        resourceId: "advisoryWorklist",
        rowId: "review-redwood-pharma-ag",
      },
    ];

    expect(
      selectInlineSources(
        "Redwood Pharma AG is the first overdue portfolio to review.",
        sources,
      ),
    ).toEqual(sources);
  });

  it("extracts persisted citation metadata from reloaded answer text", () => {
    const persisted =
      "Answer text.\n\n<!-- sidechat-citations:%5B%7B%22sourceId%22%3A%22client_portfolio_review%3Areview-ackermann-family-office%22%2C%22label%22%3A%22Client%20Portfolio%20Review%20%C2%B7%20Ackermann%20Family%20Office%22%2C%22dataset%22%3A%22client_portfolio_review%22%2C%22rowId%22%3A%22review-ackermann-family-office%22%7D%5D -->";

    expect(parseCitationMetadata(persisted)).toEqual({
      content: "Answer text.",
      sources: [
        {
          sourceId: "client_portfolio_review:review-ackermann-family-office",
          label: "Client Portfolio Review · Ackermann Family Office",
          dataset: "client_portfolio_review",
          rowId: "review-ackermann-family-office",
        },
      ],
    });
  });

  it("recovers a citation from reloaded assistant text when metadata is missing", () => {
    expect(
      inferInlineSourcesFromContent(
        "Your biggest client by AUM is Ackermann Family Office with CHF 3.43B (shown in the Client Portfolio Review table).",
      ),
    ).toEqual([
      {
        sourceId: "client_portfolio_review:review-ackermann-family-office",
        label: "Client Portfolio Review · Ackermann Family Office",
        dataset: "client_portfolio_review",
        rowId: "review-ackermann-family-office",
      },
    ]);
  });

  it("recovers two risk citations from reloaded assistant text", () => {
    expect(
      inferInlineSourcesFromContent(
        "High-priority clients in Top Risk Accounts: Global MedTech Inc. and Jasper Retail Group.",
      ),
    ).toEqual([
      {
        sourceId: "top_risk_accounts:risk-global-medtech-liquidity-gap",
        label: "Top Risk Accounts · Global MedTech Inc.",
        dataset: "top_risk_accounts",
        rowId: "risk-global-medtech-liquidity-gap",
      },
      {
        sourceId: "top_risk_accounts:risk-jasper-retail-credit-concentration",
        label: "Top Risk Accounts · Jasper Retail Group",
        dataset: "top_risk_accounts",
        rowId: "risk-jasper-retail-credit-concentration",
      },
    ]);
  });

  it("renders persisted report attachments from message metadata", () => {
    expect(
      getMetadataAttachments(
        {
          attachments: [
            {
              id: "tool-report-1",
              name: "Workbench report.pdf",
              url: "/reports/report-1.pdf",
              mediaType: "application/pdf",
            },
          ],
        },
        "http://127.0.0.1:3000/chat/stream",
      ),
    ).toEqual([
      {
        id: "tool-report-1",
        name: "Workbench report.pdf",
        url: "http://127.0.0.1:3000/reports/report-1.pdf",
        mediaType: "application/pdf",
      },
    ]);
  });

  it("deduplicates live tool and completed metadata attachments", () => {
    expect(
      mergeAttachments([
        {
          id: "tool-report-1",
          name: "Security / Risk Review.pdf",
          url: "http://127.0.0.1:3000/reports/report-1.pdf",
          mediaType: "application/pdf",
        },
        {
          id: "tool-report-1",
          name: "Security / Risk Review.pdf",
          url: "http://127.0.0.1:3000/reports/report-1.pdf",
          mediaType: "application/pdf",
        },
      ]),
    ).toEqual([
      {
        id: "tool-report-1",
        name: "Security / Risk Review.pdf",
        url: "http://127.0.0.1:3000/reports/report-1.pdf",
        mediaType: "application/pdf",
      },
    ]);
  });
});
