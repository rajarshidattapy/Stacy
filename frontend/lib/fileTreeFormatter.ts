import { FileNode } from "@/types/ide";

/**
 * Formats a file tree into a string representation with file extensions
 * for use in AI prompts
 */
export function formatFileTreeWithExtensions(
  tree: FileNode[],
  indent: string = "",
  parentPath: string = ""
): string {
  const lines: string[] = [];

  for (const node of tree) {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.type === "file") {
      // Extract extension from filename
      const extension = node.name.includes(".")
        ? node.name.split(".").pop()?.toLowerCase() || ""
        : "";
      lines.push(`${indent}${node.name} [path: ${fullPath}] (${extension || "no ext"})`);
    } else {
      lines.push(`${indent}${node.name}/`);
      if (node.children && node.children.length > 0) {
        lines.push(...formatFileTreeWithExtensions(node.children, indent + "  ", fullPath));
      }
    }
  }

  return lines.join("\n");
}

/**
 * Gets the language/type from a file path
 */
export function getFileLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";
  
  const languageMap: Record<string, string> = {
    rs: "Rust",
    toml: "TOML",
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    json: "JSON",
    md: "Markdown",
    css: "CSS",
    html: "HTML",
    py: "Python",
    go: "Go",
    java: "Java",
    cpp: "C++",
    c: "C",
  };

  return languageMap[extension] || extension.toUpperCase() || "Text";
}
