import { PageHeader } from "@/components/ui/misc";

// Placeholder: replaced by the tasks builder.
export default async function TaskDetailPage({ params }: PageProps<"/tasks/[ref]">) {
  const { ref } = await params;
  return <PageHeader title={`Task ${decodeURIComponent(ref).toUpperCase()}`} />;
}
