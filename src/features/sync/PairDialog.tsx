import { useEffect, useId, useState } from 'react';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { pairingLink } from './pairing';
import type { Pairing } from './space';

/*
 * The pairing dialog (plan Task I7, decision R7): a QR code and the link for a new device. The `uqr`
 * package loads only here. The code is dark on white in every theme, so each camera reads it.
 */

function QrCode({ text }: { text: string }) {
  const [cells, setCells] = useState<boolean[][] | null>(null);
  useEffect(() => {
    let live = true;
    void import('uqr').then(({ encode }) => {
      if (live) setCells(encode(text, { border: 4 }).data);
    });
    return () => {
      live = false;
    };
  }, [text]);
  const size = cells?.length ?? 1;
  const path = (cells ?? [])
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${String(x)} ${String(y)}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      role="img"
      aria-label="QR code of the pairing link"
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      shapeRendering="crispEdges"
      className="size-56 justify-self-center bg-white"
    >
      <path d={path} fill="#000" />
    </svg>
  );
}

export function PairDialog({
  space,
  open,
  onOpenChange,
}: {
  space: Pairing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const link = pairingLink(space);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Add a device</DialogTitle>
        <DialogDescription>
          On your phone, scan this code with the camera. On a computer, open the link. Anyone with the link
          can read and change your projects until sync stops, so send it only to yourself.
        </DialogDescription>
        <QrCode text={link} />
        <div className="grid gap-1.5">
          <Label htmlFor={id}>Pairing link</Label>
          <div className="flex gap-2">
            <Input
              id={id}
              readOnly
              value={link}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
            <CopyButton text={link} label="Copy pairing link" />
          </div>
        </div>
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
