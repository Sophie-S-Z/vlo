import type { Editor } from '@tiptap/core';
import { useEffect, useId, useRef, useState } from 'react';
import { newId } from '@/lib/ids';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Segmented } from '@/ui/segmented';
import { Textarea } from '@/ui/textarea';
import {
  IMAGE_ALIGNS,
  imageAttrs,
  imagePos,
  selectedImage,
  storeImageFile,
  type ImageAlign,
  type ImageAttrs,
  type ImageWidth,
} from '@/features/editor/extensions/image';
import { IMAGE_TYPES } from './resize';

/*
 * The image panel (Phase 16, decisions G4 and G2). With no image selected, it asks for a file. With an
 * image selected, it asks for the alt text, or "Decorative", and offers a caption, a size and a place.
 * The changes go into the text when the panel closes, as one step that Undo takes back.
 */

const WIDTHS: { value: `${ImageWidth}`; label: string }[] = [
  { value: '33', label: 'Small' },
  { value: '50', label: 'Medium' },
  { value: '75', label: 'Large' },
  { value: '100', label: 'Full width' },
];

const ALIGN_LABELS: Readonly<Record<ImageAlign, string>> = { left: 'Left', center: 'Center', right: 'Right' };

type Fields = Omit<ImageAttrs, 'id'>;

function fieldsOf(attrs: Record<string, unknown> | undefined): Fields {
  const { alt, decorative, caption, width, align } = imageAttrs(attrs);
  return { alt, decorative, caption, width, align };
}

function sameFields(a: Fields, b: Fields): boolean {
  return (
    a.alt === b.alt &&
    a.decorative === b.decorative &&
    a.caption === b.caption &&
    a.width === b.width &&
    a.align === b.align
  );
}

function ChooseImage({ editor, projectId }: { editor: Editor; projectId: string | null }) {
  const inputId = useId();
  if (projectId === null)
    return <p className="text-sm text-muted">Open an item of a project to add an image.</p>;
  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        Choose an image file
      </label>
      <input
        id={inputId}
        type="file"
        accept={['image/*', ...IMAGE_TYPES].join(',')}
        className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-rule file:bg-surface file:px-3 file:text-text"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const id = newId();
          if (!editor.commands.insertImage({ id })) return;
          storeImageFile(projectId, file, id);
        }}
      />
      <p className="text-xs text-muted">
        You can also drop an image file on the text, or paste one. Vlo keeps a copy of at most 2,400 pixels on
        its long side, on this device. The copy holds no camera data, such as the place of a photo.
      </p>
    </div>
  );
}

function ImageFields({ editor, id, onDone }: { editor: Editor; id: string; onDone: () => void }) {
  const altId = useId();
  const captionId = useId();
  const decorativeId = useId();
  const hintId = useId();
  const [fields, setFields] = useState<Fields>(() => {
    const pos = imagePos(editor.state.doc, id);
    return fieldsOf(pos === null ? undefined : editor.state.doc.nodeAt(pos)?.attrs);
  });
  const latest = useRef(fields);

  // The fields go into the text when the panel closes, by Done, Escape or a click outside.
  useEffect(
    () => () => {
      if (editor.isDestroyed) return;
      const pos = imagePos(editor.state.doc, id);
      const node = pos === null ? null : editor.state.doc.nodeAt(pos);
      if (pos === null || !node) return;
      const before = fieldsOf(node.attrs);
      const next = { ...latest.current, alt: latest.current.decorative ? '' : latest.current.alt.trim() };
      if (!sameFields(before, next)) editor.commands.setImageAttrs(pos, next);
    },
    [editor, id],
  );

  const change = (part: Partial<Fields>) => {
    const next = { ...latest.current, ...part };
    latest.current = next;
    setFields(next);
  };
  const noAlt = !fields.decorative && fields.alt.trim() === '';

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor={altId} className="text-sm font-medium">
          Alt text
        </label>
        <Textarea
          id={altId}
          value={fields.alt}
          disabled={fields.decorative}
          rows={3}
          aria-describedby={hintId}
          onChange={(event) => {
            change({ alt: event.target.value });
          }}
        />
        <p id={hintId} className="text-xs text-muted">
          {noAlt
            ? 'Say what the image shows, for a reader who cannot see it. Exports and share links use it.'
            : 'Exports and share links give this text to readers who cannot see the image.'}
        </p>
        <label
          htmlFor={decorativeId}
          className="flex min-h-11 items-center gap-2 text-sm pointer-fine:min-h-9"
        >
          <input
            id={decorativeId}
            type="checkbox"
            checked={fields.decorative}
            onChange={(event) => {
              change({ decorative: event.target.checked });
            }}
            className="size-4 accent-[var(--accent)]"
          />
          Decorative: the image adds nothing that the words do not say
        </label>
      </div>
      <div className="grid gap-2">
        <label htmlFor={captionId} className="text-sm font-medium">
          Caption (optional)
        </label>
        <Input
          id={captionId}
          value={fields.caption}
          onChange={(event) => {
            change({ caption: event.target.value });
          }}
        />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Size</span>
        <Segmented
          label="Size"
          options={WIDTHS}
          value={String(fields.width) as `${ImageWidth}`}
          onChange={(value) => {
            change({ width: Number(value) as ImageWidth });
          }}
        />
      </div>
      {fields.width < 100 && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Place</span>
          <Segmented
            label="Place"
            options={IMAGE_ALIGNS.map((value) => ({ value, label: ALIGN_LABELS[value] }))}
            value={fields.align}
            onChange={(align) => {
              change({ align });
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted">
        Drag the image to move it, or select it and press Alt with an arrow key.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            const pos = imagePos(editor.state.doc, id);
            const node = pos === null ? null : editor.state.doc.nodeAt(pos);
            if (pos !== null && node) editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
            onDone();
          }}
        >
          Remove image
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export function ImagePanel({
  editor,
  projectId,
  onDone,
}: {
  editor: Editor;
  projectId: string | null;
  onDone: () => void;
}) {
  const [id, setId] = useState<string | null>(() => {
    const pos = selectedImage(editor.state);
    return pos === null ? null : imageAttrs(editor.state.doc.nodeAt(pos)?.attrs).id;
  });
  // A file chosen here goes in as a selected image, and the panel then asks for its alt text.
  useEffect(() => {
    if (id !== null) return;
    const take = () => {
      const pos = selectedImage(editor.state);
      if (pos !== null) setId(imageAttrs(editor.state.doc.nodeAt(pos)?.attrs).id);
    };
    editor.on('transaction', take);
    return () => {
      editor.off('transaction', take);
    };
  }, [editor, id]);
  return id === null ? (
    <ChooseImage editor={editor} projectId={projectId} />
  ) : (
    <ImageFields key={id} editor={editor} id={id} onDone={onDone} />
  );
}
