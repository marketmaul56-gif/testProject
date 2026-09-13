import Link from "next/link";
import type { ReactNode } from "react";

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <>
    <nav>
      <strong>Skill Learning</strong>
      <Link href={`/t/${tenantId}/learn`}>Learn</Link>
      <Link href={`/t/${tenantId}/instructor`}>Instructor</Link>
    </nav>
    {children}
  </>;
}
