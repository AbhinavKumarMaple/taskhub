import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/** Renders GitHub-flavoured markdown with the `.md` styles (globals.css). Works in Server and Client Components. */
export function Markdown({ children, className, empty }: { children: string | null | undefined; className?: string; empty?: string }) {
  const text = children?.trim() ?? "";
  if (!text) return empty ? <p className={cn("text-[13px] text-fg-subtle italic", className)}>{empty}</p> : null;
  return (
    <div className={cn("md text-[13px] leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
              {c}
            </a>
          ),
          input: (props) => <input {...props} disabled />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
