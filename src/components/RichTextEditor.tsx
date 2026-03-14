import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link as LinkIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

const COLORS = ["#ffffff", "#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316"];

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("URL do link:");
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const btn = (active: boolean) =>
    `h-7 w-7 p-0 ${active ? "bg-accent text-accent-foreground" : ""}`;

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-3.5 w-3.5" /></Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("link"))} onClick={setLink}><LinkIcon className="h-3.5 w-3.5" /></Button>
        {editor.isActive("link") && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 p-0" onClick={() => editor.chain().focus().unsetLink().run()}><Unlink className="h-3.5 w-3.5" /></Button>
        )}

        <div className="mx-1 h-5 w-px bg-border" />

        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="h-5 w-5 rounded-sm border border-input"
            style={{ backgroundColor: c }}
            onClick={() => editor.chain().focus().setColor(c).run()}
          />
        ))}
      </div>
      <EditorContent editor={editor} className="prose prose-sm prose-invert max-w-none p-3 min-h-[150px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[150px] [&_a]:text-primary [&_a]:underline" />
    </div>
  );
}
