"use client";

import CommunicationCommandCenterV2 from "./CommunicationCommandCenterV2";

type Props = React.ComponentProps<typeof CommunicationCommandCenterV2>;

export default function CommunicationCommandCenter(props: Props) {
  return (
    <>
      <style jsx global>{`
        .sukuu-communication button[type="submit"] {
          background-color: var(--color-text-primary) !important;
          color: var(--color-surface) !important;
          border-color: var(--color-text-primary) !important;
        }
        .sukuu-communication button[type="submit"]:hover:not(:disabled) {
          background-color: var(--color-surface-raised) !important;
        }
        .sukuu-communication button[type="submit"]:disabled {
          opacity: 0.5;
        }
      `}</style>
      <div className="sukuu-communication">
        <CommunicationCommandCenterV2 {...props} />
      </div>
    </>
  );
}
