import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ content }: { content: string }) {
  return <div className="markdown">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href, children }) => href && /^(?:https?:\/\/|mailto:)/i.test(href)
        ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
        : <span>{children}</span>,
      // Provider-generated image URLs must not trigger background requests.
      img: ({ alt }) => <span className="image-description">{alt || "Görsel"}</span>,
      table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    }}>{content}</Markdown>
  </div>;
}
