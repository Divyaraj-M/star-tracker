/*
 * Forked from Base Board (https://github.com/mderazon/obsidian-base-board)
 * Copyright (c) 2026 Michael DeRazon. MIT License. See LICENSE-BASE-BOARD.
 * Modified for Star Tracker.
 */
import { Modal, App, Setting, Notice } from "obsidian";

// ---------------------------------------------------------------------------
//  Simple input modal (for column names, etc.)
// ---------------------------------------------------------------------------

export class InputModal extends Modal {
  private value = "";
  private onSubmit: (value: string) => void;
  private title: string;
  private placeholder: string;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    onSubmit: (value: string) => void,
    initialValue?: string,
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    if (initialValue) {
      this.value = initialValue;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    new Setting(contentEl).setName("Name").addText((text) => {
      text.setPlaceholder(this.placeholder);
      if (this.value) {
        text.setValue(this.value);
      }
      text.onChange((v) => (this.value = v));
      // Focus and handle Enter key
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.submit();
          }
        });
      }, 50);
    });

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Add")
        .setCta()
        .onClick(() => this.submit());
    });
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed) {
      this.onSubmit(trimmed);
    }
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  WIP Limit modal (set/remove per-column WIP limits)
// ---------------------------------------------------------------------------

export class WipLimitModal extends Modal {
  private columnName: string;
  private currentLimit: number | null;
  private onSubmit: (limit: number | null) => void;
  private value = "";

  constructor(
    app: App,
    columnName: string,
    currentLimit: number | null,
    onSubmit: (limit: number | null) => void,
  ) {
    super(app);
    this.columnName = columnName;
    this.currentLimit = currentLimit;
    this.onSubmit = onSubmit;
    this.value = currentLimit !== null ? String(currentLimit) : "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: `WIP limit: ${this.columnName}` });

    new Setting(contentEl)
      .setName("Maximum cards")
      .setDesc("Leave empty to remove the limit")
      .addText((text) => {
        text.setPlaceholder("E.g. 5");
        if (this.currentLimit !== null) {
          text.setValue(String(this.currentLimit));
        }
        text.onChange((v) => (this.value = v));
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              this.submit();
            }
          });
        }, 50);
      });

    new Setting(contentEl).addButton((btn) => {
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => this.submit());
    });

    if (this.currentLimit !== null) {
      new Setting(contentEl).addButton((btn) => {
        btn.setButtonText("Remove limit").onClick(() => {
          this.onSubmit(null);
          this.close();
        });
      });
    }
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed === "") {
      this.onSubmit(null);
    } else {
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num <= 0) {
        new Notice("Wip limit must be a positive number.");
        return;
      }
      this.onSubmit(num);
    }
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
//  "Create new board" modal
// ---------------------------------------------------------------------------
