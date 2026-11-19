import { PageHeader } from "@/components/ui/misc";

// Placeholder: replaced by the documents builder.
export default async function DocumentDetailPage({ params }: PageProps<"/documents/[ref]">) {
  const { ref } = await params;
  return <PageHeader title={`Document ${decodeURIComponent(ref).toUpperCase()}`} />;
}
