import type { ReactNode } from 'react';

type CollapsiblePanelProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function CollapsiblePanel({
  title,
  defaultOpen = true,
  children,
}: CollapsiblePanelProps) {
  return (
    <details className="panel collapsible-panel" open={defaultOpen}>
      <summary>
        <h2>{title}</h2>
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}
