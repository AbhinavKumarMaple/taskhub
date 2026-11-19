import { PageHeader } from "@/components/ui/misc";

// Placeholder: replaced by the decisions builder.
export default async function DecisionDetailPage({ params }: PageProps<"/decisions/[ref]">) {
  const { ref } = await params;
  return <PageHeader title={`Decision ${decodeURIComponent(ref).toUpperCase()}`} />;
}
