import type { ReactElement } from "react";

import type { MessageAttachment } from "../model/message-view.js";

export type AttachmentListProps = {
  readonly attachments: readonly MessageAttachment[];
};

export const AttachmentList = ({
  attachments,
}: AttachmentListProps): ReactElement | null => {
  if (attachments.length === 0) return null;

  return (
    <div className="ml-[6.5rem] flex max-w-[58rem] flex-wrap gap-3">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 text-lg text-emerald-700 hover:bg-emerald-50"
          href={attachment.url}
          rel="noreferrer"
          target="_blank"
        >
          <span aria-hidden="true">PDF</span>
          <span>{attachment.name}</span>
        </a>
      ))}
    </div>
  );
};
