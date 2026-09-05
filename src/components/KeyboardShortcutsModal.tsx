"use client";

import { useEffect } from "react";
import { Command, Keyboard, Navigation, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ShortcutCategory = {
  title: string;
  icon: typeof Keyboard;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
};

const categories: ShortcutCategory[] = [
  {
    title: "General & Navigation",
    icon: Navigation,
    shortcuts: [
      { keys: ["⌘", "K"], description: "Open Command Palette & Global Search" },
      { keys: ["?"], description: "Show Keyboard Shortcuts Cheatsheet" },
      { keys: ["Esc"], description: "Close modal, drawer, or search palette" },
      { keys: ["Alt", "T"], description: "Toggle Light / Dark mode" },
      { keys: ["Alt", "H"], description: "Jump to Portal Dashboard" },
    ],
  },
  {
    title: "Workspaces & Records",
    icon: Command,
    shortcuts: [
      { keys: ["Alt", "A"], description: "Open Student Attendance Register" },
      { keys: ["Alt", "F"], description: "Open Fees & Invoices Workspace" },
      { keys: ["Alt", "G"], description: "Open Academic Gradebook" },
      { keys: ["Alt", "M"], description: "Open Messages & Broadcast Alerts" },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sn-shortcuts-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="sn-shortcuts-modal">
        <div className="sn-shortcuts-header">
          <div className="sn-shortcuts-title-wrap">
            <span className="sn-shortcuts-icon">
              <Keyboard size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
              <p>Navigate SukuuNova at lightning speed</p>
            </div>
          </div>
          <button
            type="button"
            className="sn-shortcuts-close"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="sn-shortcuts-body">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.title} className="sn-shortcuts-category">
                <div className="sn-shortcuts-category-title">
                  <Icon size={14} aria-hidden="true" />
                  <span>{cat.title}</span>
                </div>
                <div className="sn-shortcuts-list">
                  {cat.shortcuts.map((sc, idx) => (
                    <div key={idx} className="sn-shortcuts-row">
                      <span className="sn-shortcuts-desc">{sc.description}</span>
                      <div className="sn-shortcuts-keys">
                        {sc.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="sn-kbd">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sn-shortcuts-footer">
          <span>Tip: Press <kbd className="sn-kbd">?</kbd> anywhere in the app to toggle this cheatsheet.</span>
        </div>
      </div>
    </div>
  );
}
