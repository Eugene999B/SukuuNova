export function ListCard({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sn-list-card">
      <header className="sn-list-card-head">
        <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
        {action ? <div>{action}</div> : null}
      </header>
      <div className="sn-list-card-body">{children}</div>
    </section>
  );
}
