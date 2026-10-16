/**
 * `?`: the keyboard map as an overlay (24.3). One table, learnable, the same
 * for everyone: there are no custom bindings to look up.
 */
import { X } from "lucide-react";

import { IconButton } from "../ui/IconButton.js";
import { KEY_TABLE } from "./actions.js";

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="fixed left-1/2 top-1/2 z-modal w-[520px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-surface-2 shadow-modal"
      >
        <header className="flex h-11 items-center border-b border-hairline px-4">
          <span className="flex-1 text-title text-primary">Keyboard shortcuts</span>
          <IconButton icon={X} label="Close" control onClick={onClose} />
        </header>
        <table className="w-full text-body">
          <tbody>
            {KEY_TABLE.map((row) => (
              <tr key={row.keys} className="border-b border-hairline last:border-0">
                <td className="w-[180px] px-4 py-1.5 font-mono text-caption text-accent">{row.keys}</td>
                <td className="px-4 py-1.5 text-secondary">{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-caption leading-4 text-muted">
          Letter keys never fire while you are typing in a field. Everything else is in the palette, ⌘K.
        </p>
      </div>
    </>
  );
}
