import { Suspense } from "react";
import CaseView from "@/components/CaseView";

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading...</p>}>
      <CaseLoader params={params} />
    </Suspense>
  );
}

async function CaseLoader({ params }: { params: PageProps<"/cases/[id]">["params"] }) {
  const { id } = await params;
  return <CaseView id={id} />;
}
