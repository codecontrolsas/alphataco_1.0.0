export function PortalPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {description && <p className="text-muted-foreground text-pretty">{description}</p>}
    </div>
  );
}
