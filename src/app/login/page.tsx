import type { Metadata } from "next";
import { Suspense } from "react";
import { LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { safeNext } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  return <LoginForm next={next} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[340px] rounded-xl border border-border bg-surface p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent-solid text-accent-fg">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">Taskhub</h1>
            <p className="text-xs text-fg-muted">Sign in to continue</p>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-[104px]" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
